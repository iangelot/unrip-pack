export interface JupiterQuoteResponse {
    inputMint: string;
    inAmount: string;
    outputMint: string;
    outAmount: string;
    otherAmountThreshold: string;
    swapMode: string;
    slippageBps: number;
    priceImpactPct: string;
    routePlan: unknown[];
    [key: string]: unknown;
}
export declare class JupiterSwapService {
    private baseUrl;
    /**
     * Fetch an optimized swap quote between Solana tokens (e.g. USDC and $CARDS)
     */
    getQuote(params: {
        inputMint: string;
        outputMint: string;
        amountAtomic: number | bigint;
        slippageBps?: number;
    }): Promise<JupiterQuoteResponse>;
    /**
     * Build a serialized base64 VersionedTransaction for the swap
     */
    createSwapTransaction(params: {
        quoteResponse: JupiterQuoteResponse;
        userPublicKey: string;
        wrapAndUnwrapSol?: boolean;
    }): Promise<{
        swapTransaction: string;
        lastValidBlockHeight?: number;
    }>;
}
