import assert from "node:assert/strict";
import { Keypair, Transaction, SystemProgram, PublicKey } from "@solana/web3.js";
import { verifyWalletSignedTransaction } from "../dist/services/solanaTransaction.js";
import { AccountService } from "../dist/services/accountService.js";
import { SolanaService } from "../dist/services/solana.js";
import { CollectorCryptService } from "../dist/services/collectorCrypt.js";
import { StorageService } from "../dist/services/storageService.js";
import { registerTokenTools } from "../dist/tools/tokenTools.js";
import { registerGachaTools } from "../dist/tools/gachaTools.js";

console.log("🔒 Starting Deep Security Audit Test Suite...");

// 1. TEST: Cryptographic Transaction Tampering & Injection Prevention
console.log("\n[Test 1] Testing Transaction Tamper Detection & Signature Integrity...");
const userKeypair = Keypair.generate();
const attackerKeypair = Keypair.generate();

// Build a legitimate transaction
const txLegit = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: userKeypair.publicKey,
    toPubkey: Keypair.generate().publicKey,
    lamports: 1000
  })
);
const dummyBlockhash = Keypair.generate().publicKey.toBase58();
txLegit.recentBlockhash = dummyBlockhash;
txLegit.feePayer = userKeypair.publicKey;
const unsignedBase64 = txLegit.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");

// Correctly signed by user
txLegit.sign(userKeypair);
const validSignedBase64 = txLegit.serialize().toString("base64");

// Verification must pass for legitimate transaction
assert.doesNotThrow(() => {
  verifyWalletSignedTransaction(unsignedBase64, validSignedBase64, userKeypair.publicKey.toBase58());
}, "Legitimate signed transaction must verify successfully.");
console.log("  ✓ Legitimate signed transaction verified.");

// Attack Vector 1A: Attacker modifies the destination / instructions (Message Tampering)
const txTampered = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: userKeypair.publicKey,
    toPubkey: attackerKeypair.publicKey, // Drain to attacker
    lamports: 1000
  })
);
txTampered.recentBlockhash = dummyBlockhash;
txTampered.feePayer = userKeypair.publicKey;
txTampered.sign(userKeypair);
const tamperedSignedBase64 = txTampered.serialize().toString("base64");

assert.throws(() => {
  verifyWalletSignedTransaction(unsignedBase64, tamperedSignedBase64, userKeypair.publicKey.toBase58());
}, /does not match the exact prepared transaction/, "Tampered instructions must be rejected.");
console.log("  ✓ Instruction & destination tampering blocked by byte-level message comparison.");

// Attack Vector 1B: Attacker signs with their own key instead of the session wallet
const txWrongSigner = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: userKeypair.publicKey,
    toPubkey: Keypair.generate().publicKey,
    lamports: 1000
  })
);
txWrongSigner.recentBlockhash = dummyBlockhash;
txWrongSigner.feePayer = attackerKeypair.publicKey;
txWrongSigner.sign(attackerKeypair);
const wrongSignerBase64 = txWrongSigner.serialize({ requireAllSignatures: false }).toString("base64");

assert.throws(() => {
  verifyWalletSignedTransaction(unsignedBase64, wrongSignerBase64, userKeypair.publicKey.toBase58());
}, "Transaction signed by an unauthorized keypair must be rejected.");
console.log("  ✓ Unauthorized signer signature blocked.");

// 2. TEST: Spending Limits & Daily Caps (Prevent Autonomous Wallet Draining)
console.log("\n[Test 2] Testing Spend Limit & 24h Daily Cap Enforcement...");
const storage = new StorageService();
const accountService = new AccountService(storage);

// Set strict test limits: $50 per transaction, $100 daily
accountService.updateSpendLimits({
  perTransactionCapUsd: 50,
  dailySpendCapUsd: 100
});

// A $40 transaction is within limit
const checkWithinLimit = accountService.verifySpendLimits(40);
assert.equal(checkWithinLimit.allowed, true);
console.log("  ✓ Transaction within limit ($40 <= $50) allowed.");

// A $60 transaction exceeds single-tx cap ($50)
const checkOverSingleLimit = accountService.verifySpendLimits(60);
assert.equal(checkOverSingleLimit.allowed, false);
assert.match(checkOverSingleLimit.errorReason, /exceeds your per-transaction spend limit/);
console.log("  ✓ Transaction exceeding per-tx cap ($60 > $50) blocked.");

// Record $40 spend
accountService.recordSpend(40);

// Record another $40 spend (total = $80)
accountService.recordSpend(40);

// A third $30 spend would reach $110, exceeding the $100 daily cap
const checkOverDailyLimit = accountService.verifySpendLimits(30);
assert.equal(checkOverDailyLimit.allowed, false);
assert.match(checkOverDailyLimit.errorReason, /would exceed your 24h spend cap/);
console.log("  ✓ Cumulative spend exceeding 24h cap ($110 > $100) blocked.");

// 3. TEST: Slippage Boundary Hardening (MEV Sandwich Attack Prevention)
console.log("\n[Test 3] Testing Slippage Parameter Bounds on Jupiter Swaps...");
const mockServer = {
  tools: new Map(),
  tool(name, desc, schema, handler) {
    this.tools.set(name, { desc, schema, handler });
  }
};

const ccService = new CollectorCryptService();
const solanaService = new SolanaService();

registerTokenTools(mockServer, ccService, solanaService, accountService);

const getSwapQuote = mockServer.tools.get("get_swap_quote");
assert.ok(getSwapQuote, "get_swap_quote tool must be registered.");

// Verify Zod schema rejects dangerous 50% slippage (which exposes user to MEV sandwich bots)
const slippageValidator = getSwapQuote.schema.slippagePercent;
const highSlippage = slippageValidator.safeParse(50);
assert.equal(highSlippage.success, false, "50% slippage must be rejected by validation schema.");
console.log("  ✓ Excessive slippage (50%) rejected by schema to prevent sandwich attack.");

// Verify Zod schema rejects zero or negative slippage
const zeroSlippage = slippageValidator.safeParse(0.01);
assert.equal(zeroSlippage.success, false, "0.01% slippage must be rejected (min 0.05%).");
console.log("  ✓ Unrealistically tight slippage (0.01%) rejected.");

// Verify reasonable slippage (0.5%) passes
const normalSlippage = slippageValidator.safeParse(0.5);
assert.equal(normalSlippage.success, true, "0.5% slippage must be accepted.");
console.log("  ✓ Standard safe slippage (0.5%) accepted.");

// 4. TEST: Arbitrary Transaction Injection via submit_token_swap
console.log("\n[Test 4] Testing Rejection of Arbitrary Transactions in submit_token_swap...");
const submitSwap = mockServer.tools.get("submit_token_swap");

// Attempt to call submit_token_swap without a connected wallet
const unauthSubmit = await submitSwap.handler({
  swapId: "fake_nonexistent_swap_id",
  signedTransactionBase64: validSignedBase64
});
assert.equal(unauthSubmit.isError, true);
assert.match(unauthSubmit.content[0].text, /No wallet is connected/);
console.log("  ✓ Unauthenticated swap submission blocked.");

// Attempt to call submit_token_swap with wallet but nonexistent swapId
const unlinkedSubmit = await submitSwap.handler({
  swapId: "fake_nonexistent_swap_id",
  signedTransactionBase64: validSignedBase64,
  userAddress: userKeypair.publicKey.toBase58()
});
assert.equal(unlinkedSubmit.isError, true);
assert.match(unlinkedSubmit.content[0].text, /No active prepared swap found/);
console.log("  ✓ Nonexistent / unapproved swapId blocked from broadcast.");

console.log("\n🎉 ALL 4 CRITICAL NON-OBVIOUS SECURITY AUDIT TESTS PASSED!");
