import { PayBoxExecutionPayload } from "../types.js";
export declare class PayBoxBridge {
    /**
     * Formats a Gacha Pack purchase into a PayBox payment execution payload
     */
    static formatGachaPurchasePayload(params: {
        userAddress: string;
        packId: string;
        packTitle: string;
        paymentCurrency: "USDC" | "CARDS";
        amount: number;
        serializedTxBase64?: string;
    }): PayBoxExecutionPayload;
    /**
     * Formats a $CARDS swap payload for PayBox's native DEX / Jupiter router
     */
    static formatSwapCardsPayload(params: {
        userAddress: string;
        direction: "BUY_CARDS" | "SELL_CARDS";
        inputAmount: number;
        estimatedOutput: number;
    }): PayBoxExecutionPayload;
    /**
     * Formats an NFT physical redemption burn transaction for PayBox `request_wallet_sign`
     */
    static formatRedemptionSignPayload(params: {
        userAddress: string;
        cardName: string;
        nftMint: string;
        shippingFeeUsdc: number;
        destinationCountry: string;
        serializedTxBase64?: string;
    }): PayBoxExecutionPayload;
}
