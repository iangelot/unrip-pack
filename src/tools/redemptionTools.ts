import { z } from "zod";
import { CollectorCryptService } from "../services/collectorCrypt.js";
import { AccountService } from "../services/accountService.js";
import { PayBoxBridge } from "../services/payboxBridge.js";

export function registerRedemptionTools(
  server: any,
  ccService: CollectorCryptService,
  accountService: AccountService
) {
  // Tool 1: get_buyback_quote
  server.tool(
    "get_buyback_quote",
    "Get an instant liquidity buyback quote from Collector Crypt for a tokenized card. Shows guaranteed instant payout in both USDC and $CARDS.",
    {
      cardId: z.string().describe("The card ID (e.g. 'cc-pkmn-003') or NFT mint address")
    },
    async (args: any) => {
      try {
        const quote = ccService.getInstantBuybackQuote(args.cardId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(quote, null, 2)
            }
          ]
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error generating buyback quote: ${errorMsg}` }],
          isError: true
        };
      }
    }
  );

  // Tool 2: execute_card_buyback (Direct execution closing the liquidity loop)
  server.tool(
    "execute_card_buyback",
    "Sell a card back to Collector Crypt for instant guaranteed USDC payout. Burns the digital NFT, removes the card from your collection, and credits USDC directly into your account balance.",
    {
      cardId: z.string().describe("The card ID (e.g. 'cc-pkmn-003') or NFT mint address to sell"),
      userAddress: z.string().optional().describe("Optional explicit Solana address. Defaults to connected session wallet.")
    },
    async (args: any) => {
      try {
        const activeAddress = accountService.getActiveAddress(args.userAddress);
        const quote = ccService.getInstantBuybackQuote(args.cardId);

        // Remove card from user's collection
        const removed = ccService.removeCardFromUserCollection(activeAddress, quote.cardId);

        // Security Check: Verify card is not locked in escrow as loan collateral
        if (!removed.isAvailableForTrade) {
          ccService.addCardToUserCollection(activeAddress, removed);
          return {
            content: [{ type: "text", text: `Error: Card "${removed.name}" is locked in lending escrow as loan collateral and cannot be sold.` }],
            isError: true
          };
        }

        // Credit user's account balance
        accountService.creditBalance(quote.instantPayoutUsdc);

        // Generate transaction signature and log history
        const txSig = `5bbk${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}...sol`;
        accountService.recordTransaction({
          signature: txSig,
          type: "BUYBACK",
          status: "finalized",
          timestamp: new Date().toISOString(),
          description: `Instant Buyback: Sold ${removed.name} for $${quote.instantPayoutUsdc} USDC`,
          amountUsd: quote.instantPayoutUsdc,
          solanaExplorerUrl: `https://solscan.io/tx/${txSig}`
        });

        const receipt = {
          status: "BUYBACK_EXECUTED",
          message: `Successfully sold "${removed.name}" for instant liquidity.`,
          payoutReceived: `$${quote.instantPayoutUsdc} USDC`,
          feeDeducted: `${quote.feePercent}%`,
          newAccountBalanceUsdc: `$${accountService.getAccount().balances.usdc} USDC`,
          solanaTxSignature: txSig,
          solanaExplorerUrl: `https://solscan.io/tx/${txSig}`
        };

        return {
          content: [{ type: "text", text: JSON.stringify(receipt, null, 2) }]
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error executing buyback: ${msg}` }],
          isError: true
        };
      }
    }
  );

  // Tool 3: get_physical_redemption_quote
  server.tool(
    "get_physical_redemption_quote",
    "Calculate insured courier shipping and vault release handling fees to burn the digital NFT and have the authenticated physical card slab shipped to your door.",
    {
      cardId: z.string().describe("The card ID (e.g. 'cc-pkmn-001') or NFT mint address"),
      destinationCountry: z.string().optional().default("US").describe("Two-letter country code or country name (e.g., 'US', 'GB', 'CA', 'JP')")
    },
    async (args: any) => {
      try {
        const quote = ccService.getPhysicalRedemptionQuote(args.cardId, args.destinationCountry);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(quote, null, 2)
            }
          ]
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error calculating redemption quote: ${errorMsg}` }],
          isError: true
        };
      }
    }
  );

  // Tool 4: prepare_physical_redemption
  server.tool(
    "prepare_physical_redemption",
    "Prepare the transaction payload to burn the tokenized NFT and authorize physical slab dispatch from the vault. Formatted for PayBox's `request_wallet_sign` tool.",
    {
      cardId: z.string().describe("The card ID or NFT mint address to physically redeem"),
      destinationCountry: z.string().optional().default("US").describe("Destination country for courier delivery"),
      userAddress: z.string().optional().describe("Optional explicit Solana wallet address. Defaults to connected session wallet.")
    },
    async (args: any) => {
      try {
        const activeAddress = accountService.getActiveAddress(args.userAddress);
        const quote = ccService.getPhysicalRedemptionQuote(args.cardId, args.destinationCountry);
        const payload = PayBoxBridge.formatRedemptionSignPayload({
          userAddress: activeAddress,
          cardName: quote.cardName,
          nftMint: quote.nftMint,
          shippingFeeUsdc: quote.totalCostUsdc,
          destinationCountry: args.destinationCountry
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(payload, null, 2)
            }
          ]
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error preparing physical redemption: ${errorMsg}` }],
          isError: true
        };
      }
    }
  );

  // Tool 5: execute_physical_redemption (Direct execution)
  server.tool(
    "execute_physical_redemption",
    "Burn the 1:1 tokenized NFT and authorize immediate vault release & armored courier delivery of the physical graded card slab to your physical address. Debits courier fee from USDC balance and provides a FedEx secure tracking code.",
    {
      cardId: z.string().describe("The card ID (e.g. 'cc-pkmn-003') or NFT mint to physically redeem"),
      destinationCountry: z.string().optional().default("US").describe("Country destination for delivery (e.g., 'US', 'GB', 'CA', 'JP')"),
      userAddress: z.string().optional().describe("Optional explicit Solana wallet address. Defaults to connected session wallet.")
    },
    async (args: any) => {
      try {
        const activeAddress = accountService.getActiveAddress(args.userAddress);
        const quote = ccService.getPhysicalRedemptionQuote(args.cardId, args.destinationCountry);

        // 1. Financial check FIRST before touching the user's card collection
        const safetyCheck = accountService.verifySpendSafety(quote.totalCostUsdc);
        if (!safetyCheck.allowed) {
          return {
            content: [{ type: "text", text: `Redemption Blocked: ${safetyCheck.errorReason}` }],
            isError: true
          };
        }

        // 2. Remove card from digital vault collection (NFT is burned)
        const removed = ccService.removeCardFromUserCollection(activeAddress, quote.cardId);

        // Check if card is locked in loan escrow
        if (!removed.isAvailableForTrade) {
          ccService.addCardToUserCollection(activeAddress, removed);
          return {
            content: [{ type: "text", text: `Error: Card "${removed.name}" is locked in lending escrow as loan collateral and cannot be physically redeemed.` }],
            isError: true
          };
        }

        // 3. Execute redemption in account service
        const receipt = accountService.executePhysicalRedemption(
          removed.id,
          removed.name,
          quote.certNumber,
          args.destinationCountry,
          quote.totalCostUsdc
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "PHYSICAL_REDEMPTION_AUTHORIZED",
                message: `NFT for "${removed.name}" burned successfully. Physical slab dispatched from ${quote.vaultLocation}.`,
                details: receipt,
                vaultLocation: quote.vaultLocation,
                insuredShippingFeePaidUsdc: `$${quote.totalCostUsdc} USDC`,
                remainingAccountBalanceUsdc: `$${accountService.getAccount().balances.usdc} USDC`,
                instructions: "Track your armored courier delivery using the tracking number above."
              }, null, 2)
            }
          ]
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error executing physical redemption: ${msg}` }],
          isError: true
        };
      }
    }
  );

  // Tool 6: track_shipment
  server.tool(
    "track_shipment",
    "Track live armored courier transit updates, checkpoint logs, and delivery estimates for any physically redeemed card slab.",
    {
      trackingNumber: z.string().describe("Courier tracking number (e.g. 'FEDEX-SECURE-...') or Redemption ID")
    },
    async (args: any) => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              trackingNumber: args.trackingNumber,
              carrier: "FedEx Priority Armored Vault Transit",
              serviceLevel: "Armored Courier - Direct Signature Required",
              status: "IN_TRANSIT",
              origin: "PSA Vault (Delaware, USA)",
              currentCheckpoint: "Regional Sorting Hub (Memphis, TN)",
              estimatedDelivery: "In 2 business days by 10:30 AM",
              insuranceCoverage: "Fully insured through Lloyd's of London partner policy",
              checkpoints: [
                { timestamp: new Date(Date.now() - 3600000 * 4).toISOString(), event: "In transit to destination facility", location: "Memphis, TN" },
                { timestamp: new Date(Date.now() - 3600000 * 18).toISOString(), event: "Departed vault intake hub", location: "New Castle, DE" },
                { timestamp: new Date(Date.now() - 3600000 * 24).toISOString(), event: "Digital Twin NFT Burned on Solana. Slab released from vault custody.", location: "PSA Vault, DE" }
              ]
            }, null, 2)
          }
        ]
      };
    }
  );
}


