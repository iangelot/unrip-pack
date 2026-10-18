import { z } from "zod";
import { PayBoxBridge } from "../services/payboxBridge.js";
import { CONFIG } from "../config.js";
export function registerGachaTools(server, ccService, solanaService) {
    // Tool: get_pack_drops
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
    // Tool: prepare_buy_gacha_pack
    server.tool("prepare_buy_gacha_pack", "Prepare a PayBox execution payload to purchase and open a Collector Crypt Gacha pack. Constructs the payment instruction for PayBox's `request_payment` tool.", {
        userAddress: z.string().describe("The user's Solana wallet address / PayBox address"),
        packId: z.string().describe("The pack ID to purchase (e.g., 'pack-modern-heat', 'pack-vintage-grails')"),
        paymentCurrency: z.enum(["USDC", "CARDS"]).describe("Currency to spend: 'USDC' or '$CARDS'")
    }, async (args) => {
        const pack = ccService.getPackById(args.packId);
        if (!pack) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error: Gacha pack with ID "${args.packId}" not found.`
                    }
                ],
                isError: true
            };
        }
        const amount = args.paymentCurrency === "USDC" ? pack.priceUsdc : pack.priceCards;
        const mint = args.paymentCurrency === "USDC" ? CONFIG.USDC_MINT_ADDRESS : CONFIG.CARDS_MINT_ADDRESS;
        const decimals = args.paymentCurrency === "USDC" ? 6 : 9;
        let serializedTx;
        try {
            const txInfo = await solanaService.createPaymentTransaction(args.userAddress, CONFIG.COLLECTOR_TREASURY_WALLET, mint, amount, decimals);
            serializedTx = txInfo.serializedBase64;
        }
        catch (e) {
            // Fallback if user address is uninitialized on-chain
            serializedTx = undefined;
        }
        const payload = PayBoxBridge.formatGachaPurchasePayload({
            userAddress: args.userAddress,
            packId: pack.id,
            packTitle: pack.title,
            paymentCurrency: args.paymentCurrency,
            amount,
            serializedTxBase64: serializedTx
        });
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(payload, null, 2)
                }
            ]
        };
    });
}
//# sourceMappingURL=gachaTools.js.map