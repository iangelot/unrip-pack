import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";

/** Verify a wallet signed the exact prepared message; opaque transaction bytes are never trusted alone. */
export function verifyWalletSignedTransaction(unsignedBase64: string, signedBase64: string, walletAddress: string): void {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signedBase64) || signedBase64.length > 100_000) {
    throw new Error("Signed transaction must be a base64 serialized Solana transaction.");
  }
  const unsignedBytes = Buffer.from(unsignedBase64, "base64");
  const signedBytes = Buffer.from(signedBase64, "base64");
  const parse = (bytes: Buffer) => {
    try {
      const tx = VersionedTransaction.deserialize(bytes);
      return {
        message: Buffer.from(tx.message.serialize()),
        signers: tx.message.staticAccountKeys.map((key, index) => ({ key, signature: tx.signatures[index] }))
      };
    } catch {
      const tx = Transaction.from(bytes);
      return {
        message: Buffer.from(tx.serializeMessage()),
        signers: tx.signatures.map(({ publicKey, signature }) => ({ key: publicKey, signature }))
      };
    }
  };
  let unsigned: ReturnType<typeof parse>;
  let signed: ReturnType<typeof parse>;
  try {
    unsigned = parse(unsignedBytes);
    signed = parse(signedBytes);
  } catch {
    throw new Error("Could not decode the unsigned and signed Solana transactions.");
  }
  if (!unsigned.message.equals(signed.message)) {
    throw new Error("Signed transaction does not match the exact prepared transaction for this operation.");
  }
  const owner = new PublicKey(walletAddress);
  const signer = signed.signers.find((entry) => entry.key.equals(owner));
  if (!signer?.signature || signer.signature.length !== 64 || !nacl.sign.detached.verify(signed.message, signer.signature, owner.toBytes())) {
    throw new Error("The verified wallet's cryptographic signature is missing or invalid.");
  }
}
