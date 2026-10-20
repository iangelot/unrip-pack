import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";

const [{ SolanaService }, { AccountService }, { CollectorCryptService }, { registerAccountTools }, { registerVaultTools }] = await Promise.all([
  import("../dist/services/solana.js"),
  import("../dist/services/accountService.js"),
  import("../dist/services/collectorCrypt.js"),
  import("../dist/tools/accountTools.js"),
  import("../dist/tools/vaultTools.js")
]);

const wallet = Keypair.generate().publicKey.toBase58();
const validSignature = "5".repeat(87);
const rpc = {
  async getSignatureStatuses() {
    return {
      value: [{
        err: null,
        confirmationStatus: "confirmed",
        confirmations: 3,
        slot: 123
      }]
    };
  }
};
const solanaStatus = new SolanaService(rpc);
const solana = {
  async getBalances(address) {
    return { address, sol: 0.1, usdc: 2.5, cards: 0 };
  },
  getOnChainSignatureStatus: (signature) => solanaStatus.getOnChainSignatureStatus(signature)
};
const accounts = new AccountService({
  getBalances: solana.getBalances
});
await accounts.connectWallet(wallet, false);
assert.equal(accounts.verifySpendLimits(50).allowed, true);
assert.equal(accounts.verifySpendLimits(101).allowed, false);
assert.equal(accounts.verifySpendLimits(Number.NaN).allowed, false);
accounts.recordSpend(490);
assert.equal(accounts.verifySpendLimits(11).allowed, false);
assert.equal(accounts.verifySpendLimits(10).allowed, true);
accounts.recordPackOpening({
  id: "sandbox-pack",
  packId: "sample",
  packTitle: "Sandbox example",
  openedAt: new Date().toISOString(),
  paidAmount: 50,
  paidCurrency: "USDC",
  isProfit: true,
  netPnlUsdc: 400,
  txSignature: "5KtPn8Y4zH1m...mock...tx1",
  cardPulled: {
    id: "sandbox-card",
    name: "Sandbox Gengar",
    certNumber: "not-real",
    nftMint: "not-a-mint",
    estimatedValueUsdc: 450,
    category: "Pokemon",
    set: "Sandbox",
    year: 2025,
    gradingCompany: "BGS",
    grade: "9.5",
    floorPriceUsdc: 0,
    vaultLocation: "Sandbox",
    imageUrl: "",
    isAvailableForTrade: true
  }
});

const handlers = new Map();
const server = { tool: (name, _description, _schema, handler) => handlers.set(name, handler) };
const collectorCrypt = new CollectorCryptService();
registerAccountTools(server, accounts, collectorCrypt, solana);
registerVaultTools(server, collectorCrypt, accounts);

const portfolio = JSON.parse((await handlers.get("get_portfolio_summary")({})).content[0].text);
assert.equal(portfolio.dataMode, "live_onchain_balances_only");
assert.equal(portfolio.tokenBalances.usdc, 2.5);
assert.equal(portfolio.cardCollection.status, "unavailable");
assert.equal(portfolio.totalNetWorthUsdc, null);
assert.equal("topCards" in portfolio, false);
assert.equal("sandboxEstimatedNetWorthUsdc" in portfolio, false);
assert.equal("allTimePackPnlUsdc" in portfolio, false);

const collection = JSON.parse((await handlers.get("get_user_collection")({})).content[0].text);
assert.equal(collection.status, "unavailable");
assert.equal(collection.verified, false);
assert.deepEqual(collection.cards, []);

const transaction = JSON.parse((await handlers.get("get_transaction_status")({ signature: validSignature })).content[0].text);
assert.equal(transaction.status, "confirmed");
assert.equal(transaction.source, "Solana RPC");
assert.equal(transaction.localHistoryRecord, null);

const invalidSignature = await handlers.get("get_transaction_status")({ signature: "5KtPn8Y4zH1m...mock...tx1" });
assert.equal(invalidSignature.isError, true);
assert.match(invalidSignature.content[0].text, /full base58 transaction signature/);

console.log("Wallet data-integrity checks passed.");
