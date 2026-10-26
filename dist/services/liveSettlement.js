/**
 * The repository currently contains local simulations for pack, swap, buyback,
 * loan, transfer, and redemption flows. Keep all money-moving actions disabled
 * until a real program/API is wired in and its transaction is confirmed.
 */
export function liveSettlementUnavailable(action) {
    return {
        content: [{
                type: "text",
                text: JSON.stringify({
                    status: "UNAVAILABLE",
                    sandbox: true,
                    action,
                    message: "This action is a local simulation. No Solana transaction, payout, NFT burn, card transfer, loan, or shipment is currently implemented. Do not treat estimates or local records as assets or receipts."
                }, null, 2)
            }],
        isError: true
    };
}
export function hasLiveSettlement() {
    return false;
}
//# sourceMappingURL=liveSettlement.js.map