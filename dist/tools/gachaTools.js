import { z } from "zod";
import { PayBoxBridge } from "../services/payboxBridge.js";
import { CONFIG } from "../config.js";
export function registerGachaTools(server, ccService, solanaService, accountService) {
    // Tool 1: get_pack_drops
    server.tool("get_pack_drops", "List all active Gacha packs and mystery card drops on Collector Crypt, including pricing in USDC and $CARDS, rarity odds, remaining supply, and top grail prizes.", {}, async () => {
        const packs = ccService.getPackDrops();
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ activePacks: packs }, null, 2)
                }
            ]
        };
    });
    // Tool 2: open_gacha_pack (Direct execution with pack opening result & pulled card)
    server.tool("open_gacha_pack", "Execute opening a Collector Crypt Gacha pack. Checks spend safety limits, debits balance, rolls the randomized pull, reveals which card was pulled (name, grade, market value), and adds it to your collection.", {
        packId: z.string().describe("Pack ID to open (e.g. 'pack-modern-heat', 'pack-vintage-grails', 'pack-anime-manga')"),
        paymentCurrency: z.enum(["USDC", "CARDS"]).optional().default("USDC").describe("Payment currency: 'USDC' or 'CARDS'"),
        userAddress: z.string().optional().describe("Optional explicit Solana address. Defaults to your connected session wallet.")
    }, async (args) => {
        try {
            const activeAddress = accountService.getActiveAddress(args.userAddress);
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
            // Open pack and roll random drop
            const pullResult = ccService.openGachaPack(pack.id, activeAddress);
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
    // Tool 4: prepare_buy_gacha_pack (For custom PayBox passkey signing payloads)
    server.tool("prepare_buy_gacha_pack", "Prepare a PayBox execution payload to purchase and open a Collector Crypt Gacha pack. Constructs the payment instruction for PayBox's `request_payment` tool.", {
        packId: z.string().describe("The pack ID to purchase (e.g., 'pack-modern-heat', 'pack-vintage-grails')"),
        paymentCurrency: z.enum(["USDC", "CARDS"]).describe("Currency to spend: 'USDC' or '$CARDS'"),
        userAddress: z.string().optional().describe("Optional explicit Solana wallet address. Defaults to connected session wallet.")
    }, async (args) => {
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
}
//# sourceMappingURL=gachaTools.js.map