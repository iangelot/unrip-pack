import { CONFIG } from "../config.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

/** Read-only client for Collector Crypt's documented public Gacha API. */
export class CollectorCryptApiService {
  private readonly baseUrl: URL;
  private readonly fetcher: FetchLike;
  private readonly apiKey: string;

  constructor(
    baseUrl = CONFIG.COLLECTOR_CRYPT_GACHA_API_BASE_URL,
    fetcher: FetchLike = fetch,
    apiKey = CONFIG.COLLECTOR_CRYPT_GACHA_API_KEY
  ) {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      throw new Error("Collector Crypt API URL must use HTTPS.");
    }
    this.baseUrl = parsed;
    this.fetcher = fetcher;
    this.apiKey = apiKey.trim();
  }

  async getMachines(): Promise<unknown> {
    return this.getJson("/api/machines");
  }

  async getRecentWinners(packType?: string, count = 10): Promise<unknown> {
    const params = new URLSearchParams();
    if (packType) params.set("packType", packType);
    params.set("count", String(count));
    return this.getJson(`/api/getAllWinners?${params.toString()}`);
  }

  async getWalletPackActivity(walletAddress: string): Promise<{ purchased: unknown; gifted: unknown }> {
    const params = new URLSearchParams({ wallet: walletAddress });
    const [purchased, gifted] = await Promise.all([
      this.getJson(`/api/purchasedPacks?${params.toString()}`),
      this.getJson(`/api/getGifted?${params.toString()}`)
    ]);
    return { purchased, gifted };
  }

  async getPackStatus(memo: string): Promise<unknown> {
    const params = new URLSearchParams({ memo });
    return this.getJson(`/api/pack/status?${params.toString()}`);
  }

  private async getJson(path: string): Promise<unknown> {
    const url = new URL(path, this.baseUrl);
    let response: Response;
    try {
      const headers: Record<string, string> = { accept: "application/json" };
      if (this.apiKey) headers["x-api-key"] = this.apiKey;
      response = await this.fetcher(url, { method: "GET", headers, signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "network request failed";
      throw new Error(`Collector Crypt API request failed: ${reason}`);
    }

    if (!response.ok) {
      throw new Error(`Collector Crypt API returned HTTP ${response.status} for ${url.pathname}.`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error(`Collector Crypt API returned invalid JSON for ${url.pathname}.`);
    }
  }
}

