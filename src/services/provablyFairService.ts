import crypto from "crypto";

export interface ProvablyFairResult {
  serverSeedHash: string; // SHA-256 revealed upfront for verification
  serverSeed: string;     // Secret seed used
  clientSeed: string;     // Client/Nonce entropy
  nonce: number;
  rollFraction: number;   // Normalized float 0.00000000 to 0.99999999
  rollInteger: number;    // Selected index or percentage (0-9999)
  verificationInstructions: string;
}

/**
 * Provably Fair Cryptographic Random Number Generator (CSPRNG)
 * Implements HMAC-SHA256 standard matching Web3 casino & NFT drop verification.
 */
export class ProvablyFairService {
  private currentServerSeed: string;
  private currentNonce: number = 0;

  constructor() {
    this.currentServerSeed = crypto.randomBytes(32).toString("hex");
  }

  /**
   * Get the public commitment hash of the active server seed
   * Users can verify after the roll that the server seed was never swapped.
   */
  public getCommitmentHash(): string {
    return crypto.createHash("sha256").update(this.currentServerSeed).digest("hex");
  }

  /**
   * Roll a cryptographically secure random number between 0 and maxExclusive - 1
   */
  public generateFairRoll(maxExclusive: number, clientSeed?: string): {
    index: number;
    fairProof: ProvablyFairResult;
  } {
    this.currentNonce++;
    const effectiveClientSeed = clientSeed || crypto.randomBytes(16).toString("hex");

    // Compute HMAC-SHA256(serverSeed, clientSeed:nonce)
    const hmac = crypto.createHmac("sha256", this.currentServerSeed);
    hmac.update(`${effectiveClientSeed}:${this.currentNonce}`);
    const hexDigest = hmac.digest("hex");

    // Take first 8 characters (32 bits) and convert to integer
    const first32Bits = parseInt(hexDigest.substring(0, 8), 16);
    const rollFraction = first32Bits / 0x100000000; // Value between 0.0 and 1.0

    const selectedIndex = Math.floor(rollFraction * maxExclusive);

    const fairProof: ProvablyFairResult = {
      serverSeedHash: this.getCommitmentHash(),
      serverSeed: this.currentServerSeed,
      clientSeed: effectiveClientSeed,
      nonce: this.currentNonce,
      rollFraction: Number(rollFraction.toFixed(8)),
      rollInteger: Math.floor(rollFraction * 10000),
      verificationInstructions: `Verify with: HMAC-SHA256(serverSeed, '${effectiveClientSeed}:${this.currentNonce}') -> parse first 8 hex chars -> float * ${maxExclusive}`
    };

    // Cycle to a new server seed after each roll for forward secrecy
    this.currentServerSeed = crypto.randomBytes(32).toString("hex");

    return {
      index: selectedIndex,
      fairProof
    };
  }
}
