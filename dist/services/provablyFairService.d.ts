export interface ProvablyFairResult {
    serverSeedHash: string;
    serverSeed: string;
    clientSeed: string;
    nonce: number;
    rollFraction: number;
    rollInteger: number;
    verificationInstructions: string;
}
/**
 * Provably Fair Cryptographic Random Number Generator (CSPRNG)
 * Implements HMAC-SHA256 standard matching Web3 casino & NFT drop verification.
 */
export declare class ProvablyFairService {
    private currentServerSeed;
    private currentNonce;
    constructor();
    /**
     * Get the public commitment hash of the active server seed
     * Users can verify after the roll that the server seed was never swapped.
     */
    getCommitmentHash(): string;
    /**
     * Roll a cryptographically secure random number between 0 and maxExclusive - 1
     */
    generateFairRoll(maxExclusive: number, clientSeed?: string): {
        index: number;
        fairProof: ProvablyFairResult;
    };
}
