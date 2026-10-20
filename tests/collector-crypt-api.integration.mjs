import assert from "node:assert/strict";
import { CollectorCryptApiService } from "../dist/services/collectorCryptApi.js";

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

const failedApi = new CollectorCryptApiService("https://api.test", async () => new Response("unauthorized", { status: 401 }));
await assert.rejects(() => failedApi.getMachines(), /HTTP 401/);

const invalidJsonApi = new CollectorCryptApiService("https://api.test", async () => new Response("not json", { status: 200 }));
await assert.rejects(() => invalidJsonApi.getMachines(), /invalid JSON/);

assert.throws(() => new CollectorCryptApiService("http://example.com"), /must use HTTPS/);

console.log("Collector Crypt live API integration checks passed.");

