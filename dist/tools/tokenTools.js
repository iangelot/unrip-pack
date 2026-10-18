import { z } from "zod";
import { PayBoxBridge } from "../services/payboxBridge.js";
export function registerTokenTools(server, ccService, solanaService) {
    // Tool: get_cards_token_info
    server.tool("get_cards_token_info", "Get live $CARDS token metrics on Solana, including current price, 24h performance, market cap, circulating supply, and community buyback fund status.", {}, async () => {
        const stats = await ccService.getCardsTokenStats();
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(stats, null, 2)
                }
            ]
        };
    });
    // Tool: get_user_balances
    server.tool("get_user_balances", "Retrieve live SOL, USDC, and $CARDS token balances for a specific Solana address or PayBox vault.", {
        userAddress: z.string().describe("The user's Solana wallet address")
    }, async (args) => {
        try {
            const balances = await solanaService.getBalances(args.userAddress);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(balances, null, 2)
                    }
                ]
            };
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error retrieving balances: ${errorMsg}`
                    }
                ],
                isError: true
            };
        }
    });
    // Tool: prepare_swap_cards
    server.tool("prepare_swap_cards", "Prepare a token swap between USDC and $CARDS on Solana, formatted for execution via PayBox's `request_swap` tool.", {
        userAddress: z.string().describe("The user's Solana wallet address"),
        direction: z.enum(["BUY_CARDS", "SELL_CARDS"]).describe("'BUY_CARDS' (swap USDC -> CARDS) or 'SELL_CARDS' (swap CARDS -> USDC)"),
        amount: z.number().positive().describe("Amount of input token to swap (in USDC for BUY, or in CARDS for SELL)")
    }, async (args) => {
        const tokenStats = await ccService.getCardsTokenStats();
        const price = tokenStats.priceUsd;
        let estimatedOutput = 0;
        if (args.direction === "BUY_CARDS") {
            estimatedOutput = Math.round(args.amount / price);
        }
        else {
            estimatedOutput = Number((args.amount * price).toFixed(2));
        }
        const payload = PayBoxBridge.formatSwapCardsPayload({
            userAddress: args.userAddress,
            direction: args.direction,
            inputAmount: args.amount,
            estimatedOutput
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
//# sourceMappingURL=tokenTools.js.map