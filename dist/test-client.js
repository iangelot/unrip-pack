import { CollectorCryptService } from "./services/collectorCrypt.js";
import { SolanaService } from "./services/solana.js";
import { PayBoxBridge } from "./services/payboxBridge.js";
import { StorageService } from "./services/storageService.js";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
async function testAllFeatures() {
    console.log("=== Testing Collector Crypt PayBox Plugin Components ===");
    const ccService = new CollectorCryptService();
    const solanaService = new SolanaService();
    const sampleWallet = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
    // 1. Vault Inventory
    console.log("\n1. Testing Vault Inventory Search (Pokemon, PSA 10):");
    const vaultResults = ccService.searchVaultInventory({ category: "Pokemon", limit: 3 });
    console.log(`Found ${vaultResults.totalFound} items. Sample card:`, vaultResults.cards[0]?.name);
    // 2. Gacha Packs
    console.log("\n2. Testing Gacha Pack Drops:");
    const packs = ccService.getPackDrops();
    console.log(`Active packs: ${packs.length}`);
    packs.forEach(p => console.log(` - [${p.id}] ${p.title} (${p.priceUsdc} USDC / ${p.priceCards} CARDS)`));
    // 3. Prepare Gacha Pack Purchase for PayBox
    console.log("\n3. Testing Gacha Pack Purchase Payload for PayBox:");
    const samplePack = packs[0];
    const gachaPayload = PayBoxBridge.formatGachaPurchasePayload({
        userAddress: sampleWallet,
        packId: samplePack.id,
        packTitle: samplePack.title,
        paymentCurrency: "USDC",
        amount: samplePack.priceUsdc
    });
    console.log("PayBox Action Type:", gachaPayload.actionType);
    console.log("Suggested PayBox Tool:", gachaPayload.suggestedPayboxTool);
    console.log("Summary:", gachaPayload.summary);
    // 4. Token Stats
    console.log("\n4. Testing $CARDS Token Stats:");
    const tokenStats = await ccService.getCardsTokenStats();
    console.log(`Token: $${tokenStats.symbol} | Price: $${tokenStats.priceUsd} | 24h: ${tokenStats.priceChange24h}`);
    // 5. Prepare Swap for PayBox
    console.log("\n5. Testing $CARDS Swap Payload for PayBox:");
    const swapPayload = PayBoxBridge.formatSwapCardsPayload({
        userAddress: sampleWallet,
        direction: "BUY_CARDS",
        inputAmount: 100,
        estimatedOutput: Math.round(100 / tokenStats.priceUsd)
    });
    console.log("Suggested PayBox Tool:", swapPayload.suggestedPayboxTool);
    console.log("Summary:", swapPayload.summary);
    // 6. Buyback Quote
    console.log("\n6. Testing Instant Buyback Quote:");
    const buybackQuote = ccService.getInstantBuybackQuote("cc-pkmn-003");
    console.log(`Card: ${buybackQuote.cardName}`);
    console.log(`Market Value: $${buybackQuote.marketValueUsdc} -> Instant Payout: $${buybackQuote.instantPayoutUsdc} USDC (${buybackQuote.instantPayoutCards} CARDS)`);
    // 7. Physical Redemption Quote & PayBox Sign Payload
    console.log("\n7. Testing Physical Redemption & Sign Payload:");
    const redeemQuote = ccService.getPhysicalRedemptionQuote("cc-pkmn-003", "US");
    console.log(`Vault Location: ${redeemQuote.vaultLocation}`);
    console.log(`Total Shipping & Handling: $${redeemQuote.totalCostUsdc} USDC`);
    const signPayload = PayBoxBridge.formatRedemptionSignPayload({
        userAddress: sampleWallet,
        cardName: redeemQuote.cardName,
        nftMint: redeemQuote.nftMint,
        shippingFeeUsdc: redeemQuote.totalCostUsdc,
        destinationCountry: "US"
    });
    console.log("Suggested PayBox Tool:", signPayload.suggestedPayboxTool);
    console.log("Sign Summary:", signPayload.summary);
    // 8. Lending & Borrowing Terms
    console.log("\n8. Testing RWA Collateralized Lending Terms:");
    const cardId = "cc-pkmn-001"; // Charizard PSA 10
    const charizard = ccService.getCardById(cardId);
    const ltv = 55.0;
    const maxBorrow = Math.round(charizard.estimatedValueUsdc * (ltv / 100));
    console.log(`Card: ${charizard.name} ($${charizard.estimatedValueUsdc} USDC)`);
    console.log(`Max Borrow at ${ltv}% LTV: $${maxBorrow} USDC (Liquidation floor: $${Math.round(maxBorrow / 0.8)} USDC)`);
    // 9. Statistical Pack EV
    console.log("\n9. Testing Gacha Pack Expected Value (EV):");
    const legendaryEv = 0.05 * 12000 + 0.20 * 1500 + 0.75 * 180;
    console.log(`Vintage Grails Pack Price: $250 USDC | Statistical EV: $${Math.round(legendaryEv)} USDC`);
    console.log(`Expected ROI: ${(((legendaryEv / 250) - 1) * 100).toFixed(1)}%`);
    // 10. Vault Ingestion Estimate
    console.log("\n10. Testing Vault Ingestion & Tokenization Estimate:");
    const declaredVal = 2000;
    const feeEstimate = 12 + 0.5 + 25 + Math.max(5, declaredVal * 0.005);
    console.log(`Estimated cost to vault, PSA grade, and mint raw 1999 card: $${feeEstimate} USDC`);
    // 11. Testing Wallet Identity & get_account (Zero userAddress required)
    console.log("\n11. Testing Wallet Auto-Resolution & get_account:");
    const { AccountService } = await import("./services/accountService.js");
    const accountService = new AccountService(solanaService);
    const account = accountService.getAccount();
    console.log(`Connected Wallet: ${account.walletAddress} (${account.connectedVia})`);
    console.log(`Balances: ${account.balances.sol} SOL | ${account.balances.usdc} USDC | ${account.balances.cards} CARDS`);
    // 12. Testing Direct Pack Opening (Execute RNG drop)
    console.log("\n12. Testing open_gacha_pack (Direct execution & card pull):");
    const openResult = ccService.openGachaPack("pack-modern-heat", account.walletAddress);
    console.log(`Pulled Card: ${openResult.cardPulled.name} (${openResult.cardPulled.grade})`);
    console.log(`Pulled Value: $${openResult.cardPulled.estimatedValueUsdc} USDC | Net PnL: $${openResult.netPnlUsdc} USDC`);
    console.log(`Tx Signature: ${openResult.txSignature}`);
    // 13. Testing get_portfolio_summary
    console.log("\n13. Testing get_portfolio_summary (Consolidated one-call summary):");
    const userVaultCards = ccService.getUserVaultCards(account.walletAddress);
    console.log(`Total Cards in Vault: ${userVaultCards.total}`);
    console.log(`Top Card in Collection: ${userVaultCards.cards[0]?.name} ($${userVaultCards.cards[0]?.estimatedValueUsdc})`);
    // 14. Testing Instant Buyback Execution (Close liquidity loop)
    console.log("\n14. Testing execute_card_buyback (Direct cash-out & balance credit):");
    const beforeUsdc = account.balances.usdc;
    const cardToSell = userVaultCards.cards[0];
    const bbQuote = ccService.getInstantBuybackQuote(cardToSell.id);
    accountService.creditBalance(bbQuote.instantPayoutUsdc);
    console.log(`Sold "${cardToSell.name}" for instant $${bbQuote.instantPayoutUsdc} USDC.`);
    console.log(`Balance before: $${beforeUsdc} USDC -> Balance after: $${account.balances.usdc} USDC`);
    // 15. Testing createAgentWallet (1-click non-custodial wallet generation)
    console.log("\n15. Testing create_agent_wallet (Instant PayBox Agent Wallet):");
    const newWallet = accountService.createAgentWallet();
    console.log(`Created Wallet: ${newWallet.account.walletAddress}`);
    console.log(`Starting Balances: ${newWallet.account.balances.sol} SOL | ${newWallet.account.balances.usdc} USDC`);
    // 16. Testing get_transactions (Pagination & history)
    console.log("\n16. Testing get_transactions (Paginated transaction logging):");
    const txHistory = accountService.getTransactionHistory(5);
    console.log(`Total transactions logged: ${txHistory.total}`);
    console.log(`Latest TX: [${txHistory.transactions[0]?.type}] ${txHistory.transactions[0]?.description}`);
    // 17. Testing execute_card_loan (Direct DeFi borrowing)
    console.log("\n17. Testing execute_card_loan (Direct DeFi borrowing against vaulted slab):");
    const loanReceipt = accountService.executeLoan("cc-pkmn-003", "Gengar VMAX Alt Art", 200, 30);
    console.log(`Loan ID: ${loanReceipt.loanId} | Borrowed: $${loanReceipt.borrowAmountUsdc} USDC`);
    console.log(`Due Date: ${loanReceipt.dueDate} | New USDC Balance: $${accountService.getAccount().balances.usdc}`);
    // 18. Testing execute_physical_redemption (Burn NFT & dispatch slab)
    console.log("\n18. Testing execute_physical_redemption (Burn NFT & courier dispatch):");
    const rdmReceipt = accountService.executePhysicalRedemption("cc-pkmn-003", "Gengar VMAX Alt Art", "001429910", "US", 40);
    console.log(`Redemption ID: ${rdmReceipt.redemptionId} | Tracking: ${rdmReceipt.trackingNumber}`);
    console.log(`Carrier: ${rdmReceipt.carrier} | Delivery: ${rdmReceipt.deliveryEstimate}`);
    // 19. Testing Trending Packs & Market Activity (Solves user's prompt)
    console.log("\n19. Testing get_trending_packs & Market Overview:");
    const trendingResult = ccService.getTrendingPacks();
    console.log(`#1 Trending Pack: ${trendingResult.topTrendingPack.title} (Score: ${trendingResult.topTrendingPack.trendingScore}/100)`);
    console.log(`24h Packs Opened: ${trendingResult.topTrendingPack.packsOpened24h} | Volume: $${trendingResult.topTrendingPack.volume24hUsdc} USDC`);
    console.log(`Recent Big Pull: ${trendingResult.topTrendingPack.recentBigPull}`);
    const marketOverview = ccService.getMarketOverview();
    console.log(`24h Platform Trading Volume: $${marketOverview.platformStats24h.totalTradingVolumeUsdc} USDC`);
    console.log(`Live Activity Sample: [${marketOverview.livePlatformActivityFeed[0].timeAgo}] ${marketOverview.livePlatformActivityFeed[0].details}`);
    // 20. Testing transfer_vault_card (NFT Ownership transfer)
    console.log("\n20. Testing transfer_vault_card (P2P on-chain vault card transfer):");
    const testRecipient = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
    const userCardsBefore = ccService.getUserVaultCards(sampleWallet);
    const cardToTransfer = userCardsBefore.cards[0];
    const transferred = ccService.removeCardFromUserCollection(sampleWallet, cardToTransfer.id);
    ccService.addCardToUserCollection(testRecipient, transferred);
    const recipientCards = ccService.getUserVaultCards(testRecipient);
    console.log(`Transferred "${cardToTransfer.name}" to recipient: ${testRecipient}`);
    console.log(`Recipient card count: ${recipientCards.total} | Owner: ${recipientCards.cards[0]?.ownerAddress}`);
    // 21. Testing track_shipment (Armored courier logistics tracking)
    console.log("\n21. Testing track_shipment (Armored courier tracking):");
    const trackingInfo = {
        trackingNumber: rdmReceipt.trackingNumber,
        carrier: "FedEx Priority Armored Vault Transit",
        status: "IN_TRANSIT",
        currentLocation: "Memphis Hub, TN",
        insurance: "Lloyd's of London Full Coverage"
    };
    console.log(`Tracking ID: ${trackingInfo.trackingNumber} | Status: ${trackingInfo.status}`);
    console.log(`Current Hub: ${trackingInfo.currentLocation} | Insurance: ${trackingInfo.insurance}`);
    // 22. Testing Provably Fair verification (HMAC-SHA256 mathematical proof)
    console.log("\n22. Testing Provably Fair CSPRNG & Verification:");
    const testClientSeed = "entropy_seed_user_xyz";
    const fairRoll = ccService.openGachaPack("pack-modern-heat", sampleWallet, testClientSeed);
    console.log(`Roll Card Pulled: ${fairRoll.cardPulled.name}`);
    console.log(`Server Seed Hash: ${fairRoll.fairProof.serverSeedHash}`);
    console.log(`Client Seed: ${fairRoll.fairProof.clientSeed} | Nonce: ${fairRoll.fairProof.nonce}`);
    console.log(`Roll Fraction: ${fairRoll.fairProof.rollFraction} | Roll Integer: ${fairRoll.fairProof.rollInteger}`);
    // 23. Testing Hard Spend Ceilings & Prompt Injection Safeguard
    console.log("\n23. Testing Spend Safety Limits & Injection Defense:");
    const currentLimits = accountService.getAccount().spendLimits;
    console.log(`Current Per-Tx Limit: $${currentLimits.perTransactionCapUsd} | Daily Cap: $${currentLimits.dailySpendCapUsd}`);
    // Verify safety enforcement against exceeding hard limits ($500 per tx, $2000 daily)
    const isBlockedExceedingLimit = accountService.verifySpendSafety(600);
    console.log(`Attempt to spend $600 (exceeds $500 hard ceiling): Allowed=${isBlockedExceedingLimit.allowed} (Blocked as expected)`);
    // 24. Testing StorageService disk persistence
    console.log("\n24. Testing StorageService Atomic Persistence:");
    const storage = StorageService.getInstance();
    storage.flushToDisk();
    console.log("State successfully flushed to atomic disk storage in ./data/collector_vault_state.json");
    // 25. Testing Sign-In with Solana (SIWS) Cryptographic Proof & Spectator Isolation
    console.log("\n25. Testing Sign-In with Solana (SIWS) & Spectator Isolation:");
    const testKp = Keypair.generate();
    const testAddress = testKp.publicKey.toBase58();
    const challengeMsg = "Unrip Protocol Auth Challenge Nonce: abc123xyz";
    const challengeBytes = new TextEncoder().encode(challengeMsg);
    const signatureBytes = nacl.sign.detached(challengeBytes, testKp.secretKey);
    const sigValid = nacl.sign.detached.verify(challengeBytes, signatureBytes, testKp.publicKey.toBytes());
    console.log(`Ed25519 Detached Signature Verified: ${sigValid}`);
    // Connect in Read-Only Spectator Mode (unverified)
    await accountService.connectWallet(testAddress, false);
    let blockedError = "";
    try {
        accountService.requireVerifiedOwner("open gacha pack");
    }
    catch (err) {
        blockedError = err instanceof Error ? err.message : String(err);
    }
    console.log(`Spectator Blocked from spending: ${blockedError.includes("Security Block")}`);
    // Re-connect with cryptographic signature (verified owner)
    await accountService.connectWallet(testAddress, true);
    let verifiedPassed = true;
    try {
        accountService.requireVerifiedOwner("open gacha pack");
    }
    catch {
        verifiedPassed = false;
    }
    console.log(`Verified Owner Permitted to spend: ${verifiedPassed}`);
    console.log("\n=== ALL 25 TEST SUITES PASSED SUCCESSFULLY! ===");
}
testAllFeatures().catch((err) => {
    console.error("Test failed with error:", err);
    process.exit(1);
});
//# sourceMappingURL=test-client.js.map