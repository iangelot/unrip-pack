import assert from "node:assert/strict";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const [{ SolanaService }] = await Promise.all([import("../dist/services/solana.js")]);
const owner = Keypair.generate().publicKey;
const nftMint = Keypair.generate().publicKey;
const token2022Mint = Keypair.generate().publicKey;
const fungibleMint = Keypair.generate().publicKey;
const nftAccount = Keypair.generate().publicKey;
const token2022NftAccount = Keypair.generate().publicKey;
const fungibleAccount = Keypair.generate().publicKey;
const singleUnitMint = Keypair.generate().publicKey;
const singleUnitAccount = Keypair.generate().publicKey;
const metadataProgram = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const [nftMetadataAddress] = PublicKey.findProgramAddressSync([
  Buffer.from("metadata"), metadataProgram.toBuffer(), nftMint.toBuffer()
], metadataProgram);

const parsedEntry = (pubkey, mint, amount, decimals) => ({
  pubkey,
  account: { data: { parsed: { info: { mint: mint.toBase58(), tokenAmount: { amount, decimals } } } } }
});
const mintAccount = (owner, supply, decimals, mintAuthorityOption = 0) => {
  const data = Buffer.alloc(82);
  data.writeUInt32LE(mintAuthorityOption, 0);
  data.writeBigUInt64LE(BigInt(supply), 36);
  data.writeUInt8(decimals, 44);
  return { owner, data };
};
const borshString = (value) => {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
};
const metadata = {
  owner: metadataProgram,
  data: Buffer.concat([Buffer.from([4]), Buffer.alloc(64), borshString("Gengar VMAX"), borshString("GENGAR"), borshString("https://example.invalid/nft.json")])
};

const connection = {
  async getParsedTokenAccountsByOwner(_owner, filter) {
    assert.equal(_owner.toBase58(), owner.toBase58());
    if (filter.programId.equals(TOKEN_PROGRAM_ID)) {
      return { value: [
        parsedEntry(nftAccount, nftMint, "1", 0),
        parsedEntry(fungibleAccount, fungibleMint, "1000000", 6),
        parsedEntry(singleUnitAccount, singleUnitMint, "1", 0)
      ] };
    }
    assert.ok(filter.programId.equals(TOKEN_2022_PROGRAM_ID));
    return { value: [parsedEntry(token2022NftAccount, token2022Mint, "1", 0)] };
  },
  async getMultipleAccountsInfo(mints) {
    const map = new Map([
      [nftMint.toBase58(), mintAccount(TOKEN_PROGRAM_ID, 1, 0)],
      [singleUnitMint.toBase58(), mintAccount(TOKEN_PROGRAM_ID, 7, 0)],
      [token2022Mint.toBase58(), mintAccount(TOKEN_2022_PROGRAM_ID, 1, 0)]
    ]);
    return mints.map((mint) => map.get(mint.toBase58()) ?? (mint.equals(nftMetadataAddress) ? metadata : null));
  }
};

const inventory = await new SolanaService(connection).getOwnedNftMints(owner.toBase58());
assert.equal(inventory.owner, owner.toBase58());
assert.equal(inventory.source, "Solana RPC");
assert.equal(inventory.coverage, "standard_token_nfts_only");
assert.equal(inventory.compressedNftsIncluded, false);
assert.deepEqual(inventory.nfts.map((nft) => nft.mint).sort(), [nftMint.toBase58(), token2022Mint.toBase58()].sort());
assert.ok(inventory.nfts.some((nft) => nft.tokenProgram === TOKEN_PROGRAM_ID.toBase58()));
assert.ok(inventory.nfts.some((nft) => nft.tokenProgram === TOKEN_2022_PROGRAM_ID.toBase58()));
assert.deepEqual(inventory.nfts.find((nft) => nft.mint === nftMint.toBase58()).metadata, {
  name: "Gengar VMAX", symbol: "GENGAR", uri: "https://example.invalid/nft.json"
});
assert.equal(inventory.nfts.find((nft) => nft.mint === token2022Mint.toBase58()).metadata, null);
assert.ok(!inventory.nfts.some((nft) => nft.mint === fungibleMint.toBase58()), "fungible token accounts must not be reported as NFTs");
assert.ok(!inventory.nfts.some((nft) => nft.mint === singleUnitMint.toBase58()), "a one-unit wallet balance must not be mistaken for a one-supply NFT");

const failedService = new SolanaService({
  async getParsedTokenAccountsByOwner() { throw new Error("RPC unavailable"); }
});
await assert.rejects(failedService.getOwnedNftMints(owner.toBase58()), /RPC unavailable/);
const partialService = new SolanaService({
  async getParsedTokenAccountsByOwner(_owner, filter) {
    if (filter.programId.equals(TOKEN_PROGRAM_ID)) return { value: [] };
    throw new Error("Token-2022 RPC unavailable");
  }
});
await assert.rejects(partialService.getOwnedNftMints(owner.toBase58()), /Token-2022 RPC unavailable/);
await assert.rejects(new SolanaService(connection).getOwnedNftMints("not-a-solana-address"));

console.log("NFT inventory integration checks passed.");

