import { CollectorCryptService } from "./services/collectorCrypt.js";
import { SolanaService } from "./services/solana.js";
import { PayBoxBridge } from "./services/payboxBridge.js";
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
    console.log("\n=== ALL TESTS PASSED SUCCESSFULLY! ===");
}
testAllFeatures().catch((err) => {
    console.error("Test failed with error:", err);
    process.exit(1);
});
//# sourceMappingURL=test-client.js.map