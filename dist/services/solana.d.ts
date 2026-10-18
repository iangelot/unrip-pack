import { Connection } from "@solana/web3.js";
export declare class SolanaService {
    private connection;
    constructor();
    getConnection(): Connection;
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
