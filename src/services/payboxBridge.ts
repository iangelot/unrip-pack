import { PayBoxExecutionPayload } from "../types.js";
import { CONFIG } from "../config.js";

export class PayBoxBridge {
  /**
   * Formats a Gacha Pack purchase into a PayBox payment execution payload
   */
  public static formatGachaPurchasePayload(params: {
    userAddress: string;
    packId: string;
    packTitle: string;
    paymentCurrency: "USDC" | "CARDS";
    amount: number;
    serializedTxBase64?: string;
  }): PayBoxExecutionPayload {
    const isUsdc = params.paymentCurrency === "USDC";
    const tokenMint = isUsdc ? CONFIG.USDC_MINT_ADDRESS : CONFIG.CARDS_MINT_ADDRESS;
    const estUsd = isUsdc ? params.amount : params.amount * 0.0205;

    return {
      actionType: "PAYMENT",
      suggestedPayboxTool: "request_payment",
      chain: "solana",
      summary: `Purchase 1x "${params.packTitle}" from Collector Crypt on Solana for ${params.amount} ${params.paymentCurrency}`,
      estimatedCostUsd: Number(estUsd.toFixed(2)),
      recipientOrProgram: CONFIG.COLLECTOR_TREASURY_WALLET,
      tokenMint,
      amount: params.amount,
      serializedTransactionBase64: params.serializedTxBase64,
      instructionsBreakdown: [
        `1. Approve transfer of ${params.amount} ${params.paymentCurrency} from PayBox vault`,
        `2. Route payment to Collector Crypt treasury (${CONFIG.COLLECTOR_TREASURY_WALLET})`,
        `3. Program mints randomized NFT pack token to user address (${params.userAddress})`
      ],
      requiresApprovalPrompt: estUsd > CONFIG.PAYBOX_MAX_AUTONOMOUS_USD,
      metadata: {
        packId: params.packId,
        protocol: "CollectorCrypt",
        settlementChain: "solana"
      }
    };
  }

  /**
   * Formats a $CARDS swap payload for PayBox's native DEX / Jupiter router
   */
  public static formatSwapCardsPayload(params: {
    userAddress: string;
    direction: "BUY_CARDS" | "SELL_CARDS";
    inputAmount: number;
    estimatedOutput: number;
  }): PayBoxExecutionPayload {
    const isBuying = params.direction === "BUY_CARDS";
    const fromToken = isBuying ? "USDC" : "CARDS";
    const toToken = isBuying ? "CARDS" : "USDC";

    return {
      actionType: "SWAP",
      suggestedPayboxTool: "request_swap",
      chain: "solana",
      summary: `Swap ${params.inputAmount} ${fromToken} into ~${params.estimatedOutput} ${toToken} on Solana via PayBox DEX router`,
      estimatedCostUsd: isBuying ? params.inputAmount : params.estimatedOutput,
      recipientOrProgram: "Jupiter Aggregator v6",
      tokenMint: isBuying ? CONFIG.USDC_MINT_ADDRESS : CONFIG.CARDS_MINT_ADDRESS,
      amount: params.inputAmount,
      instructionsBreakdown: [
        `1. Query best routing quote across Solana DEXes (Raydium, Meteora)`,
        `2. Authorize swap in PayBox vault (slippage: ${CONFIG.PAYBOX_DEFAULT_SLIPPAGE_BPS / 100}%)`,
        `3. Receive ${params.estimatedOutput} ${toToken} directly in PayBox address`
      ],
      requiresApprovalPrompt: params.inputAmount > CONFIG.PAYBOX_MAX_AUTONOMOUS_USD,
      metadata: {
        slippageBps: CONFIG.PAYBOX_DEFAULT_SLIPPAGE_BPS,
        protocol: "Jupiter / CollectorCrypt"
      }
    };
  }

  /**
   * Formats an NFT physical redemption burn transaction for PayBox `request_wallet_sign`
   */
  public static formatRedemptionSignPayload(params: {
    userAddress: string;
    cardName: string;
    nftMint: string;
    shippingFeeUsdc: number;
    destinationCountry: string;
    serializedTxBase64?: string;
  }): PayBoxExecutionPayload {
    return {
      actionType: "CUSTOM_SIGN",
      suggestedPayboxTool: "request_wallet_sign",
      chain: "solana",
      summary: `Burn 1:1 NFT for "${params.cardName}" to release physical slab from vault and ship to ${params.destinationCountry}`,
      estimatedCostUsd: params.shippingFeeUsdc,
      recipientOrProgram: CONFIG.COLLECTOR_CRYPT_PROGRAM_ID,
      tokenMint: params.nftMint,
      serializedTransactionBase64: params.serializedTxBase64,
      instructionsBreakdown: [
        `1. Pay ${params.shippingFeeUsdc} USDC vault handling and insured courier fee`,
        `2. Burn/Escrow the 1:1 Solana NFT (${params.nftMint}) to invalidate digital twin`,
        `3. Emit on-chain event triggering physical vault dispatch (Delaware/Oregon) to user's address`
      ],
      requiresApprovalPrompt: true, // Physical redemptions always warrant user verification
      metadata: {
        nftMint: params.nftMint,
        destinationCountry: params.destinationCountry,
        action: "PHYSICAL_SLAB_DISPATCH"
      }
    };
  }
}
