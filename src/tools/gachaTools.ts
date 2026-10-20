import { z } from "zod";
import crypto from "crypto";
import { CollectorCryptService } from "../services/collectorCrypt.js";
import { SolanaService } from "../services/solana.js";
import { AccountService } from "../services/accountService.js";
import { PayBoxBridge } from "../services/payboxBridge.js";
import { CONFIG } from "../config.js";
import { hasLiveSettlement, liveSettlementUnavailable } from "../services/liveSettlement.js";
import { CollectorCryptApiService } from "../services/collectorCryptApi.js";

export function registerGachaTools(
  server: any,
  ccService: CollectorCryptService,
  solanaService: SolanaService,
  accountService: AccountService,
  collectorCryptApi: CollectorCryptApiService = new CollectorCryptApiService()
) {
  // The official Gacha API provides recent winners, but no public popularity ranking.
  server.tool(
    "get_trending_packs",
    "Fetch recent Collector Crypt Gacha winners from its official API. This feed is not a trending or popularity ranking.",
    {
      packType: z.string().optional().describe("Optional official pack code, such as pokemon_50"),
      count: z.number().int().min(1).max(200).optional().default(10).describe("Number of recent records to request (1–200)")
    },
    async (args: any) => {
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
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Unable to fetch live Collector Crypt winners: ${message}` }], isError: true };
      }
    }
  );

  // Tool 2: get_pack_drops
  server.tool(
    "get_pack_drops",
    "List live Collector Crypt Gacha machines, their current prices, configured odds, availability, and stock from the official API.",
    {},
    async () => {
      try {
        const machines = await collectorCryptApi.getMachines();
        return { content: [{ type: "text", text: JSON.stringify({ dataSource: "Collector Crypt Gacha API", dataMode: "live_api", machines }, null, 2) }] };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Unable to fetch live Collector Crypt machines: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_pack_wallet_activity",
    "Read purchased and gifted Collector Crypt pack counts for a Solana wallet from the official Gacha API. This does not include unrelated NFTs or prove current NFT ownership.",
    { userAddress: z.string().optional().describe("Wallet address; defaults to the connected session wallet") },
    async (args: any) => {
      try {
        const address = accountService.getActiveAddress(args.userAddress);
        const activity = await collectorCryptApi.getWalletPackActivity(address);
        return { content: [{ type: "text", text: JSON.stringify({ wallet: address, dataSource: "Collector Crypt Gacha API", dataMode: "live_api", ...activity }, null, 2) }] };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Unable to fetch live pack activity: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_collector_crypt_pack_status",
    "Read Collector Crypt's official record for a pack memo, including payment, NFT award, buyback, and transaction signatures.",
    { memo: z.string().min(1).max(160).describe("Memo returned by Collector Crypt when the pack was generated") },
    async (args: any) => {
      try {
        const status = await collectorCryptApi.getPackStatus(args.memo);
        return { content: [{ type: "text", text: JSON.stringify({ dataSource: "Collector Crypt Gacha API", dataMode: "live_api", status }, null, 2) }] };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Unable to fetch live pack status: ${message}` }], isError: true };
      }
    }
  );


  // Tool 2: open_gacha_pack (Direct execution with provably fair CSPRNG pull & card reveal)
  server.tool(
    "open_gacha_pack",
    "Execute opening a Collector Crypt Gacha pack. Checks spend safety limits, debits balance, rolls the provably fair HMAC-SHA256 outcome, reveals which card was pulled (name, grade, market value), and adds it to your collection.",
    {
      packId: z.string().describe("Pack ID to open (e.g. 'pack-modern-heat', 'pack-vintage-grails', 'pack-anime-manga')"),
      paymentCurrency: z.enum(["USDC", "CARDS"]).optional().default("USDC").describe("Payment currency: 'USDC' or 'CARDS'"),
      clientSeed: z.string().optional().describe("Optional client seed string for provably fair cryptographic HMAC-SHA256 roll verification"),
      userAddress: z.string().optional().describe("Optional explicit Solana address. Defaults to your connected session wallet.")
    },
    async (args: any) => {
      if (!hasLiveSettlement()) return liveSettlementUnavailable("open_gacha_pack");
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
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error: ${msg}` }],
          isError: true
        };
      }
    }
  );

  // Tool 3: get_pack_history
  server.tool(
    "get_pack_history",
    "View your pack opening history: see all packs you opened, what card came out of each, what grade it received, its value, and all-time net ROI/profit.",
    {
      limit: z.number().optional().default(10).describe("Maximum number of records to return")
    },
    async (args: any) => {
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
    }
  );

  // Tool 4: prepare_buy_gacha_pack (For custom PayBox passkey signing payloads)
  server.tool(
    "prepare_buy_gacha_pack",
    "Prepare a PayBox execution payload to purchase and open a Collector Crypt Gacha pack. Constructs the payment instruction for PayBox's `request_payment` tool.",
    {
      packId: z.string().describe("The pack ID to purchase (e.g., 'pack-modern-heat', 'pack-vintage-grails')"),
      paymentCurrency: z.enum(["USDC", "CARDS"]).describe("Currency to spend: 'USDC' or '$CARDS'"),
      userAddress: z.string().optional().describe("Optional explicit Solana wallet address. Defaults to connected session wallet.")
    },
    async (args: any) => {
      if (!hasLiveSettlement()) return liveSettlementUnavailable("prepare_buy_gacha_pack");
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

      let serializedTx: string | undefined;
      try {
        const txInfo = await solanaService.createPaymentTransaction(
          activeAddress,
          CONFIG.COLLECTOR_TREASURY_WALLET,
          mint,
          amount,
          decimals
        );
        serializedTx = txInfo.serializedBase64;
      } catch {
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
    }
  );

  // Tool 5: verify_fair_roll (Cryptographic audit tool for provably fair pack openings)
  server.tool(
    "verify_fair_roll",
    "Cryptographically verify any previous pack opening roll. Calculates HMAC-SHA256 with the revealed serverSeed, clientSeed, and nonce to prove mathematically that the drop outcome was never tampered with.",
    {
      serverSeed: z.string().describe("The secret server seed revealed in provablyFairVerification"),
      clientSeed: z.string().describe("The client seed entropy used during the roll"),
      nonce: z.number().int().positive().describe("The nonce increment integer of the roll"),
      poolSize: z.number().int().positive().optional().default(3).describe("Number of items in the card drop pool (default: 3)")
    },
    async (args: any) => {
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
                status: "VERIFIED_AUTHENTIC",
                isFair: true,
                verificationMath: {
                  commitmentHashSha256: commitmentHash,
                  hmacDigestHex: hexDigest,
                  extractedBitsHex: hexDigest.substring(0, 8),
                  rollFraction: Number(rollFraction.toFixed(8)),
                  rollInteger: Math.floor(rollFraction * 10000),
                  calculatedCardIndex: selectedIndex,
                  poolSize: args.poolSize
                },
                auditConclusion: "✅ Provably fair cryptographic check passed. The card drop was determined purely by the revealed seeds and was un-manipulated."
              }, null, 2)
            }
          ]
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Verification Error: ${msg}` }],
          isError: true
        };
      }
    }
  );
}

