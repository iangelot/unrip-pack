type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
export interface GeneratedGachaTransaction {
    memo: string;
    transaction: string;
    [key: string]: unknown;
}
/** Client for Collector Crypt's public Gacha API. The partner API key is optional for play endpoints. */
export declare class CollectorCryptApiService {
    private readonly baseUrl;
    private readonly fetcher;
    private readonly apiKey;
    constructor(baseUrl?: string, fetcher?: FetchLike, apiKey?: string);
    getMachines(): Promise<unknown>;
    getRecentWinners(packType?: string, count?: number): Promise<unknown>;
    getWalletPackActivity(walletAddress: string): Promise<{
        purchased: unknown;
        gifted: unknown;
    }>;
    getPackStatus(memo: string): Promise<unknown>;
    generatePack(input: {
        playerAddress: string;
        packType: string;
        turbo?: boolean;
    }): Promise<GeneratedGachaTransaction>;
    generateGift(input: {
        sender: string;
        receiver: string;
        packType: string;
        count?: number;
    }): Promise<GeneratedGachaTransaction & {
        totalCost?: number;
        giftId?: number;
    }>;
    generateGiftClaim(input: {
        publicKey: string;
        packType: string;
        ledger?: boolean;
    }): Promise<{
        success: boolean;
        nonce: string;
        messageToSign: string;
        expiry?: string;
        ledger?: boolean;
    }>;
    useGiftClaim(input: {
        signedMessage: string;
        signature: string;
        publicKey: string;
        nonce: string;
        packType: string;
        turbo?: boolean;
    }): Promise<{
        success: boolean;
        memo: string;
        packsRemaining?: number;
    }>;
    generateBuyback(input: {
        playerAddress: string;
        nftAddress: string;
        altRecipient?: string;
    }): Promise<{
        success: true;
        serializedTransaction: string;
        refundAmount: number | string;
        memo: string;
    }>;
    getBuybackAvailability(nftAddress: string): Promise<{
        available: boolean;
        amount?: number;
        buybackExpiresAt?: string;
    }>;
    openPack(memo: string): Promise<unknown>;
    submitTransaction(signedTransaction: string): Promise<{
        success: boolean;
        signature?: string;
        confirmationStatus?: string;
        [key: string]: unknown;
    }>;
    private getJson;
    private postJson;
    private requestJson;
}
export {};
