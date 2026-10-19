import { VaultedCard, GachaPack, BuybackQuote, PhysicalRedemptionQuote } from "../types.js";
export declare class CollectorCryptService {
    private vaultedInventory;
    private activePacks;
    /**
     * Search and filter vaulted physical cards
     */
    searchVaultInventory(params: {
        query?: string;
        category?: string;
        gradingCompany?: string;
        minPriceUsdc?: number;
        maxPriceUsdc?: number;
        limit?: number;
    }): {
        totalFound: number;
        cards: VaultedCard[];
    };
    /**
     * Get single card metadata & vault certification details
     */
    getCardById(cardId: string): VaultedCard | undefined;
    private userCardPortfolios;
    /**
     * Get cards held by a user's address with pagination support
     */
    getUserVaultCards(userAddress: string, limit?: number, offset?: number): {
        total: number;
        cards: VaultedCard[];
        hasMore: boolean;
        nextOffset?: number;
    };
    /**
     * Add a newly pulled card to the user's active collection
     */
    addCardToUserCollection(userAddress: string, card: VaultedCard): void;
    /**
     * Remove card on buyback or physical redemption burn
     */
    removeCardFromUserCollection(userAddress: string, cardId: string): VaultedCard;
    /**
     * Execute randomized Gacha pack opening with authentic odds
     */
    openGachaPack(packId: string, userAddress: string): {
        cardPulled: VaultedCard;
        netPnlUsdc: number;
        isProfit: boolean;
        txSignature: string;
    };
    /**
     * List available Gacha packs
     */
    getPackDrops(): GachaPack[];
    /**
     * Get specific Gacha pack by ID
     */
    getPackById(packId: string): GachaPack | undefined;
    /**
     * Get live $CARDS token price, market stats, and liquidity
     */
    getCardsTokenStats(): Promise<{
        symbol: string;
        mint: string;
        priceUsd: number;
        priceChange24h: string;
        marketCapUsd: string;
        circulatingSupply: string;
        fdvUsd: string;
        primaryDEX: string;
        buybackFundBalanceUsdc: number;
    }>;
    /**
     * Generate an instant buyback liquidity quote for a tokenized card
     */
    getInstantBuybackQuote(cardId: string): BuybackQuote;
    /**
     * Generate a physical redemption and vault dispatch quote
     */
    getPhysicalRedemptionQuote(cardId: string, destinationCountry?: string): PhysicalRedemptionQuote;
}
