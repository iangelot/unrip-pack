import { Connection } from "@solana/web3.js";
export declare class SolanaService {
    private connection;
    constructor(connection?: Connection);
    getConnection(): Connection;
    /** Check a transaction signature against Solana RPC, independent of local history. */
    getOnChainSignatureStatus(signature: string): Promise<{
        signature: string;
        status: "not_found" | "processed" | "confirmed" | "finalized" | "failed";
        confirmationStatus: string | null;
        confirmations: number | null;
        error: unknown;
        source: "Solana RPC";
    }>;
    /**
     * Check balances for a user's Solana address (SOL, USDC, CARDS)
     */
    getBalances(userAddress: string): Promise<{
        sol: number;
        usdc: number;
        cards: number;
        address: string;
    }>;
    /**
     * Prepares a serialized unsigned Solana transaction ready for PayBox `request_wallet_sign`
     */
    createPaymentTransaction(payerAddress: string, recipientAddress: string, tokenMint: string, amount: number, decimals?: number): Promise<{
        serializedBase64: string;
        recentBlockhash: string;
    }>;
}
