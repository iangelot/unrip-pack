/** Verify a wallet signed the exact prepared message; opaque transaction bytes are never trusted alone. */
export declare function verifyWalletSignedTransaction(unsignedBase64: string, signedBase64: string, walletAddress: string): void;
