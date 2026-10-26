import { CONFIG } from "../config.js";
/** Client for Collector Crypt's public Gacha API. The partner API key is optional for play endpoints. */
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
    async generatePack(input) {
        return this.postJson("/api/generatePack", input, (value) => typeof value.memo === "string" && typeof value.transaction === "string");
    }
    async generateGift(input) {
        return this.postJson("/api/generateGift", input, (value) => typeof value.memo === "string" && typeof value.transaction === "string");
    }
    async generateGiftClaim(input) {
        return this.postJson("/api/generatePurchasedPack", input, (value) => typeof value.nonce === "string" && typeof value.messageToSign === "string");
    }
    async useGiftClaim(input) {
        return this.postJson("/api/usePurchasedPack", input, (value) => value.success === true && typeof value.memo === "string");
    }
    async generateBuyback(input) {
        return this.postJson("/api/buyback", input, (value) => value.success === true && typeof value.serializedTransaction === "string" &&
            (typeof value.refundAmount === "number" || typeof value.refundAmount === "string") &&
            typeof value.memo === "string");
    }
    async getBuybackAvailability(nftAddress) {
        const params = new URLSearchParams({ nft: nftAddress });
        return this.getJson(`/api/buyback/available?${params.toString()}`);
    }
    async openPack(memo) {
        return this.postJson("/api/openPack", { memo });
    }
    async submitTransaction(signedTransaction) {
        return this.postJson("/api/submitTransaction", { signedTransaction });
    }
    async getJson(path) {
        return this.requestJson(path, "GET");
    }
    async postJson(path, body, validate) {
        return this.requestJson(path, "POST", body, validate);
    }
    async requestJson(path, method, body, validate) {
        const url = new URL(path, this.baseUrl);
        let response;
        try {
            const headers = { accept: "application/json" };
            if (this.apiKey)
                headers["x-api-key"] = this.apiKey;
            if (method === "POST")
                headers["content-type"] = "application/json";
            response = await this.fetcher(url, {
                method,
                headers,
                ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
                signal: AbortSignal.timeout(15_000)
            });
        }
        catch (error) {
            const reason = error instanceof Error ? error.message : "network request failed";
            throw new Error(`Collector Crypt API request failed: ${reason}`);
        }
        if (!response.ok) {
            throw new Error(`Collector Crypt API returned HTTP ${response.status} for ${url.pathname}.`);
        }
        let value;
        try {
            value = await response.json();
        }
        catch {
            throw new Error(`Collector Crypt API returned invalid JSON for ${url.pathname}.`);
        }
        if (validate && (!value || typeof value !== "object" || !validate(value))) {
            throw new Error(`Collector Crypt API returned an unexpected response for ${url.pathname}.`);
        }
        return value;
    }
}
//# sourceMappingURL=collectorCryptApi.js.map