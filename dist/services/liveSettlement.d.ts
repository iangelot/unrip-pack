/**
 * The repository currently contains local simulations for pack, swap, buyback,
 * loan, transfer, and redemption flows. Keep all money-moving actions disabled
 * until a real program/API is wired in and its transaction is confirmed.
 */
export declare function liveSettlementUnavailable(action: string): {
    content: {
        type: string;
        text: string;
    }[];
    isError: boolean;
};
export declare function hasLiveSettlement(): boolean;
