import { Connection } from "@solana/web3.js";
export declare class SolanaService {
    private connection;
    constructor(connection?: Connection);
    getConnection(): Connection;
    /**
     * Return standard token NFTs whose token accounts are currently owned by
     * this address. Both the wallet token account and mint supply/decimals are
     * checked on Solana RPC; metadata names are not fetched from off-chain URLs.
     */
    getOwnedNftMints(ownerAddress: string): Promise<{
        owner: string;
        source: "Solana RPC";
        coverage: "standard_token_nfts_only";
        compressedNftsIncluded: false;
        nfts: Array<{
            mint: string;
            tokenAccount: string;
            tokenProgram: string;
            metadata: {
                name: string;
                symbol: string;
                uri: string;
            } | null;
        }>;
    }>;
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
    /**
     * Broadcast a signed base64 Solana transaction to the network
     */
    sendRawTransaction(signedBase64: string): Promise<string>;
    /**
     * Sign an unsigned base64 Solana transaction with an authorized Keypair
     */
    signTransactionLocally(unsignedBase64: string, privateKeyBase58: string): string;
}
