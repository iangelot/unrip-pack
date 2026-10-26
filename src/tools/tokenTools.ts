import { z } from "zod";
import { CollectorCryptService } from "../services/collectorCrypt.js";
import { SolanaService } from "../services/solana.js";
import { AccountService } from "../services/accountService.js";
import { CONFIG } from "../config.js";
import { JupiterSwapService } from "../services/jupiterSwap.js";

export function registerTokenTools(
  server: any,
  ccService: CollectorCryptService,
  solanaService: SolanaService,
  accountService: AccountService,
  jupiterSwapService: JupiterSwapService = new JupiterSwapService()
) {
  // Pending swap transactions map: memo/id -> swap details
  const pendingSwaps = new Map<string, {
    walletAddress: string;
    unsignedTransaction: string;
    direction: string;
    amount: number;
    createdAt: number;
  }>();

  // Tool 1: get_cards_token_info
  server.tool(
    "get_cards_token_info",
    "Get Collector Crypt $CARDS token parameters, mint address, and current configuration on Solana.",
    {},
    async () => {
      const stats = await ccService.getCardsTokenStats();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ...stats,
              mintAddress: CONFIG.CARDS_MINT_ADDRESS,
              usdcMintAddress: CONFIG.USDC_MINT_ADDRESS,
              solanaExplorer: `https://solscan.io/token/${CONFIG.CARDS_MINT_ADDRESS}`,
              dexAggregator: "Jupiter Aggregator v6"
            }, null, 2)
          }
        ]
      };
    }
  );

  // Tool 2: get_user_balances
  server.tool(
    "get_user_balances",
    "Retrieve live SOL, USDC, and $CARDS token balances for your connected session wallet or any specified Solana address.",
    {
      userAddress: z.string().optional().describe("Optional explicit Solana wallet address. Defaults to your connected session wallet.")
    },
    async (args: any) => {
      try {
        const activeAddress = accountService.getActiveAddress(args.userAddress);
        const balances = await solanaService.getBalances(activeAddress);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                address: activeAddress,
                balances,
                source: "Solana RPC",
                solanaExplorerUrl: `https://solscan.io/account/${activeAddress}`
              }, null, 2)
            }
          ]
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error retrieving balances: ${errorMsg}` }],
          isError: true
        };
      }
    }
  );

  // Tool 3: get_swap_quote (Live Jupiter DEX quote)
  server.tool(
    "get_swap_quote",
    "Get a real-time DEX swap quote between USDC and $CARDS (or SOL) via Jupiter Aggregator on Solana. Shows expected output amount, route, and price impact with 0 fees.",
    {
      direction: z.enum(["BUY_CARDS", "SELL_CARDS"]).describe("'BUY_CARDS' (swap USDC -> CARDS) or 'SELL_CARDS' (swap CARDS -> USDC)"),
      amount: z.number().positive().describe("Amount of input token (e.g. 10 USDC or 500 CARDS)"),
      slippagePercent: z.number().optional().default(0.5).describe("Max allowed slippage percentage (default 0.5%)")
    },
    async (args: any) => {
      try {
        const isBuy = args.direction === "BUY_CARDS";
        const inputMint = isBuy ? CONFIG.USDC_MINT_ADDRESS : CONFIG.CARDS_MINT_ADDRESS;
        const outputMint = isBuy ? CONFIG.CARDS_MINT_ADDRESS : CONFIG.USDC_MINT_ADDRESS;
        const amountAtomic = Math.round(args.amount * 1_000_000); // 6 decimals for USDC and CARDS
        const slippageBps = Math.round((args.slippagePercent ?? 0.5) * 100);

        const quote = await jupiterSwapService.getQuote({
          inputMint,
          outputMint,
          amountAtomic,
          slippageBps
        });

        const expectedOut = Number(quote.outAmount) / 1_000_000;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "QUOTE_RECEIVED",
                dex: "Jupiter Aggregator v6",
                direction: args.direction,
                inputAmount: `${args.amount} ${isBuy ? "USDC" : "CARDS"}`,
                expectedOutput: `${expectedOut.toFixed(4)} ${isBuy ? "CARDS" : "USDC"}`,
                minimumOutput: (Number(quote.otherAmountThreshold) / 1_000_000).toFixed(4),
                priceImpactPct: `${quote.priceImpactPct}%`,
                slippageBps,
                routePlanCount: quote.routePlan?.length ?? 1
              }, null, 2)
            }
          ]
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Failed to fetch Jupiter swap quote: ${msg}` }],
          isError: true
        };
      }
    }
  );

  // Tool 4: prepare_swap_cards (Prepares real Jupiter Solana swap transaction)
  server.tool(
    "prepare_swap_cards",
    "Prepare a real Solana DEX swap transaction between USDC and $CARDS using Jupiter Aggregator. Returns an unsigned base64 Solana transaction for wallet approval.",
    {
      direction: z.enum(["BUY_CARDS", "SELL_CARDS"]).describe("'BUY_CARDS' (swap USDC -> CARDS) or 'SELL_CARDS' (swap CARDS -> USDC)"),
      amount: z.number().positive().describe("Amount of input token to swap"),
      slippagePercent: z.number().optional().default(0.5).describe("Max allowed slippage percentage (default: 0.5%)"),
      userAddress: z.string().optional().describe("Optional explicit Solana wallet address. Defaults to connected session wallet.")
    },
    async (args: any) => {
      try {
        const activeAddress = accountService.getActiveAddress(args.userAddress);
        const isBuy = args.direction === "BUY_CARDS";
        const inputMint = isBuy ? CONFIG.USDC_MINT_ADDRESS : CONFIG.CARDS_MINT_ADDRESS;
        const outputMint = isBuy ? CONFIG.CARDS_MINT_ADDRESS : CONFIG.USDC_MINT_ADDRESS;
        const amountAtomic = Math.round(args.amount * 1_000_000);
        const slippageBps = Math.round((args.slippagePercent ?? 0.5) * 100);

        // Spend safety check
        const costUsd = isBuy ? args.amount : args.amount * 0.0205;
        const safetyCheck = accountService.verifySpendSafety(costUsd);
        if (!safetyCheck.allowed) {
          return {
            content: [{ type: "text", text: `Safety Block: ${safetyCheck.errorReason}` }],
            isError: true
          };
        }

        const quote = await jupiterSwapService.getQuote({
          inputMint,
          outputMint,
          amountAtomic,
          slippageBps
        });

        const swapResult = await jupiterSwapService.createSwapTransaction({
          quoteResponse: quote,
          userPublicKey: activeAddress
        });

        const swapId = `swap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        pendingSwaps.set(swapId, {
          walletAddress: activeAddress,
          unsignedTransaction: swapResult.swapTransaction,
          direction: args.direction,
          amount: args.amount,
          createdAt: Date.now()
        });

        const expectedOut = Number(quote.outAmount) / 1_000_000;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "AWAITING_WALLET_SIGNATURE",
                swapId,
                network: "Solana mainnet",
                aggregator: "Jupiter Aggregator v6",
                direction: args.direction,
                inputAmount: `${args.amount} ${isBuy ? "USDC" : "CARDS"}`,
                estimatedOutput: `${expectedOut.toFixed(4)} ${isBuy ? "CARDS" : "USDC"}`,
                walletAddress: activeAddress,
                unsignedTransactionBase64: swapResult.swapTransaction,
                nextStep: "Sign this transaction with your connected Solana wallet, then pass the signed base64 transaction to `submit_token_swap`."
              }, null, 2)
            }
          ]
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Failed to prepare swap transaction: ${msg}` }],
          isError: true
        };
      }
    }
  );

  // Tool 5: submit_token_swap (Broadcasts signed swap transaction to Solana RPC)
  server.tool(
    "submit_token_swap",
    "Submit a signed Jupiter DEX swap transaction directly to the Solana network.",
    {
      signedTransactionBase64: z.string().describe("Base64 encoded signed Solana VersionedTransaction"),
      swapId: z.string().optional().describe("Optional swapId returned from prepare_swap_cards")
    },
    async (args: any) => {
      try {
        const txSig = await solanaService.sendRawTransaction(args.signedTransactionBase64);
        if (args.swapId && pendingSwaps.has(args.swapId)) {
          const swap = pendingSwaps.get(args.swapId)!;
          accountService.recordTransaction({
            signature: txSig,
            type: "SWAP",
            status: "confirmed",
            timestamp: new Date().toISOString(),
            description: `Jupiter DEX Swap: ${swap.direction} (${swap.amount})`,
            amountUsd: swap.amount,
            solanaExplorerUrl: `https://solscan.io/tx/${txSig}`
          });
          pendingSwaps.delete(args.swapId);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "SUBMITTED",
                signature: txSig,
                solanaExplorerUrl: `https://solscan.io/tx/${txSig}`,
                message: "Swap transaction submitted to Solana. Balance updates will reflect upon block confirmation."
              }, null, 2)
            }
          ]
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Failed to broadcast swap transaction to Solana: ${msg}` }],
          isError: true
        };
      }
    }
  );

  // Tool 6: execute_token_swap (Direct execution if AGENT_PRIVATE_KEY is configured in env)
  server.tool(
    "execute_token_swap",
    "Execute an autonomous token swap between USDC and $CARDS on Solana. If AGENT_PRIVATE_KEY or SOLANA_PRIVATE_KEY is configured in environment, it signs and submits autonomously in one step.",
    {
      direction: z.enum(["BUY_CARDS", "SELL_CARDS"]).describe("'BUY_CARDS' (swap USDC -> CARDS) or 'SELL_CARDS' (swap CARDS -> USDC)"),
      amount: z.number().positive().describe("Amount of input token to swap"),
      slippagePercent: z.number().optional().default(0.5).describe("Max allowed slippage (default 0.5%)")
    },
    async (args: any) => {
      const privateKey = (process.env.AGENT_PRIVATE_KEY || process.env.SOLANA_PRIVATE_KEY || "").trim();
      if (!privateKey) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "AUTONOMOUS_SIGNING_NOT_CONFIGURED",
              message: "No AGENT_PRIVATE_KEY or SOLANA_PRIVATE_KEY is set in environment. Use `prepare_swap_cards` to generate the unsigned transaction, sign with your wallet, and submit via `submit_token_swap`.",
              alternative: "Call prepare_swap_cards instead."
            }, null, 2)
          }],
          isError: false
        };
      }

      try {
        const account = accountService.getAccount();
        const activeAddress = account.walletAddress;
        const isBuy = args.direction === "BUY_CARDS";
        const inputMint = isBuy ? CONFIG.USDC_MINT_ADDRESS : CONFIG.CARDS_MINT_ADDRESS;
        const outputMint = isBuy ? CONFIG.CARDS_MINT_ADDRESS : CONFIG.USDC_MINT_ADDRESS;
        const amountAtomic = Math.round(args.amount * 1_000_000);
        const slippageBps = Math.round((args.slippagePercent ?? 0.5) * 100);

        const quote = await jupiterSwapService.getQuote({
          inputMint,
          outputMint,
          amountAtomic,
          slippageBps
        });

        const swapResult = await jupiterSwapService.createSwapTransaction({
          quoteResponse: quote,
          userPublicKey: activeAddress
        });

        // Sign locally with configured agent key
        const signedTx = solanaService.signTransactionLocally(swapResult.swapTransaction, privateKey);
        const txSig = await solanaService.sendRawTransaction(signedTx);

        accountService.recordTransaction({
          signature: txSig,
          type: "SWAP",
          status: "confirmed",
          timestamp: new Date().toISOString(),
          description: `Autonomous Jupiter DEX Swap: ${args.direction} (${args.amount})`,
          amountUsd: args.amount,
          solanaExplorerUrl: `https://solscan.io/tx/${txSig}`
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "SWAP_EXECUTED",
                signature: txSig,
                direction: args.direction,
                inputAmount: `${args.amount} ${isBuy ? "USDC" : "CARDS"}`,
                expectedOutput: `${(Number(quote.outAmount) / 1_000_000).toFixed(4)} ${isBuy ? "CARDS" : "USDC"}`,
                solanaExplorerUrl: `https://solscan.io/tx/${txSig}`
              }, null, 2)
            }
          ]
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error executing autonomous swap: ${msg}` }],
          isError: true
        };
      }
    }
  );
}
