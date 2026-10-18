import { z } from "zod";

export function registerIngestionTools(server: any) {
  // Tool: estimate_vaulting_cost
  server.tool(
    "estimate_vaulting_cost",
    "Calculate fees to send your raw or graded physical card from home to the Collector Crypt vault for high-res 3D scanning, custody, and 1:1 Solana NFT tokenization.",
    {
      cardName: z.string().describe("Card name (e.g. '1999 Blastoise Holo #2')"),
      declaredValueUsd: z.number().positive().describe("Estimated market value of the card in USD"),
      isAlreadyGraded: z.boolean().describe("True if card is already encapsulated by PSA/BGS/CGC; False if raw and needs grading")
    },
    async (args: any) => {
      const intakeAndVaultingFeeUsd = 12.0;
      const solanaMintingGasFeeUsdc = 0.50;
      const gradingFeeUsd = args.isAlreadyGraded ? 0 : 25.0; // Partner bulk tier with PSA
      const transitInsuranceFeeUsd = Math.max(5.0, Number((args.declaredValueUsd * 0.005).toFixed(2))); // 0.5% insurance
      const totalEstimatedUsdc = intakeAndVaultingFeeUsd + solanaMintingGasFeeUsdc + gradingFeeUsd + transitInsuranceFeeUsd;

      const breakdown = {
        cardName: args.cardName,
        declaredValueUsd: args.declaredValueUsd,
        isGraded: args.isAlreadyGraded,
        feeBreakdown: {
          vaultIngestionAnd3DScanning: `$${intakeAndVaultingFeeUsd}`,
          gradingFee: args.isAlreadyGraded ? "Waived (Already Graded)" : `$${gradingFeeUsd} (PSA Standard Partner Tier)`,
          transitAndVaultInsurance: `$${transitInsuranceFeeUsd}`,
          solanaNftMintingAndMetadata: `$${solanaMintingGasFeeUsdc}`
        },
        totalCostUsdc: totalEstimatedUsdc,
        vaultDestination: "Collector Crypt PSA Security Depot (New Castle, Delaware, USA)",
        nextStep: "Use 'generate_vault_shipping_manifest' to create an insured intake label."
      };

      return {
        content: [{ type: "text", text: JSON.stringify(breakdown, null, 2) }]
      };
    }
  );

  // Tool: generate_vault_shipping_manifest
  server.tool(
    "generate_vault_shipping_manifest",
    "Generate an insured intake shipping manifest and deposit ID to mail physical cards to Collector Crypt's vault for on-chain tokenization.",
    {
      userAddress: z.string().describe("User's Solana wallet address where the 1:1 NFT will be minted"),
      senderName: z.string().describe("Full name of sender"),
      cardName: z.string().describe("Card description and certification number if available"),
      declaredValueUsd: z.number().positive().describe("Declared insurance value")
    },
    async (args: any) => {
      const intakeId = `CC-IN-${Date.now().toString().slice(-6)}`;
      const manifest = {
        intakeId,
        destinationVault: "PSA Vault Services / Collector Crypt Intake Dept",
        shippingAddress: "100 Security Boulevard, Suite 400, New Castle, DE 19720, United States",
        sender: args.senderName,
        recipientSolanaAddress: args.userAddress,
        itemsDeclared: [
          {
            item: args.cardName,
            declaredValueUsd: args.declaredValueUsd,
            insuredCoverage: "100% Guaranteed by Lloyds of London Vault Policy"
          }
        ],
        instructions: [
          "1. Securely package card slab in bubble wrap between rigid cardboard inserts.",
          `2. Write Intake ID [${intakeId}] clearly on the exterior of the package.`,
          "3. Ship via FedEx / UPS with signature confirmation required.",
          "4. Once received, high-res scan will complete within 48h and 1:1 NFT will mint to your Solana address."
        ],
        manifestTrackingStatus: "MANIFEST_CREATED_AWAITING_PACKAGE"
      };

      return {
        content: [{ type: "text", text: JSON.stringify(manifest, null, 2) }]
      };
    }
  );
}
