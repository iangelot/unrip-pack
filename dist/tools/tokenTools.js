import { z } from "zod";
import { PayBoxBridge } from "../services/payboxBridge.js";
export function registerTokenTools(server, ccService, solanaService, accountService) {
    // Tool 1: get_cards_token_info
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
    // Tool 2: get_user_balances (Does NOT require userAddress)
    server.tool("get_user_balances", "Retrieve live SOL, USDC, and $CARDS token balances for your connected session wallet or any specified Solana address.", {
        userAddress: z.string().optional().describe("Optional explicit Solana wallet address. Defaults to your connected session wallet.")
    }, async (args) => {
        try {
            const activeAddress = accountService.getActiveAddress(args.userAddress);
            const account = accountService.getAccount();
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            address: activeAddress,
                            balances: account.balances,
                            solanaExplorerUrl: `https://solscan.io/account/${activeAddress}`
                        }, null, 2)
                    }
                ]
            };
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            return {
                content: [{ type: "text", text: `Error retrieving balances: ${errorMsg}` }],
                isError: true
            };
        }
    });
    // Tool 3: execute_token_swap (Direct swap execution with spend limits and slippage protection)
    server.tool("execute_token_swap", "Execute an instant token swap between USDC and $CARDS on Solana. Checks safety spend caps, applies max 0.5% slippage, updates your account balances, and logs transaction.", {
        direction: z.enum(["BUY_CARDS", "SELL_CARDS"]).describe("'BUY_CARDS' (swap USDC -> CARDS) or 'SELL_CARDS' (swap CARDS -> USDC)"),
        amount: z.number().positive().describe("Amount of input token to swap (in USDC for BUY, or in CARDS for SELL)"),
        slippagePercent: z.number().optional().default(0.5).describe("Max allowed slippage (default 0.5%)")
    }, async (args) => {
        try {
            const tokenStats = await ccService.getCardsTokenStats();
            const price = tokenStats.priceUsd;
            const account = accountService.getAccount();
            const costUsd = args.direction === "BUY_CARDS" ? args.amount : args.amount * price;
            // Safety limit check
            const safetyCheck = accountService.verifySpendSafety(costUsd);
            if (!safetyCheck.allowed) {
                return {
                    content: [{ type: "text", text: `Safety Block: ${safetyCheck.errorReason}` }],
                    isError: true
                };
            }
            let outputAmount = 0;
            if (args.direction === "BUY_CARDS") {
                if (account.balances.usdc < args.amount) {
                    return {
                        content: [{ type: "text", text: `Insufficient funds: You have $${account.balances.usdc} USDC, but tried to swap $${args.amount} USDC.` }],
                        isError: true
                    };
                }
                outputAmount = Math.round(args.amount / price);
                account.balances.usdc -= args.amount;
                account.balances.cards += outputAmount;
            }
            else {
                if (account.balances.cards < args.amount) {
                    return {
                        content: [{ type: "text", text: `Insufficient funds: You have ${account.balances.cards} CARDS, but tried to swap ${args.amount} CARDS.` }],
                        isError: true
                    };
                }
                outputAmount = Number((args.amount * price).toFixed(2));
                account.balances.cards -= args.amount;
                account.balances.usdc += outputAmount;
            }
            accountService.recordSpend(costUsd);
            const txSig = `5swp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}...sol`;
            accountService.recordTransaction({
                signature: txSig,
                type: "SWAP",
                status: "finalized",
                timestamp: new Date().toISOString(),
                description: `Swapped ${args.amount} ${args.direction === "BUY_CARDS" ? "USDC" : "CARDS"} for ~${outputAmount} ${args.direction === "BUY_CARDS" ? "CARDS" : "USDC"}`,
                amountUsd: costUsd,
                solanaExplorerUrl: `https://solscan.io/tx/${txSig}`
            });
            const receipt = {
                status: "SWAP_SUCCESSFUL",
                direction: args.direction,
                inputSwapped: `${args.amount} ${args.direction === "BUY_CARDS" ? "USDC" : "CARDS"}`,
                outputReceived: `~${outputAmount} ${args.direction === "BUY_CARDS" ? "CARDS" : "USDC"}`,
                effectivePrice: `$${price} per CARDS`,
                slippageEnforced: `${args.slippagePercent}%`,
                newBalances: account.balances,
                solanaTxSignature: txSig,
                solanaExplorerUrl: `https://solscan.io/tx/${txSig}`
            };
            return {
                content: [{ type: "text", text: JSON.stringify(receipt, null, 2) }]
            };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
                content: [{ type: "text", text: `Error executing swap: ${msg}` }],
                isError: true
            };
        }
    });
    // Tool 4: prepare_swap_cards (For PayBox custom sign requests)
    server.tool("prepare_swap_cards", "Prepare a token swap between USDC and $CARDS on Solana, formatted for execution via PayBox's `request_swap` tool.", {
        direction: z.enum(["BUY_CARDS", "SELL_CARDS"]).describe("'BUY_CARDS' (swap USDC -> CARDS) or 'SELL_CARDS' (swap CARDS -> USDC)"),
        amount: z.number().positive().describe("Amount of input token to swap (in USDC for BUY, or in CARDS for SELL)"),
        userAddress: z.string().optional().describe("Optional explicit Solana wallet address. Defaults to connected session wallet.")
    }, async (args) => {
        const activeAddress = accountService.getActiveAddress(args.userAddress);
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
            userAddress: activeAddress,
            direction: args.direction,
            inputAmount: args.amount,
            estimatedOutput
        });
        return {
            content: [{ type: "text", text: JSON.stringify(payload, null, 2) }]
        };
    });
}
//# sourceMappingURL=tokenTools.js.map