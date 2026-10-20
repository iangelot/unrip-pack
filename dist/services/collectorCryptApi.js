import { CONFIG } from "../config.js";
/** Read-only client for Collector Crypt's documented public Gacha API. */
export class CollectorCryptApiService {
    baseUrl;
    fetcher;
    apiKey;
    constructor(baseUrl = CONFIG.COLLECTOR_CRYPT_GACHA_API_BASE_URL, fetcher = fetch, apiKey = CONFIG.COLLECTOR_CRYPT_GACHA_API_KEY) {
        const parsed = new URL(baseUrl);
        if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
            throw new Error("Collector Crypt API URL must use HTTPS.");
        }
        this.baseUrl = parsed;
        this.fetcher = fetcher;
        this.apiKey = apiKey.trim();
    }
    async getMachines() {
        return this.getJson("/api/machines");
    }
    async getRecentWinners(packType, count = 10) {
        const params = new URLSearchParams();
        if (packType)
            params.set("packType", packType);
        params.set("count", String(count));
        return this.getJson(`/api/getAllWinners?${params.toString()}`);
    }
    async getWalletPackActivity(walletAddress) {
        const params = new URLSearchParams({ wallet: walletAddress });
        const [purchased, gifted] = await Promise.all([
            this.getJson(`/api/purchasedPacks?${params.toString()}`),
            this.getJson(`/api/getGifted?${params.toString()}`)
        ]);
        return { purchased, gifted };
    }
    async getPackStatus(memo) {
        const params = new URLSearchParams({ memo });
        return this.getJson(`/api/pack/status?${params.toString()}`);
    }
    async getJson(path) {
        const url = new URL(path, this.baseUrl);
        let response;
        try {
            const headers = { accept: "application/json" };
            if (this.apiKey)
                headers["x-api-key"] = this.apiKey;
            response = await this.fetcher(url, { method: "GET", headers, signal: AbortSignal.timeout(10_000) });
        }
        catch (error) {
            const reason = error instanceof Error ? error.message : "network request failed";
            throw new Error(`Collector Crypt API request failed: ${reason}`);
        }
        if (!response.ok) {
            throw new Error(`Collector Crypt API returned HTTP ${response.status} for ${url.pathname}.`);
        }
        try {
            return await response.json();
        }
        catch {
            throw new Error(`Collector Crypt API returned invalid JSON for ${url.pathname}.`);
        }
    }
}
//# sourceMappingURL=collectorCryptApi.js.map
