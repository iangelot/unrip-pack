export type GradingCompany = "PSA" | "BGS" | "CGC" | "SGC";

export interface VaultedCard {
  id: string;
  name: string;
  category: "Pokemon" | "Sports" | "OnePiece" | "MagicTheGathering" | "Other";
  set: string;
  year: number;
  gradingCompany: GradingCompany;
  grade: string; // e.g. "10 Gem Mint", "9.5 Mint+"
  certNumber: string;
  estimatedValueUsdc: number;
  floorPriceUsdc: number;
  vaultLocation: string; // e.g. "PSA Vault (Delaware, USA)"
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
    grade10Odds: string; // e.g. "18.5%"
    grade9Odds: string;  // e.g. "62.0%"
    vintageOdds: string; // e.g. "8.2%"
  };
  description: string;
  popularityRank?: number; // e.g. 1 (#1 Most Trending)
  trendingScore?: number; // e.g. 98.4 / 100
  badge?: string; // e.g. "🔥 #1 MOST TRENDING", "⚡ HIGH VELOCITY", "👑 VINTAGE GRAILS"
  volume24hUsdc?: number; // e.g. 48500
  packsOpened24h?: number; // e.g. 312
  selloutPercentage?: string; // e.g. "62.2% sold out"
  recentBigPull?: string; // e.g. "Pulled 22m ago: Umbreon VMAX Moonbreon PSA 10 ($1,200)"
  expectedValueUsdc?: number; // e.g. 48.5
  expectedRoiPercent?: string; // e.g. "+38.6%"
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

// ==========================================
// User Identity, Account, & Safety Types
// ==========================================

export interface SpendLimits {
  perTransactionCapUsd: number; // Max allowed spend in single action (default $100)
  dailySpendCapUsd: number;     // Max allowed spend per 24h (default $500)
  dailySpentSoFarUsd: number;   // Amount spent in current 24h window
  requiresPasskeyAboveUsd: number; // Auto-escalate threshold (default $50)
}

export interface UserAccount {
  walletAddress: string;
  connectedVia: "PayBox MPC Vault" | "Solana Native" | "Default Agent Session" | "Sign-In with Solana (SIWS)" | "Read-Only Spectator";
  isConnected: boolean;
  balances: {
    sol: number;
    usdc: number;
    cards: number;
  };
  spendLimits: SpendLimits;
  isVerifiedOwner?: boolean; // Cryptographically proven owner via private key signature or MPC keypair
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
