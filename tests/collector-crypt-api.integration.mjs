import assert from "node:assert/strict";
import { CollectorCryptApiService } from "../dist/services/collectorCryptApi.js";
import { Keypair, Transaction, SystemProgram } from "@solana/web3.js";
import bs58 from "bs58";
import { verifyWalletSignedTransaction } from "../dist/services/solanaTransaction.js";

const calls = [];
const responses = [
  { machines: [{ code: "pokemon_50", price: 50 }] },
  { data: [{ winner: "wallet", pack_type: "pokemon_50" }] },
  { pokemon_50: { purchased: 1, gifted: 0 } },
  { wallet: "wallet", received: [] },
  { memo: "memo/with spaces", buyback: [] }
];
const api = new CollectorCryptApiService("https://api.test", async (input, init) => {
  calls.push({ url: new URL(input), init });
  return Response.json(responses.shift());
});

assert.deepEqual(await api.getMachines(), { machines: [{ code: "pokemon_50", price: 50 }] });
assert.equal(calls[0].url.href, "https://api.test/api/machines");
assert.equal(calls[0].init.method, "GET");
assert.deepEqual(calls[0].init.headers, { accept: "application/json" });

assert.deepEqual(await api.getRecentWinners("pokemon_50", 5), { data: [{ winner: "wallet", pack_type: "pokemon_50" }] });
assert.equal(calls[1].url.pathname, "/api/getAllWinners");
assert.equal(calls[1].url.searchParams.get("packType"), "pokemon_50");
assert.equal(calls[1].url.searchParams.get("count"), "5");

assert.deepEqual(await api.getWalletPackActivity("wallet / address"), {
  purchased: { pokemon_50: { purchased: 1, gifted: 0 } },
  gifted: { wallet: "wallet", received: [] }
});
assert.equal(calls[2].url.searchParams.get("wallet"), "wallet / address");
assert.equal(calls[3].url.searchParams.get("wallet"), "wallet / address");

assert.deepEqual(await api.getPackStatus("memo/with spaces"), { memo: "memo/with spaces", buyback: [] });
assert.equal(calls[4].url.searchParams.get("memo"), "memo/with spaces");

let authenticatedHeaders;
const authenticatedApi = new CollectorCryptApiService("https://api.test", async (_input, init) => {
  authenticatedHeaders = init.headers;
  return Response.json({ machines: [] });
}, " test-partner-key ");
await authenticatedApi.getMachines();
assert.deepEqual(authenticatedHeaders, { accept: "application/json", "x-api-key": "test-partner-key" });

const failedApi = new CollectorCryptApiService("https://api.test", async () => new Response("unauthorized", { status: 401 }));
await assert.rejects(() => failedApi.getMachines(), /HTTP 401/);

const invalidJsonApi = new CollectorCryptApiService("https://api.test", async () => new Response("not json", { status: 200 }));
await assert.rejects(() => invalidJsonApi.getMachines(), /invalid JSON/);

assert.throws(() => new CollectorCryptApiService("http://example.com"), /must use HTTPS/);

const postCalls = [];
const postResponses = [
  { memo: "cc-pack", transaction: "dHhu" },
  { giftId: 4, memo: "cc-gift", transaction: "Z2lmdA==", totalCost: 50 },
  { success: true, serializedTransaction: "YnVieWFjaw==", refundAmount: 42500000, memo: "cc-pack" },
  { success: true, nonce: "nonce-1", messageToSign: "Open my purchased pokemon_50 pack!\n\nNonce:nonce-1" },
  { success: true, memo: "cc-claimed", packsRemaining: 0 },
  { success: true, signature: "real-signature", confirmationStatus: "confirmed" },
  { success: true, nft_address: "real-nft" }
];
const writeApi = new CollectorCryptApiService("https://api.test", async (input, init) => {
  postCalls.push({ url: new URL(input), init });
  return Response.json(postResponses.shift());
});
assert.deepEqual(await writeApi.generatePack({ playerAddress: "wallet", packType: "pokemon_50", turbo: true }), { memo: "cc-pack", transaction: "dHhu" });
assert.deepEqual(await writeApi.generateGift({ sender: "sender", receiver: "receiver", packType: "pokemon_50", count: 1 }), { giftId: 4, memo: "cc-gift", transaction: "Z2lmdA==", totalCost: 50 });
assert.deepEqual(await writeApi.generateBuyback({ playerAddress: "wallet", nftAddress: "mint" }), { success: true, serializedTransaction: "YnVieWFjaw==", refundAmount: 42500000, memo: "cc-pack" });
assert.deepEqual(await writeApi.generateGiftClaim({ publicKey: "wallet", packType: "pokemon_50" }), { success: true, nonce: "nonce-1", messageToSign: "Open my purchased pokemon_50 pack!\n\nNonce:nonce-1" });
assert.deepEqual(await writeApi.useGiftClaim({ signedMessage: "message", signature: "sig", publicKey: "wallet", nonce: "nonce-1", packType: "pokemon_50" }), { success: true, memo: "cc-claimed", packsRemaining: 0 });
assert.deepEqual(await writeApi.submitTransaction("signed-base64"), { success: true, signature: "real-signature", confirmationStatus: "confirmed" });
assert.deepEqual(await writeApi.openPack("cc-pack"), { success: true, nft_address: "real-nft" });
assert.deepEqual(postCalls.map(({ url }) => url.pathname), ["/api/generatePack", "/api/generateGift", "/api/buyback", "/api/generatePurchasedPack", "/api/usePurchasedPack", "/api/submitTransaction", "/api/openPack"]);
assert.deepEqual(postCalls.map(({ init }) => JSON.parse(init.body)), [
  { playerAddress: "wallet", packType: "pokemon_50", turbo: true },
  { sender: "sender", receiver: "receiver", packType: "pokemon_50", count: 1 },
  { playerAddress: "wallet", nftAddress: "mint" },
  { publicKey: "wallet", packType: "pokemon_50" },
  { signedMessage: "message", signature: "sig", publicKey: "wallet", nonce: "nonce-1", packType: "pokemon_50" },
  { signedTransaction: "signed-base64" },
  { memo: "cc-pack" }
]);
assert.ok(postCalls.every(({ init }) => init.method === "POST" && init.headers["content-type"] === "application/json"));

const owner = Keypair.generate();
const other = Keypair.generate();
const tx = new Transaction({ feePayer: owner.publicKey, recentBlockhash: bs58.encode(new Uint8Array(32).fill(7)) }).add(
  SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: other.publicKey, lamports: 1 })
);
const unsignedBase64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
tx.partialSign(owner);
const signedBase64 = tx.serialize().toString("base64");
assert.doesNotThrow(() => verifyWalletSignedTransaction(unsignedBase64, signedBase64, owner.publicKey.toBase58()));
assert.throws(() => verifyWalletSignedTransaction(unsignedBase64, signedBase64, other.publicKey.toBase58()), /signature is missing or invalid/);
const changedTx = Transaction.from(Buffer.from(signedBase64, "base64"));
changedTx.instructions[0].keys[1].pubkey = Keypair.generate().publicKey;
changedTx.sign(owner);
assert.throws(() => verifyWalletSignedTransaction(unsignedBase64, changedTx.serialize().toString("base64"), owner.publicKey.toBase58()), /does not match the exact/);

console.log("Collector Crypt live API integration checks passed.");
