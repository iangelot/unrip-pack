export type GradingCompany = "PSA" | "BGS" | "CGC" | "SGC";
export interface VaultedCard {
    id: string;
    name: string;
    category: "Pokemon" | "Sports" | "OnePiece" | "MagicTheGathering" | "Other";
    set: string;
    year: number;
    gradingCompany: GradingCompany;
    grade: string;
    certNumber: string;
    estimatedValueUsdc: number;
    floorPriceUsdc: number;
    vaultLocation: string;
    nftMint: string;
    ownerAddress?: string;
    imageUrl: string;
    isAvailableForTrade: boolean;
    acquiredDate?: string;
}
export interface GachaPack {
    id: string;
    title: string;
    series: string;
    tier: "Standard" | "Elite" | "Master" | "Legendary";
    priceUsdc: number;
    priceCards: number;
    availablePacks: number;
    totalPacks: number;
    topPrizes: string[];
    rarityOdds: {
        grade10Odds: string;
        grade9Odds: string;
        vintageOdds: string;
    };
    description: string;
    popularityRank?: number;
    trendingScore?: number;
    badge?: string;
    volume24hUsdc?: number;
    packsOpened24h?: number;
    selloutPercentage?: string;
    recentBigPull?: string;
    expectedValueUsdc?: number;
    expectedRoiPercent?: string;
}
export interface BuybackQuote {
    cardId: string;
    cardName: string;
    nftMint: string;
    marketValueUsdc: number;
    instantPayoutUsdc: number;
    instantPayoutCards: number;
    feePercent: number;
    quoteExpirySeconds: number;
}
export interface PhysicalRedemptionQuote {
    cardId: string;
    cardName: string;
    nftMint: string;
    certNumber: string;
    vaultLocation: string;
    destinationCountry: string;
    vaultHandlingFeeUsdc: number;
    insuredShippingFeeUsdc: number;
    totalCostUsdc: number;
    estimatedDeliveryDays: string;
    requiredAction: "BURN_NFT_AND_DISPATCH_SLAB";
}
export interface PayBoxExecutionPayload {
    actionType: "SWAP" | "PAYMENT" | "CUSTOM_SIGN";
    suggestedPayboxTool: "request_payment" | "request_swap" | "request_wallet_sign";
    chain: "solana";
    summary: string;
    estimatedCostUsd: number;
    recipientOrProgram?: string;
    tokenMint?: string;
    amount?: number | string;
    serializedTransactionBase64?: string;
    instructionsBreakdown: string[];
    requiresApprovalPrompt: boolean;
    metadata: Record<string, unknown>;
}
export interface SpendLimits {
    perTransactionCapUsd: number;
    dailySpendCapUsd: number;
    dailySpentSoFarUsd: number;
    requiresPasskeyAboveUsd: number;
}
export interface UserAccount {
    walletAddress: string;
    connectedVia: "PayBox MPC Vault" | "Solana Native" | "Default Agent Session";
    isConnected: boolean;
    balances: {
        sol: number;
        usdc: number;
        cards: number;
    };
    spendLimits: SpendLimits;
    createdAt: string;
    lastActive: string;
}
export interface OpenedPackRecord {
    id: string;
    packId: string;
    packTitle: string;
    openedAt: string;
    paidAmount: number;
    paidCurrency: "USDC" | "CARDS";
    cardPulled: VaultedCard;
    isProfit: boolean;
    netPnlUsdc: number;
    txSignature: string;
}
export interface TransactionRecord {
    signature: string;
    type: "PACK_BUY" | "PACK_OPEN" | "SWAP" | "BUYBACK" | "LOAN" | "REDEMPTION";
    status: "confirmed" | "finalized" | "failed";
    timestamp: string;
    description: string;
    amountUsd: number;
    solanaExplorerUrl: string;
}
export interface PortfolioSummary {
    walletAddress: string;
    totalCardsHeld: number;
    totalEstimatedValueUsdc: number;
    unopenedPacksCount: number;
    totalPacksOpenedAllTime: number;
    allTimePackPnlUsdc: number;
    balances: {
        sol: number;
        usdc: number;
        cards: number;
        totalTokenValueUsdc: number;
    };
    totalNetWorthUsdc: number;
    topCards: {
        name: string;
        grade: string;
        valueUsdc: number;
        certNumber: string;
    }[];
}
