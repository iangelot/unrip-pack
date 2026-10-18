import { z } from "zod";
import { CollectorCryptService } from "../services/collectorCrypt.js";
import { PayBoxBridge } from "../services/payboxBridge.js";

export function registerRedemptionTools(
  server: any,
  ccService: CollectorCryptService
) {
  // Tool: get_buyback_quote
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
          content: [
            {
              type: "text",
              text: `Error generating buyback quote: ${errorMsg}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Tool: get_physical_redemption_quote
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
          content: [
            {
              type: "text",
              text: `Error calculating redemption quote: ${errorMsg}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Tool: prepare_physical_redemption
  server.tool(
    "prepare_physical_redemption",
    "Prepare the transaction payload to burn the tokenized NFT and authorize physical slab dispatch from the vault. Formatted for PayBox's `request_wallet_sign` tool.",
    {
      userAddress: z.string().describe("The user's Solana wallet address / PayBox address"),
      cardId: z.string().describe("The card ID or NFT mint address to physically redeem"),
      destinationCountry: z.string().optional().default("US").describe("Destination country for courier delivery")
    },
    async (args: any) => {
      try {
        const quote = ccService.getPhysicalRedemptionQuote(args.cardId, args.destinationCountry);
        const payload = PayBoxBridge.formatRedemptionSignPayload({
          userAddress: args.userAddress,
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
          content: [
            {
              type: "text",
              text: `Error preparing physical redemption: ${errorMsg}`
            }
          ],
          isError: true
        };
      }
    }
  );
}
