import { z } from "zod";
import { AccountService } from "../services/accountService.js";
import { CollectorCryptService } from "../services/collectorCrypt.js";
import { SolanaService } from "../services/solana.js";
import { hasLiveSettlement, liveSettlementUnavailable } from "../services/liveSettlement.js";

export function registerAccountTools(
  server: any,
  accountService: AccountService,
  ccService: CollectorCryptService,
  solanaService: SolanaService
) {
  // Tool 1: get_account
  server.tool(
    "get_account",
    "Get the connected wallet address, current Solana RPC balances, spend settings, and connection status.",
    {},
    async () => {
      const account = accountService.getAccount();
      const liveBalances = account.isConnected
        ? await solanaService.getBalances(account.walletAddress)
        : { sol: 0, usdc: 0, cards: 0 };
      const dailyRemaining = Math.max(0, account.spendLimits.dailySpendCapUsd - account.spendLimits.dailySpentSoFarUsd);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              walletAddress: account.walletAddress,
              connectedVia: account.connectedVia,
              isConnected: account.isConnected,
              balances: liveBalances,
              balanceSource: account.isConnected ? "Solana RPC" : "unavailable: no connected wallet",
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
    "Link a Solana wallet address to this read-only session. Simulated card and transaction tools are not enabled for settlement.",
    {
      walletAddress: z.string().describe("Your Solana wallet public key (base58, 32-44 characters)")
    },
    async (args: any) => {
      try {
        const account = await accountService.connectWallet(args.walletAddress, false);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "success",
                message: `Wallet ${args.walletAddress} linked to your session in Read-Only Spectator Mode. Claude can inspect cards, balances, and history. To execute pack rips, buybacks, loans, or card transfers, cryptographic signature verification via the authorization portal is required.`,
                isVerifiedOwner: false,
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
    "Retrieve token balances from Solana RPC. Local sandbox cards, estimated card values, and simulated pack PnL are excluded because they are not verified wallet assets.",
    {
      userAddress: z.string().optional().describe("Optional explicit Solana address. Defaults to your connected session wallet.")
    },
    async (args: any) => {
      try {
        const activeAddress = accountService.getActiveAddress(args.userAddress);
        const liveBalances = await solanaService.getBalances(activeAddress);

        const summary = {
          walletAddress: activeAddress,
          dataMode: "live_onchain_balances_only",
          tokenBalances: {
            usdc: liveBalances.usdc,
            sol: liveBalances.sol,
            cards: liveBalances.cards,
            source: "Solana RPC",
          },
          verifiedUsdValue: null,
          totalNetWorthUsdc: null,
          cardCollection: {
            status: "unavailable",
            verified: false,
            reason: "This server does not yet verify Collector Crypt card NFT ownership and valuation against the connected wallet. Local sandbox card examples are excluded."
          },
          packHistory: {
            status: "sandbox_only",
            includedInPortfolio: false,
            reason: "Local simulated pack openings and PnL are not on-chain records and are excluded."
          }
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
    "Configure safety limits on money-moving actions: set maximum per-transaction spend, daily 24h spend cap, and passkey confirmation thresholds. Enforces hard safety ceilings ($500/tx, $2,000/day) and requires human confirmationCode to increase limits.",
    {
      perTransactionCapUsd: z.number().positive().optional().describe("Maximum allowed spend for a single transaction in USD (Hard ceiling: $500)"),
      dailySpendCapUsd: z.number().positive().optional().describe("Maximum total spend allowed in a 24-hour window in USD (Hard ceiling: $2,000)"),
      requiresPasskeyAboveUsd: z.number().positive().optional().describe("Threshold above which biometric Passkey confirmation is strictly required"),
      confirmationCode: z.string().optional().describe("Security confirmation code. Must be 'CONFIRM_LIMIT_INCREASE' if increasing any spend limits.")
    },
    async (args: any) => {
      try {
        // Security Check: Verify cryptographic ownership
        accountService.requireVerifiedOwner("modify spending safety limits");

        const current = accountService.getAccount().spendLimits;
        const MAX_PER_TX_CAP_USD = 500;
        const MAX_DAILY_CAP_USD = 2000;

      // 1. Enforce hard platform ceilings to prevent catastrophic unauthorized drain
      if (args.perTransactionCapUsd !== undefined && args.perTransactionCapUsd > MAX_PER_TX_CAP_USD) {
        return {
          content: [{
            type: "text",
            text: `Error: Hard safety ceiling exceeded. Maximum allowed per-transaction cap is $${MAX_PER_TX_CAP_USD} USD on public tier to protect your wallet against prompt injection exploits.`
          }],
          isError: true
        };
      }

      if (args.dailySpendCapUsd !== undefined && args.dailySpendCapUsd > MAX_DAILY_CAP_USD) {
        return {
          content: [{
            type: "text",
            text: `Error: Hard safety ceiling exceeded. Maximum allowed 24h spend cap is $${MAX_DAILY_CAP_USD} USD on public tier.`
          }],
          isError: true
        };
      }

      // 2. Prevent autonomous prompt injection: Raising limits requires explicit human confirmation
      const isIncreasing = 
        (args.perTransactionCapUsd !== undefined && args.perTransactionCapUsd > current.perTransactionCapUsd) ||
        (args.dailySpendCapUsd !== undefined && args.dailySpendCapUsd > current.dailySpendCapUsd);

      if (isIncreasing && args.confirmationCode !== "CONFIRM_LIMIT_INCREASE") {
        return {
          content: [{
            type: "text",
            text: `Security Challenge: Raising your spending limits requires explicit user confirmation to prevent autonomous AI prompt injection. Please call 'set_spend_limits' again with confirmationCode: "CONFIRM_LIMIT_INCREASE".`
          }],
          isError: true
        };
      }

      const updated = accountService.updateSpendLimits({
        perTransactionCapUsd: args.perTransactionCapUsd,
        dailySpendCapUsd: args.dailySpendCapUsd,
        requiresPasskeyAboveUsd: args.requiresPasskeyAboveUsd
      });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "success",
                message: "Spend safety limits updated and persisted.",
                currentLimits: updated,
                safetyCeilings: {
                  maxAllowedPerTxUsd: MAX_PER_TX_CAP_USD,
                  maxAllowedDailyUsd: MAX_DAILY_CAP_USD
                }
              }, null, 2)
            }
          ]
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: msg }],
          isError: true
        };
      }
    }
  );

  // Tool 5: get_transaction_status
  server.tool(
    "get_transaction_status",
    "Check a Solana transaction signature against the configured Solana RPC. Local history is returned only as a separate, non-authoritative note.",
    {
      signature: z.string().describe("The Solana transaction signature or ID")
    },
    async (args: any) => {
      if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(args.signature)) {
        return {
          content: [{ type: "text", text: "Invalid Solana transaction signature. Provide the full base58 transaction signature, not a sandbox ID or truncated value." }],
          isError: true
        };
      }
      try {
        const onChain = await solanaService.getOnChainSignatureStatus(args.signature);
        const localRecord = accountService.getTransactionStatus(args.signature);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ...onChain,
              localHistoryRecord: localRecord.status === "not_found" ? null : localRecord,
              note: onChain.status === "not_found"
                ? "Solana RPC did not find this signature in transaction history. Check the full signature and the correct cluster; a local record cannot prove that a transaction happened."
                : "Status was checked against Solana RPC."
            }, null, 2)
          }]
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Solana RPC signature lookup failed: ${message}` }], isError: true };
      }
    }
  );

  // Tool 6: create_agent_wallet
  server.tool(
    "create_agent_wallet",
    "Unavailable: server-generated wallet keys are not safe to expose or manage in this service.",
    {},
    async () => {
      if (!hasLiveSettlement()) return liveSettlementUnavailable("create_agent_wallet");
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
    "List local sandbox transaction records for the connected wallet. These records are not proof of on-chain transactions. Supports pagination.",
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

