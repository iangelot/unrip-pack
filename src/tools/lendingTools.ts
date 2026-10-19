import { z } from "zod";
import { CollectorCryptService } from "../services/collectorCrypt.js";
import { PayBoxBridge } from "../services/payboxBridge.js";
import { CONFIG } from "../config.js";

import { AccountService } from "../services/accountService.js";

export function registerLendingTools(
  server: any,
  ccService: CollectorCryptService,
  accountService: AccountService
) {
  // Tool: get_lending_terms
  server.tool(
    "get_lending_terms",
    "Calculate DeFi collateralized loan terms for a tokenized card NFT. Returns maximum borrowable USDC, LTV percentage, APR, and liquidation threshold without selling the physical card.",
    {
      cardId: z.string().describe("The card ID (e.g. 'cc-pkmn-001') or NFT mint address")
    },
    async (args: any) => {
      const card = ccService.getCardById(args.cardId);
      if (!card) {
        return {
          content: [{ type: "text", text: `Error: Card "${args.cardId}" not found in vault.` }],
          isError: true
        };
      }

      // RWA Lending parameters: standard 55% LTV, 8.5% APR, 80% liquidation threshold
      const ltvPercent = 55.0;
      const maxBorrowUsdc = Math.round(card.estimatedValueUsdc * (ltvPercent / 100));
      const liquidationThresholdPercent = 80.0;
      const liquidationCardValueUsdc = Math.round(maxBorrowUsdc / (liquidationThresholdPercent / 100));

      const terms = {
        cardId: card.id,
        cardName: card.name,
        nftMint: card.nftMint,
        estimatedMarketValueUsdc: card.estimatedValueUsdc,
        maxLtvPercent: ltvPercent,
        maxBorrowUsdc,
        annualInterestRateApr: "8.5%",
        loanDurationOptions: ["30 Days", "60 Days", "90 Days", "180 Days"],
        liquidationPriceUsdc: liquidationCardValueUsdc,
        liquidationWarning: `Liquidation occurs only if the card's verified market floor drops below $${liquidationCardValueUsdc} USDC.`,
        protocolFeeUsdc: 10
      };

      return {
        content: [{ type: "text", text: JSON.stringify(terms, null, 2) }]
      };
    }
  );

  // Tool: prepare_card_loan
  server.tool(
    "prepare_card_loan",
    "Prepare transaction payload to deposit a card NFT into the Collector Crypt lending escrow and borrow USDC into your account.",
    {
      cardId: z.string().describe("Card ID to use as collateral"),
      borrowAmountUsdc: z.number().positive().describe("Amount of USDC to borrow (must not exceed max LTV)"),
      loanDurationDays: z.enum(["30", "60", "90", "180"]).describe("Duration of the loan in days"),
      userAddress: z.string().optional().describe("Optional explicit Solana wallet address. Defaults to connected session wallet.")
    },
    async (args: any) => {
      const activeAddress = accountService.getActiveAddress(args.userAddress);
      const card = ccService.getCardById(args.cardId);
      if (!card) {
        return {
          content: [{ type: "text", text: `Error: Card "${args.cardId}" not found.` }],
          isError: true
        };
      }

      const maxBorrow = card.estimatedValueUsdc * 0.55;
      if (args.borrowAmountUsdc > maxBorrow) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Requested borrow amount of $${args.borrowAmountUsdc} exceeds maximum allowed LTV ($${maxBorrow} USDC).`
            }
          ],
          isError: true
        };
      }

      const payload = {
        actionType: "CUSTOM_SIGN",
        suggestedPayboxTool: "request_wallet_sign",
        chain: "solana",
        summary: `Lock "${card.name}" NFT in lending escrow to borrow ${args.borrowAmountUsdc} USDC for ${args.loanDurationDays} days`,
        estimatedCostUsd: 10, // Protocol origination fee
        recipientOrProgram: CONFIG.COLLECTOR_CRYPT_PROGRAM_ID,
        tokenMint: card.nftMint,
        instructionsBreakdown: [
          `1. Transfer card NFT (${card.nftMint}) to Collector Crypt Lending Escrow Program`,
          `2. Pay 10 USDC origination fee`,
          `3. Lending pool releases ${args.borrowAmountUsdc} USDC into PayBox address (${args.userAddress})`
        ],
        requiresApprovalPrompt: true,
        metadata: {
          collateralMint: card.nftMint,
          borrowedUsdc: args.borrowAmountUsdc,
          durationDays: args.loanDurationDays,
          apr: "8.5%"
        }
      };

      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }]
      };
    }
  );
}
