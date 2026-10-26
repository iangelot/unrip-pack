import { z } from "zod";
import crypto from "crypto";
import { PayBoxBridge } from "../services/payboxBridge.js";
import { CONFIG } from "../config.js";
import { hasLiveSettlement, liveSettlementUnavailable } from "../services/liveSettlement.js";
import { CollectorCryptApiService } from "../services/collectorCryptApi.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { verifyWalletSignedTransaction } from "../services/solanaTransaction.js";
function textResult(value) {
    return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
function verifiedSessionAddress(accountService, explicitAddress) {
    const connected = accountService.getActiveAddress();
    if (explicitAddress && explicitAddress.trim() !== connected) {
        throw new Error("The requested wallet must match the wallet verified for this MCP session.");
    }
    accountService.requireVerifiedOwner("sign Collector Crypt transactions");
    return connected;
}
export function registerGachaTools(server, ccService, solanaService, accountService, collectorCryptApi = new CollectorCryptApiService()) {
    // Pending transaction state is scoped to this MCP server/session. It stores no private key.
    const pendingTransactions = new Map();
    const pendingGiftClaims = new Map();
    server.tool("prepare_collector_crypt_gift_claim", "Prepare a Collector Crypt purchased/gifted pack claim. Returns a one-time challenge for the verified recipient wallet to sign; this does not move funds or open the pack.", { packType: z.string().min(1).max(80).describe("Pack type of the gift to claim"), userAddress: z.string().optional().describe("Must match the verified session wallet") }, async (args) => {
        try {
            const walletAddress = verifiedSessionAddress(accountService, args.userAddress);
            const challenge = await collectorCryptApi.generateGiftClaim({ publicKey: walletAddress, packType: args.packType });
            if (challenge.success !== true)
                throw new Error("Collector Crypt did not issue a valid gift claim challenge.");
            pendingGiftClaims.set(challenge.nonce, { walletAddress, messageToSign: challenge.messageToSign, packType: args.packType, nonce: challenge.nonce, createdAt: Date.now() });
            return textResult({ status: "AWAITING_WALLET_MESSAGE_SIGNATURE", sandbox: false, wallet: walletAddress, packType: args.packType,
                nonce: challenge.nonce, expiry: challenge.expiry, messageToSign: challenge.messageToSign,
                nextStep: "Ask the verified wallet to sign this exact message as a message (not a transaction), then pass its base58 signature and exact message to claim_collector_crypt_gift." });
        }
        catch (error) {
            return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
        }
    });
    server.tool("claim_collector_crypt_gift", "Verify the recipient wallet's signature over a fresh Collector Crypt gift challenge, then consume one purchased/gifted pack and return its open memo.", { nonce: z.string().min(1).max(100), signedMessage: z.string().min(1).max(1000), signature: z.string().min(80).max(100), turbo: z.boolean().optional().default(false), userAddress: z.string().optional() }, async (args) => {
        try {
            const walletAddress = verifiedSessionAddress(accountService, args.userAddress);
            const pending = pendingGiftClaims.get(args.nonce);
            if (!pending || pending.createdAt < Date.now() - 5 * 60_000)
                throw new Error("No fresh gift claim challenge exists for this nonce in this MCP session. Prepare a new claim challenge.");
            if (pending.walletAddress !== walletAddress || args.signedMessage !== pending.messageToSign)
                throw new Error("The challenge message or wallet does not match the prepared request.");
            const signatureBytes = bs58.decode(args.signature);
            if (signatureBytes.length !== 64 || !nacl.sign.detached.verify(Buffer.from(pending.messageToSign, "utf8"), signatureBytes, new PublicKey(walletAddress).toBytes())) {
                throw new Error("The verified wallet's challenge signature is invalid.");
            }
            const claim = await collectorCryptApi.useGiftClaim({ signedMessage: pending.messageToSign, signature: args.signature, publicKey: walletAddress, nonce: pending.nonce, packType: pending.packType, turbo: args.turbo });
            pendingGiftClaims.delete(args.nonce);
            return textResult({ status: "GIFT_CLAIMED", sandbox: false, wallet: walletAddress, packType: pending.packType, memo: claim.memo, packsRemaining: claim.packsRemaining,
                nextStep: "Use open_collector_crypt_pack with this memo to open the claimed pack." });
        }
        catch (error) {
            return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
        }
    });
    // The official Gacha API provides recent winners, but no public popularity ranking.
    server.tool("get_trending_packs", "Fetch recent Collector Crypt Gacha winners from its official API. This feed is not a trending or popularity ranking.", {
        packType: z.string().optional().describe("Optional official pack code, such as pokemon_50"),
        count: z.number().int().min(1).max(200).optional().default(10).describe("Number of recent records to request (1–200)")
    }, async (args) => {
        try {
            const recent = await collectorCryptApi.getRecentWinners(args.packType, args.count);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ dataSource: "Collector Crypt Gacha API", dataMode: "live_api", rankingAvailable: false, recent }, null, 2)
                    }
                ]
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { content: [{ type: "text", text: `Unable to fetch live Collector Crypt winners: ${message}` }], isError: true };
        }
    });
    server.tool("prepare_collector_crypt_pack_purchase", "Prepare a real Collector Crypt mainnet pack purchase. Returns the exact unsigned transaction. This MCP cannot invoke another MCP server: to complete it, use the official PayBox MCP request_wallet_sign tool in the same AI client (if its current schema supports Solana transaction signing), then pass the complete signed base64 transaction to submit_collector_crypt_transaction. The PayBox wallet must match this verified session wallet. No funds move before wallet approval and submission. The Gacha API partner key is optional.", {
        packType: z.string().min(1).max(80).describe("Live Collector Crypt machine code, such as pokemon_50"),
        expectedPriceUsdc: z.number().positive().describe("Current live machine price the user explicitly agreed to pay"),
        turbo: z.boolean().optional().default(false).describe("If true, Collector Crypt automatically buys back Common wins"),
        userAddress: z.string().optional().describe("Must match the cryptographically verified session wallet")
    }, async (args) => {
        try {
            const walletAddress = verifiedSessionAddress(accountService, args.userAddress);
            const machines = await collectorCryptApi.getMachines();
            const machineRows = Array.isArray(machines?.machines) ? machines.machines : [];
            const machine = machineRows.find((item) => item?.code === args.packType && item?.public === true);
            const price = Number(machine?.price);
            if (!machine || !Number.isFinite(price) || price <= 0)
                throw new Error(`Public live Gacha machine ${args.packType} or its price is unavailable.`);
            if (Math.abs(price - args.expectedPriceUsdc) > 0.000001) {
                throw new Error(`Price changed: ${args.packType} currently costs ${price} USDC. Confirm that price and try again.`);
            }
            const balance = await solanaService.getBalances(walletAddress);
            if (balance.usdc < price)
                throw new Error(`Insufficient live USDC balance: need ${price}, have ${balance.usdc}.`);
            const spendLimit = accountService.verifySpendLimits(price);
            if (!spendLimit.allowed)
                throw new Error(`Spend safety block: ${spendLimit.errorReason}`);
            const generated = await collectorCryptApi.generatePack({ playerAddress: walletAddress, packType: args.packType, turbo: args.turbo });
            pendingTransactions.set(generated.memo, {
                walletAddress,
                memo: generated.memo,
                unsignedTransaction: generated.transaction,
                action: "pack_purchase",
                amountUsdc: price,
                createdAt: Date.now()
            });
            return textResult({
                status: "AWAITING_WALLET_SIGNATURE",
                sandbox: false,
                network: "Solana mainnet",
                dataSource: "Collector Crypt Gacha API",
                apiKeyRequired: false,
                wallet: walletAddress,
                packType: args.packType,
                priceUsdc: price,
                turbo: args.turbo,
                memo: generated.memo,
                unsignedTransactionBase64: generated.transaction,
                signingInstructions: "Sign this transaction using your connected Solana wallet (e.g. Phantom, Solflare, or Solana CLI).",
                nextStep: "Pass the complete signed base64 transaction and memo to submit_collector_crypt_transaction. Alternatively, configure AGENT_PRIVATE_KEY in environment to execute autonomously."
            });
        }
        catch (error) {
            return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
        }
    });
    server.tool("execute_collector_crypt_pack_purchase", "Autonomously purchase a Collector Crypt Gacha pack on Solana. Requires AGENT_PRIVATE_KEY or SOLANA_PRIVATE_KEY in environment variables. Prepares, signs, and submits the transaction autonomously in one step.", {
        packType: z.string().min(1).max(80).describe("Live Collector Crypt machine code, such as pokemon_50"),
        expectedPriceUsdc: z.number().positive().describe("Current live machine price agreed to pay"),
        turbo: z.boolean().optional().default(false).describe("If true, Collector Crypt automatically buys back Common wins")
    }, async (args) => {
        const privateKey = (process.env.AGENT_PRIVATE_KEY || process.env.SOLANA_PRIVATE_KEY || "").trim();
        if (!privateKey) {
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: "AUTONOMOUS_SIGNING_NOT_CONFIGURED",
                            message: "No AGENT_PRIVATE_KEY or SOLANA_PRIVATE_KEY set in environment. Use prepare_collector_crypt_pack_purchase, sign the transaction with your wallet, and submit via submit_collector_crypt_transaction.",
                            alternative: "Call prepare_collector_crypt_pack_purchase instead."
                        }, null, 2)
                    }],
                isError: false
            };
        }
        try {
            const walletAddress = accountService.getActiveAddress();
            const machines = await collectorCryptApi.getMachines();
            const machineRows = Array.isArray(machines?.machines) ? machines.machines : [];
            const machine = machineRows.find((item) => item?.code === args.packType && item?.public === true);
            const price = Number(machine?.price);
            if (!machine || !Number.isFinite(price) || price <= 0)
                throw new Error(`Public live Gacha machine ${args.packType} is unavailable.`);
            if (Math.abs(price - args.expectedPriceUsdc) > 0.000001)
                throw new Error(`Price changed to ${price} USDC. Confirm price and retry.`);
            const balance = await solanaService.getBalances(walletAddress);
            if (balance.usdc < price)
                throw new Error(`Insufficient USDC balance: have ${balance.usdc}, need ${price}.`);
            const spendLimit = accountService.verifySpendLimits(price);
            if (!spendLimit.allowed)
                throw new Error(`Spend safety block: ${spendLimit.errorReason}`);
            const generated = await collectorCryptApi.generatePack({ playerAddress: walletAddress, packType: args.packType, turbo: args.turbo });
            const signedTx = solanaService.signTransactionLocally(generated.transaction, privateKey);
            const submission = await collectorCryptApi.submitTransaction(signedTx);
            if (submission.success !== true || typeof submission.signature !== "string") {
                throw new Error("Collector Crypt did not confirm transaction submission.");
            }
            accountService.recordSpend(price);
            accountService.recordTransaction({
                signature: submission.signature,
                type: "PACK_BUY",
                status: "confirmed",
                timestamp: new Date().toISOString(),
                description: `Autonomous Gacha pack purchase: ${args.packType} (memo: ${generated.memo})`,
                amountUsd: price,
                solanaExplorerUrl: `https://solscan.io/tx/${submission.signature}`
            });
            return textResult({
                status: "PURCHASE_SUBMITTED",
                network: "Solana mainnet",
                wallet: walletAddress,
                packType: args.packType,
                memo: generated.memo,
                signature: submission.signature,
                solanaExplorerUrl: `https://solscan.io/tx/${submission.signature}`,
                nextStep: `Use open_gacha_pack with memo "${generated.memo}" or check get_collector_crypt_pack_status.`
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { content: [{ type: "text", text: `Error executing pack purchase: ${msg}` }], isError: true };
        }
    });
    server.tool("prepare_collector_crypt_gift", "Prepare a real Collector Crypt Gacha gift purchase on Solana mainnet. The verified sender pays; the recipient receives the pack. Returns an unsigned transaction. This MCP cannot call PayBox itself: use the official PayBox MCP request_wallet_sign tool through the same AI client, if its current runtime schema supports Solana transaction signing. The signing wallet must match the verified sender. The Gacha API partner key is optional.", {
        receiverAddress: z.string().min(32).max(44).describe("Recipient Solana wallet"),
        packType: z.string().min(1).max(80).describe("Live Collector Crypt machine code"),
        expectedTotalUsdc: z.number().positive().describe("Total current gift price the user agreed to pay"),
        count: z.number().int().min(1).max(20).optional().default(1),
        userAddress: z.string().optional().describe("Must match the verified sender wallet")
    }, async (args) => {
        try {
            const sender = verifiedSessionAddress(accountService, args.userAddress);
            if (!accountService.validateSolanaAddress(args.receiverAddress))
                throw new Error("Invalid gift recipient Solana address.");
            const machines = await collectorCryptApi.getMachines();
            const machine = (Array.isArray(machines?.machines) ? machines.machines : []).find((item) => item?.code === args.packType && item?.public === true);
            const unitPrice = Number(machine?.price);
            const expected = unitPrice * args.count;
            if (!machine || !Number.isFinite(expected) || Math.abs(expected - args.expectedTotalUsdc) > 0.000001)
                throw new Error("The public live machine price or gift total does not match the amount the user confirmed.");
            const balance = await solanaService.getBalances(sender);
            if (balance.usdc < expected)
                throw new Error(`Insufficient live USDC balance: need ${expected}, have ${balance.usdc}.`);
            const spendLimit = accountService.verifySpendLimits(expected);
            if (!spendLimit.allowed)
                throw new Error(`Spend safety block: ${spendLimit.errorReason}`);
            const generated = await collectorCryptApi.generateGift({ sender, receiver: args.receiverAddress, packType: args.packType, count: args.count });
            pendingTransactions.set(generated.memo, {
                walletAddress: sender,
                memo: generated.memo,
                unsignedTransaction: generated.transaction,
                action: "gift",
                amountUsdc: expected,
                createdAt: Date.now()
            });
            return textResult({ status: "AWAITING_WALLET_SIGNATURE", network: "Solana mainnet", dataSource: "Collector Crypt Gacha API", apiKeyRequired: false,
                sender, recipient: args.receiverAddress, packType: args.packType, count: args.count, totalCostUsdc: expected,
                memo: generated.memo, unsignedTransactionBase64: generated.transaction,
                signingInstructions: "Sign this transaction using your connected Solana wallet (e.g. Phantom, Solflare, or Solana CLI).",
                nextStep: "Pass the complete signed base64 transaction and memo to submit_collector_crypt_transaction." });
        }
        catch (error) {
            return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
        }
    });
    server.tool("submit_collector_crypt_transaction", "Submit a prepared Collector Crypt pack purchase or gift after your wallet has signed the base64 Solana transaction. Verifies the message matches the prepared transaction exactly and contains the verified session wallet signature before submission.", {
        memo: z.string().min(1).max(160).describe("Memo returned by the matching prepare tool"),
        signedTransactionBase64: z.string().min(1).max(100000).describe("Complete serialized signed base64 Solana transaction"),
        userAddress: z.string().optional().describe("Must match the verified wallet that prepared the operation")
    }, async (args) => {
        try {
            const walletAddress = verifiedSessionAddress(accountService, args.userAddress);
            const pending = pendingTransactions.get(args.memo);
            if (!pending || pending.createdAt < Date.now() - 2 * 60_000)
                throw new Error("No fresh prepared transaction exists for that memo in this MCP session. Solana blockhashes expire quickly; prepare a fresh transaction.");
            if (pending.walletAddress !== walletAddress)
                throw new Error("This prepared transaction belongs to a different verified wallet.");
            verifyWalletSignedTransaction(pending.unsignedTransaction, args.signedTransactionBase64, walletAddress);
            const submission = await collectorCryptApi.submitTransaction(args.signedTransactionBase64);
            if (submission.success !== true || typeof submission.signature !== "string")
                throw new Error("Collector Crypt did not confirm transaction submission; no success is reported.");
            let chain = null;
            try {
                chain = await solanaService.getOnChainSignatureStatus(submission.signature);
            }
            catch { /* Submission may be live while this RPC is temporarily unavailable. */ }
            if (chain?.status === "failed")
                throw new Error(`Solana reports the submitted transaction failed: ${JSON.stringify(chain.error)}`);
            const confirmed = chain?.status === "confirmed" || chain?.status === "finalized";
            if (confirmed)
                pendingTransactions.delete(args.memo);
            if (confirmed)
                accountService.recordTransaction({
                    signature: submission.signature,
                    type: pending.action === "buyback" ? "BUYBACK" : "PACK_BUY",
                    status: chain?.status === "finalized" ? "finalized" : "confirmed",
                    timestamp: new Date().toISOString(),
                    description: `${pending.action} submitted for ${pending.memo}${confirmed ? " and confirmed on Solana" : "; awaiting Solana RPC confirmation"}`,
                    amountUsd: pending.amountUsdc ?? 0,
                    solanaExplorerUrl: `https://solscan.io/tx/${submission.signature}`
                });
            if (confirmed && pending.action !== "buyback" && pending.amountUsdc)
                accountService.recordSpend(pending.amountUsdc);
            return textResult({ status: confirmed ? "CONFIRMED" : "SUBMITTED_AWAITING_CONFIRMATION", sandbox: false, wallet: walletAddress,
                memo: pending.memo, action: pending.action, amountUsdc: pending.amountUsdc, signature: submission.signature,
                collectorCryptConfirmation: submission.confirmationStatus ?? null, solanaRpcStatus: chain?.status ?? "unavailable",
                explorerUrl: `https://solscan.io/tx/${submission.signature}`, nextStep: confirmed && pending.action === "pack_purchase" ? "Open this purchased pack with open_collector_crypt_pack." : undefined });
        }
        catch (error) {
            return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
        }
    });
    server.tool("open_collector_crypt_pack", "Open a purchased Collector Crypt pack by its official memo. This calls Collector Crypt's mainnet opening service and can irreversibly assign and transfer the NFT or process a configured turbo buyback. Only call when the user explicitly asks to reveal/open that pack.", { memo: z.string().min(1).max(160).describe("Memo from a confirmed Collector Crypt pack purchase or gift") }, async ({ memo }) => {
        try {
            const walletAddress = verifiedSessionAddress(accountService);
            const packStatus = await collectorCryptApi.getPackStatus(memo);
            if (packStatus?.pack?.wallet !== walletAddress)
                throw new Error("Collector Crypt does not show this memo as a pack owned by the verified session wallet.");
            if (packStatus?.pack?.status !== "confirmed" || packStatus?.pack?.refunded === true)
                throw new Error("This pack is not confirmed and openable, or it has been refunded.");
            const result = await collectorCryptApi.openPack(memo);
            if (result?.success !== true || (typeof result.nft_address !== "string" && typeof result.code !== "string")) {
                throw new Error("Collector Crypt did not return a valid award or documented pending status; no award is reported.");
            }
            return textResult({ status: result.code === "WAITING_FOR_WEBHOOK" ? "WAITING_FOR_PAYMENT_WEBHOOK" : "PACK_OPENED",
                sandbox: false, wallet: walletAddress, memo, dataSource: "Collector Crypt Gacha API", result,
                nextStep: result.code === "WAITING_FOR_WEBHOOK" ? "Retry open_collector_crypt_pack with this memo after a short wait; the API documents that retries do not send a second card." : undefined });
        }
        catch (error) {
            return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
        }
    });
    server.tool("prepare_collector_crypt_buyback", "Check current buyback eligibility, then prepare the real Collector Crypt NFT-to-USDC buyback transaction. Returns the exact payout and unsigned transaction. To sign it, use PayBox official MCP request_wallet_sign through the same AI client if its current runtime schema supports this Solana transaction. The signing wallet must match the verified wallet. This MCP cannot invoke PayBox directly.", {
        nftAddress: z.string().min(32).max(44).describe("Card NFT mint to sell back"),
        expectedPayoutUsdc: z.number().positive().describe("Current payout the user explicitly agreed to receive"),
        userAddress: z.string().optional().describe("Must match the verified seller wallet")
    }, async (args) => {
        try {
            const walletAddress = verifiedSessionAddress(accountService, args.userAddress);
            if (!accountService.validateSolanaAddress(args.nftAddress))
                throw new Error("Invalid NFT mint address.");
            const available = await collectorCryptApi.getBuybackAvailability(args.nftAddress);
            if (available.available !== true || !Number.isFinite(available.amount))
                throw new Error("Collector Crypt reports no current buyback for this NFT.");
            const payoutUsdc = Number((available.amount / 1_000_000).toFixed(6));
            if (Math.abs(payoutUsdc - args.expectedPayoutUsdc) > 0.000001)
                throw new Error(`Buyback payout changed: current quote is ${payoutUsdc} USDC. Confirm it and try again.`);
            const generated = await collectorCryptApi.generateBuyback({ playerAddress: walletAddress, nftAddress: args.nftAddress });
            const key = `buyback:${args.nftAddress}`;
            pendingTransactions.set(key, { walletAddress, memo: generated.memo, unsignedTransaction: generated.serializedTransaction,
                action: "buyback", amountUsdc: payoutUsdc, nftAddress: args.nftAddress, createdAt: Date.now() });
            return textResult({ status: "AWAITING_WALLET_SIGNATURE", network: "Solana mainnet", sandbox: false,
                wallet: walletAddress, nftAddress: args.nftAddress, payoutUsdc, memo: generated.memo,
                unsignedTransactionBase64: generated.serializedTransaction,
                signingInstructions: "Sign this transaction using your connected Solana wallet (e.g. Phantom, Solflare, or Solana CLI).",
                nextStep: "Once signed, call submit_collector_crypt_buyback with the signed base64 transaction and nftAddress." });
        }
        catch (error) {
            return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
        }
    });
    server.tool("submit_collector_crypt_buyback", "Submit a prepared Collector Crypt buyback after verifying the exact transaction message and the verified wallet signature, then check Solana settlement.", { nftAddress: z.string().min(32).max(44), signedTransactionBase64: z.string().min(1).max(100000), userAddress: z.string().optional() }, async (args) => {
        try {
            const walletAddress = verifiedSessionAddress(accountService, args.userAddress);
            const pending = pendingTransactions.get(`buyback:${args.nftAddress}`);
            if (!pending || pending.createdAt < Date.now() - 60_000)
                throw new Error("No fresh prepared buyback exists for this NFT in this MCP session. Request a new quote; buyback transactions expire quickly.");
            if (pending.walletAddress !== walletAddress)
                throw new Error("This buyback was prepared for another wallet.");
            verifyWalletSignedTransaction(pending.unsignedTransaction, args.signedTransactionBase64, walletAddress);
            const submission = await collectorCryptApi.submitTransaction(args.signedTransactionBase64);
            if (submission.success !== true || typeof submission.signature !== "string")
                throw new Error("Collector Crypt did not confirm buyback transaction submission.");
            let chain = null;
            try {
                chain = await solanaService.getOnChainSignatureStatus(submission.signature);
            }
            catch { /* Submission may be live while this RPC is temporarily unavailable. */ }
            if (chain?.status === "failed")
                throw new Error(`Solana reports the buyback failed: ${JSON.stringify(chain.error)}`);
            const confirmed = chain?.status === "confirmed" || chain?.status === "finalized";
            if (confirmed)
                pendingTransactions.delete(`buyback:${args.nftAddress}`);
            if (confirmed)
                accountService.recordTransaction({ signature: submission.signature, type: "BUYBACK", status: chain?.status === "finalized" ? "finalized" : "confirmed",
                    timestamp: new Date().toISOString(), description: `Collector Crypt buyback for ${args.nftAddress}; RPC status ${chain?.status ?? "unavailable"}`,
                    amountUsd: pending.amountUsdc ?? 0, solanaExplorerUrl: `https://solscan.io/tx/${submission.signature}` });
            return textResult({ status: confirmed ? "CONFIRMED" : "SUBMITTED_AWAITING_CONFIRMATION",
                sandbox: false, nftAddress: args.nftAddress, payoutUsdc: pending.amountUsdc, signature: submission.signature,
                solanaRpcStatus: chain?.status ?? "unavailable", explorerUrl: `https://solscan.io/tx/${submission.signature}` });
        }
        catch (error) {
            return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
        }
    });
    // Tool 2: get_pack_drops
    server.tool("get_pack_drops", "List live Collector Crypt Gacha machines, their current prices, configured odds, availability, and stock from the official API.", {}, async () => {
        try {
            const response = await collectorCryptApi.getMachines();
            const machines = Array.isArray(response?.machines) ? response.machines.filter((machine) => machine?.public === true) : [];
            return { content: [{ type: "text", text: JSON.stringify({ dataSource: "Collector Crypt Gacha API", dataMode: "live_api", publicMachinesOnly: true, machines }, null, 2) }] };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { content: [{ type: "text", text: `Unable to fetch live Collector Crypt machines: ${message}` }], isError: true };
        }
    });
    server.tool("get_pack_wallet_activity", "Read purchased and gifted Collector Crypt pack counts for a Solana wallet from the official Gacha API. This does not include unrelated NFTs or prove current NFT ownership.", { userAddress: z.string().optional().describe("Wallet address; defaults to the connected session wallet") }, async (args) => {
        try {
            const address = accountService.getActiveAddress(args.userAddress);
            const activity = await collectorCryptApi.getWalletPackActivity(address);
            return { content: [{ type: "text", text: JSON.stringify({ wallet: address, dataSource: "Collector Crypt Gacha API", dataMode: "live_api", ...activity }, null, 2) }] };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { content: [{ type: "text", text: `Unable to fetch live pack activity: ${message}` }], isError: true };
        }
    });
    server.tool("get_collector_crypt_pack_status", "Read Collector Crypt's official record for a pack memo, including payment, NFT award, buyback, and transaction signatures.", { memo: z.string().min(1).max(160).describe("Memo returned by Collector Crypt when the pack was generated") }, async (args) => {
        try {
            const status = await collectorCryptApi.getPackStatus(args.memo);
            return { content: [{ type: "text", text: JSON.stringify({ dataSource: "Collector Crypt Gacha API", dataMode: "live_api", status }, null, 2) }] };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { content: [{ type: "text", text: `Unable to fetch live pack status: ${message}` }], isError: true };
        }
    });
    // Legacy local simulation is deliberately named and labeled as sandbox-only.
    server.tool("open_gacha_pack_sandbox", "SANDBOX ONLY: returns a local simulated card pull. It does not contact Collector Crypt, move funds, open a real pack, or produce a real transaction. Use open_collector_crypt_pack for a real confirmed purchase.", {
        packId: z.string().describe("Pack ID to open (e.g. 'pack-modern-heat', 'pack-vintage-grails', 'pack-anime-manga')"),
        paymentCurrency: z.enum(["USDC", "CARDS"]).optional().default("USDC").describe("Payment currency: 'USDC' or 'CARDS'"),
        clientSeed: z.string().optional().describe("Optional client seed string for provably fair cryptographic HMAC-SHA256 roll verification"),
        userAddress: z.string().optional().describe("Optional explicit Solana address. Defaults to your connected session wallet.")
    }, async (args) => {
        if (!hasLiveSettlement())
            return liveSettlementUnavailable("open_gacha_pack_sandbox");
        try {
            const activeAddress = accountService.getActiveAddress(args.userAddress);
            // Security Check: Verify cryptographic ownership (reject read-only spectator spoofing)
            accountService.requireVerifiedOwner("open Gacha packs and spend funds");
            const pack = ccService.getPackById(args.packId);
            if (!pack) {
                return {
                    content: [{ type: "text", text: `Error: Gacha pack "${args.packId}" not found.` }],
                    isError: true
                };
            }
            const costUsd = args.paymentCurrency === "USDC" ? pack.priceUsdc : pack.priceCards * 0.0205;
            // Check spend limits
            const safetyCheck = accountService.verifySpendSafety(costUsd);
            if (!safetyCheck.allowed) {
                return {
                    content: [{ type: "text", text: `Safety Block: ${safetyCheck.errorReason}` }],
                    isError: true
                };
            }
            // Open pack and roll provably fair drop
            const pullResult = ccService.openGachaPack(pack.id, activeAddress, args.clientSeed);
            // Record in account history
            accountService.recordPackOpening({
                id: `open-${Date.now()}`,
                packId: pack.id,
                packTitle: pack.title,
                openedAt: new Date().toISOString(),
                paidAmount: args.paymentCurrency === "USDC" ? pack.priceUsdc : pack.priceCards,
                paidCurrency: args.paymentCurrency,
                cardPulled: pullResult.cardPulled,
                isProfit: pullResult.isProfit,
                netPnlUsdc: pullResult.netPnlUsdc,
                txSignature: pullResult.txSignature
            });
            // Debit balance
            accountService.debitBalance(costUsd);
            const response = {
                status: "SUCCESSFUL_OPEN",
                packOpened: pack.title,
                cost: `${args.paymentCurrency === "USDC" ? pack.priceUsdc : pack.priceCards} ${args.paymentCurrency}`,
                cardPulled: {
                    name: pullResult.cardPulled.name,
                    set: pullResult.cardPulled.set,
                    gradingCompany: pullResult.cardPulled.gradingCompany,
                    grade: pullResult.cardPulled.grade,
                    certNumber: pullResult.cardPulled.certNumber,
                    estimatedMarketValueUsdc: `$${pullResult.cardPulled.estimatedValueUsdc} USDC`,
                    vaultLocation: pullResult.cardPulled.vaultLocation,
                    nftMint: pullResult.cardPulled.nftMint
                },
                outcome: pullResult.isProfit ? "🎉 PROFITABLE PULL!" : "Collector Floor Pull",
                netPnlUsdc: `${pullResult.netPnlUsdc > 0 ? "+" : ""}$${pullResult.netPnlUsdc} USDC`,
                solanaTxSignature: pullResult.txSignature,
                provablyFairVerification: pullResult.fairProof,
                nextAction: "Card has been added to your vault collection. You can hold, trade, sell back for instant liquidity, or redeem the physical slab."
            };
            return {
                content: [{ type: "text", text: JSON.stringify(response, null, 2) }]
            };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
                content: [{ type: "text", text: `Error: ${msg}` }],
                isError: true
            };
        }
    });
    // Tool 3: get_pack_history
    server.tool("get_pack_history", "View your pack opening history: see all packs you opened, what card came out of each, what grade it received, its value, and all-time net ROI/profit.", {
        limit: z.number().optional().default(10).describe("Maximum number of records to return")
    }, async (args) => {
        const history = accountService.getPackHistory(args.limit);
        const allTimePnl = history.history.reduce((sum, h) => sum + h.netPnlUsdc, 0);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        dataMode: "sandbox",
                        totalPacksOpened: history.totalOpened,
                        allTimeNetPnlUsdc: `${allTimePnl >= 0 ? "+" : ""}$${allTimePnl} USDC`,
                        packs: history.history.map(h => ({
                            packTitle: h.packTitle,
                            openedAt: h.openedAt,
                            cost: `${h.paidAmount} ${h.paidCurrency}`,
                            cardPulled: `${h.cardPulled.name} (${h.cardPulled.grade})`,
                            marketValueUsdc: `$${h.cardPulled.estimatedValueUsdc}`,
                            netPnlUsdc: `${h.netPnlUsdc >= 0 ? "+" : ""}$${h.netPnlUsdc}`,
                            txSignature: h.txSignature
                        }))
                    }, null, 2)
                }
            ]
        };
    });
    // Legacy local treasury-payment builder is deliberately sandbox-only.
    server.tool("prepare_buy_gacha_pack_sandbox", "SANDBOX ONLY: constructs a local example payment payload. It is not a Collector Crypt purchase and must not be signed or submitted. Use prepare_collector_crypt_pack_purchase for the real Gacha flow.", {
        packId: z.string().describe("The pack ID to purchase (e.g., 'pack-modern-heat', 'pack-vintage-grails')"),
        paymentCurrency: z.enum(["USDC", "CARDS"]).describe("Currency to spend: 'USDC' or '$CARDS'"),
        userAddress: z.string().optional().describe("Optional explicit Solana wallet address. Defaults to connected session wallet.")
    }, async (args) => {
        if (!hasLiveSettlement())
            return liveSettlementUnavailable("prepare_buy_gacha_pack_sandbox");
        const activeAddress = accountService.getActiveAddress(args.userAddress);
        const pack = ccService.getPackById(args.packId);
        if (!pack) {
            return {
                content: [{ type: "text", text: `Error: Gacha pack with ID "${args.packId}" not found.` }],
                isError: true
            };
        }
        const amount = args.paymentCurrency === "USDC" ? pack.priceUsdc : pack.priceCards;
        const mint = args.paymentCurrency === "USDC" ? CONFIG.USDC_MINT_ADDRESS : CONFIG.CARDS_MINT_ADDRESS;
        const decimals = args.paymentCurrency === "USDC" ? 6 : 9;
        let serializedTx;
        try {
            const txInfo = await solanaService.createPaymentTransaction(activeAddress, CONFIG.COLLECTOR_TREASURY_WALLET, mint, amount, decimals);
            serializedTx = txInfo.serializedBase64;
        }
        catch {
            serializedTx = undefined;
        }
        const payload = PayBoxBridge.formatGachaPurchasePayload({
            userAddress: activeAddress,
            packId: pack.id,
            packTitle: pack.title,
            paymentCurrency: args.paymentCurrency,
            amount,
            serializedTxBase64: serializedTx
        });
        return {
            content: [{ type: "text", text: JSON.stringify(payload, null, 2) }]
        };
    });
    // This only verifies the legacy local simulation algorithm, not Collector Crypt's VRF.
    server.tool("verify_sandbox_fair_roll", "Verify only the legacy local sandbox HMAC calculation. This does not verify Collector Crypt's VRF, a real pack result, or prove a Collector Crypt outcome was fair.", {
        serverSeed: z.string().describe("The secret server seed revealed in provablyFairVerification"),
        clientSeed: z.string().describe("The client seed entropy used during the roll"),
        nonce: z.number().int().positive().describe("The nonce increment integer of the roll"),
        poolSize: z.number().int().positive().optional().default(3).describe("Number of items in the card drop pool (default: 3)")
    }, async (args) => {
        try {
            const hmac = crypto.createHmac("sha256", args.serverSeed);
            hmac.update(`${args.clientSeed}:${args.nonce}`);
            const hexDigest = hmac.digest("hex");
            const first32Bits = parseInt(hexDigest.substring(0, 8), 16);
            const rollFraction = first32Bits / 0x100000000;
            const selectedIndex = Math.floor(rollFraction * args.poolSize);
            const commitmentHash = crypto.createHash("sha256").update(args.serverSeed).digest("hex");
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            status: "SANDBOX_MATH_REPRODUCED",
                            isFair: null,
                            verificationMath: {
                                commitmentHashSha256: commitmentHash,
                                hmacDigestHex: hexDigest,
                                extractedBitsHex: hexDigest.substring(0, 8),
                                rollFraction: Number(rollFraction.toFixed(8)),
                                rollInteger: Math.floor(rollFraction * 10000),
                                calculatedCardIndex: selectedIndex,
                                poolSize: args.poolSize
                            },
                            auditConclusion: "This reproduces a local HMAC calculation only; it is not an audit of Collector Crypt randomness or a real award."
                        }, null, 2)
                    }
                ]
            };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
                content: [{ type: "text", text: `Verification Error: ${msg}` }],
                isError: true
            };
        }
    });
}
//# sourceMappingURL=gachaTools.js.map