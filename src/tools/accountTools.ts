import { z } from "zod";
import { AccountService } from "../services/accountService.js";
import { CollectorCryptService } from "../services/collectorCrypt.js";

export function registerAccountTools(
  server: any,
  accountService: AccountService,
  ccService: CollectorCryptService
) {
  // Tool 1: get_account
  server.tool(
    "get_account",
    "Get current connected wallet address, live SOL/USDC/CARDS balances, spend limits, and connection status. Does NOT require userAddress.",
    {},
    async () => {
      const account = accountService.getAccount();
      const dailyRemaining = Math.max(0, account.spendLimits.dailySpendCapUsd - account.spendLimits.dailySpentSoFarUsd);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              walletAddress: account.walletAddress,
              connectedVia: account.connectedVia,
              isConnected: account.isConnected,
              balances: account.balances,
              safetyLimits: {
                ...account.spendLimits,
                dailyRemainingBudgetUsd: dailyRemaining
              },
              lastActive: account.lastActive
            }, null, 2)
          }
        ]
      };
    }
  );

  // Tool 2: connect_wallet
  server.tool(
    "connect_wallet",
    "Link a Solana wallet address to your session so all cards, balances, and actions automatically resolve to this wallet without needing to repeat the address.",
    {
      walletAddress: z.string().describe("Your Solana wallet public key (base58, 32-44 characters)")
    },
    async (args: any) => {
      try {
        const account = await accountService.connectWallet(args.walletAddress);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "success",
                message: `Wallet ${args.walletAddress} successfully linked to your session.`,
                account
              }, null, 2)
            }
          ]
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

  // Tool 3: get_portfolio_summary
  server.tool(
    "get_portfolio_summary",
    "Retrieve a consolidated, one-call portfolio summary: total card count, total estimated collection value in USDC, balances, top valued cards, and all-time pack PnL. Does NOT require userAddress.",
    {
      userAddress: z.string().optional().describe("Optional explicit Solana address. Defaults to your connected session wallet.")
    },
    async (args: any) => {
      try {
        const activeAddress = accountService.getActiveAddress(args.userAddress);
        const userCards = ccService.getUserVaultCards(activeAddress, 100);
        const account = accountService.getAccount();
        const packHist = accountService.getPackHistory(100);

        const totalCardValue = userCards.cards.reduce((sum, c) => sum + c.estimatedValueUsdc, 0);
        const solPriceProxy = 185.0;
        const cardsPriceProxy = 0.0205;
        const totalTokenValue = 
          account.balances.usdc +
          (account.balances.sol * solPriceProxy) +
          (account.balances.cards * cardsPriceProxy);

        const allTimePackPnl = packHist.history.reduce((sum, p) => sum + p.netPnlUsdc, 0);

        const topCards = [...userCards.cards]
          .sort((a, b) => b.estimatedValueUsdc - a.estimatedValueUsdc)
          .slice(0, 3)
          .map(c => ({
            name: c.name,
            grade: c.grade,
            valueUsdc: c.estimatedValueUsdc,
            certNumber: c.certNumber
          }));

        const summary = {
          walletAddress: activeAddress,
          totalCardsHeld: userCards.total,
          totalEstimatedCollectionValueUsdc: totalCardValue,
          tokenBalances: {
            usdc: account.balances.usdc,
            sol: account.balances.sol,
            cards: account.balances.cards,
            totalTokenValueUsdc: Number(totalTokenValue.toFixed(2))
          },
          totalNetWorthUsdc: Number((totalCardValue + totalTokenValue).toFixed(2)),
          allTimePacksOpened: packHist.totalOpened,
          allTimePackPnlUsdc: allTimePackPnl,
          topCards
        };

        return {
          content: [{ type: "text", text: JSON.stringify(summary, null, 2) }]
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

  // Tool 4: set_spend_limits
  server.tool(
    "set_spend_limits",
    "Configure safety limits on money-moving actions: set maximum per-transaction spend, daily 24h spend cap, and passkey confirmation thresholds.",
    {
      perTransactionCapUsd: z.number().positive().optional().describe("Maximum allowed spend for a single transaction in USD"),
      dailySpendCapUsd: z.number().positive().optional().describe("Maximum total spend allowed in a 24-hour window in USD"),
      requiresPasskeyAboveUsd: z.number().positive().optional().describe("Threshold above which biometric Passkey confirmation is strictly required")
    },
    async (args: any) => {
      const updated = accountService.updateSpendLimits(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              message: "Spend safety limits updated.",
              currentLimits: updated
            }, null, 2)
          }
        ]
      };
    }
  );

  // Tool 5: get_transaction_status
  server.tool(
    "get_transaction_status",
    "Verify the on-chain confirmation status, slot, and timestamp of any transaction by signature or transaction ID.",
    {
      signature: z.string().describe("The Solana transaction signature or ID")
    },
    async (args: any) => {
      const status = accountService.getTransactionStatus(args.signature);
      return {
        content: [{ type: "text", text: JSON.stringify(status, null, 2) }]
      };
    }
  );

  // Tool 6: create_agent_wallet
  server.tool(
    "create_agent_wallet",
    "Generate a new non-custodial Solana wallet instantly for your PayBox agent. Automatically links it to your active session and credits initial sandbox testnet balances so you can immediately buy packs and manage cards.",
    {},
    async () => {
      try {
        const result = accountService.createAgentWallet();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "WALLET_CREATED",
                message: result.message,
                walletAddress: result.account.walletAddress,
                connectedVia: result.account.connectedVia,
                initialBalances: result.account.balances,
                spendLimits: result.account.spendLimits,
                securityNote: "Keys are non-custodial and secured in PayBox MPC secure enclaves."
              }, null, 2)
            }
          ]
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error creating wallet: ${msg}` }],
          isError: true
        };
      }
    }
  );

  // Tool 7: get_transactions
  server.tool(
    "get_transactions",
    "List recent transaction history for your account, including pack purchases, card buybacks, swaps, and redemptions with block explorer URLs. Supports pagination.",
    {
      limit: z.number().optional().default(10).describe("Number of transactions to return"),
      offset: z.number().optional().default(0).describe("Pagination offset")
    },
    async (args: any) => {
      const history = accountService.getTransactionHistory(args.limit, args.offset);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(history, null, 2)
          }
        ]
      };
    }
  );
}

