import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Keypair } from "@solana/web3.js";

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "unrip-wallet-portfolio-"));
const originalCwd = process.cwd();
process.chdir(testDir);
fs.mkdirSync(path.join(testDir, "data"), { recursive: true });

const walletA = Keypair.generate().publicKey.toBase58();
const walletB = Keypair.generate().publicKey.toBase58();
const legacyCard = {
  id: "cc-pkmn-003",
  name: "Gengar VMAX Alternate Art Secret Rare #271",
  certNumber: "001429910",
  nftMint: "GengarVMAXAlt111111111111111111111111111111",
  estimatedValueUsdc: 450
};
const legacyAccount = {
  walletAddress: walletA,
  connectedVia: "Solana Native",
  isConnected: true,
  balances: { sol: 1.85, usdc: 423, cards: 12500 },
  spendLimits: {
    perTransactionCapUsd: 100,
    dailySpendCapUsd: 500,
    dailySpentSoFarUsd: 35,
    requiresPasskeyAboveUsd: 50
  },
  isVerifiedOwner: false,
  createdAt: new Date().toISOString(),
  lastActive: new Date().toISOString()
};
fs.writeFileSync(path.join(testDir, "data", "collector_vault_state.json"), JSON.stringify({
  accounts: { [walletA]: legacyAccount },
  userCardPortfolios: { [walletA]: [legacyCard] },
  packHistory: [{ id: "legacy-global-pack", txSignature: "5KtPn8Y4zH1m...mock...tx1" }],
  transactionHistory: [{ signature: "5KtPn8Y4zH1m...mock...tx1" }]
}));

const [{ AccountService }, { CollectorCryptService }, { registerRedemptionTools }] = await Promise.all([
  import("../dist/services/accountService.js"),
  import("../dist/services/collectorCrypt.js"),
  import("../dist/tools/redemptionTools.js")
]);

const solana = {
  async getBalances(address) {
    return { address, sol: 0.001595, usdc: 0.002863, cards: 0 };
  }
};
const accounts = new AccountService(solana);
assert.equal(accounts.getAccount().isConnected, false, "new sessions must start disconnected");
assert.deepEqual(accounts.getAccount().balances, { sol: 0, usdc: 0, cards: 0 }, "new sessions must not have seeded balances");
assert.equal(accounts.getPackHistory().totalOpened, 0, "legacy global sample pack history must be discarded");
assert.equal(accounts.getTransactionHistory().total, 0, "legacy global sample transaction history must be discarded");

await accounts.connectWallet(walletA, false);
assert.deepEqual(accounts.getAccount().balances, { sol: 0.001595, usdc: 0.002863, cards: 0 }, "cached sandbox balances must be replaced with current RPC balances");
assert.equal(accounts.getPackHistory().totalOpened, 0, "old global pack history must not be attributed to a wallet");

const collection = new CollectorCryptService();
assert.equal(collection.getUserVaultCards(walletA, 10).total, 0, "legacy seeded Gengar must be cleared");
assert.equal(collection.getUserVaultCards(walletB, 10).total, 0, "a fresh wallet must start with an empty collection");

accounts.recordTransaction({
  signature: "wallet-a-local-entry",
  type: "PACK_OPEN",
  status: "finalized",
  timestamp: new Date().toISOString(),
  description: "test record",
  amountUsd: 1,
  solanaExplorerUrl: ""
});
assert.equal(accounts.getTransactionHistory().total, 1);
await accounts.connectWallet(walletB, false);
assert.equal(accounts.getTransactionHistory().total, 0, "transaction history must be wallet-scoped");
await accounts.connectWallet(walletA, false);
assert.equal(accounts.getTransactionHistory().total, 1, "wallet A history must remain attached to wallet A");
accounts.recordPackOpening({
  id: "wallet-a-pack",
  packId: "sandbox-pack",
  packTitle: "Sandbox pack",
  openedAt: new Date().toISOString(),
  paidAmount: 0,
  paidCurrency: "USDC",
  isProfit: false,
  netPnlUsdc: 0,
  txSignature: "sandbox-only-signature",
  cardPulled: {
    ...legacyCard,
    category: "Pokemon",
    set: "Test",
    year: 2025,
    gradingCompany: "BGS",
    grade: "9.5",
    floorPriceUsdc: 0,
    vaultLocation: "Sandbox",
    imageUrl: "",
    isAvailableForTrade: true
  }
});
assert.equal(accounts.getPackHistory().totalOpened, 1);
await accounts.connectWallet(walletB, false);
assert.equal(accounts.getPackHistory().totalOpened, 0, "pack history must be wallet-scoped");
await accounts.connectWallet(walletA, false);
assert.equal(accounts.getPackHistory().totalOpened, 1, "wallet A pack history must remain attached to wallet A");

const handlers = new Map();
registerRedemptionTools({ tool: (name, _description, _schema, handler) => handlers.set(name, handler) }, collection, accounts);
const buybackResult = await handlers.get("execute_card_buyback")({ cardId: "cc-pkmn-003" });
assert.equal(buybackResult.isError, true, "mock buyback execution must be blocked");
const buybackBody = JSON.parse(buybackResult.content[0].text);
assert.equal(buybackBody.status, "UNAVAILABLE");
assert.equal(buybackBody.sandbox, true);
assert.equal(accounts.getAccount().balances.usdc, 0.002863, "blocked buyback must not mutate wallet balances");

process.chdir(originalCwd);
await new Promise(resolve => setTimeout(resolve, 1600));
fs.rmSync(testDir, { recursive: true, force: true });
console.log("Wallet portfolio integration checks passed.");
