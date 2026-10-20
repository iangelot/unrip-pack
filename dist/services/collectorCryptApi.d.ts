type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
/** Read-only client for Collector Crypt's documented public Gacha API. */
export declare class CollectorCryptApiService {
    private readonly baseUrl;
    private readonly fetcher;
    constructor(baseUrl?: string, fetcher?: FetchLike);
    getMachines(): Promise<unknown>;
    getRecentWinners(packType?: string, count?: number): Promise<unknown>;
    getWalletPackActivity(walletAddress: string): Promise<{
        purchased: unknown;
        gifted: unknown;
    }>;
    getPackStatus(memo: string): Promise<unknown>;
    private getJson;
}
export {};

