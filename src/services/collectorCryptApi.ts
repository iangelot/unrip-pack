import { CONFIG } from "../config.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface GeneratedGachaTransaction {
  memo: string;
  transaction: string;
  [key: string]: unknown;
}

/** Client for Collector Crypt's public Gacha API. The partner API key is optional for play endpoints. */
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

  async generatePack(input: { playerAddress: string; packType: string; turbo?: boolean }): Promise<GeneratedGachaTransaction> {
    return this.postJson<GeneratedGachaTransaction>("/api/generatePack", input, (value) =>
      typeof value.memo === "string" && typeof value.transaction === "string"
    );
  }

  async generateGift(input: { sender: string; receiver: string; packType: string; count?: number }): Promise<GeneratedGachaTransaction & { totalCost?: number; giftId?: number }> {
    return this.postJson("/api/generateGift", input, (value) =>
      typeof value.memo === "string" && typeof value.transaction === "string"
    );
  }

  async generateGiftClaim(input: { publicKey: string; packType: string; ledger?: boolean }): Promise<{
    success: boolean; nonce: string; messageToSign: string; expiry?: string; ledger?: boolean;
  }> {
    return this.postJson("/api/generatePurchasedPack", input, (value) =>
      typeof value.nonce === "string" && typeof value.messageToSign === "string"
    );
  }

  async useGiftClaim(input: { signedMessage: string; signature: string; publicKey: string; nonce: string; packType: string; turbo?: boolean }): Promise<{
    success: boolean; memo: string; packsRemaining?: number;
  }> {
    return this.postJson("/api/usePurchasedPack", input, (value) =>
      value.success === true && typeof value.memo === "string"
    );
  }

  async generateBuyback(input: { playerAddress: string; nftAddress: string; altRecipient?: string }): Promise<{
    success: true;
    serializedTransaction: string;
    refundAmount: number | string;
    memo: string;
  }> {
    return this.postJson("/api/buyback", input, (value) =>
      value.success === true && typeof value.serializedTransaction === "string" &&
      (typeof value.refundAmount === "number" || typeof value.refundAmount === "string") &&
      typeof value.memo === "string"
    );
  }

  async getBuybackAvailability(nftAddress: string): Promise<{ available: boolean; amount?: number; buybackExpiresAt?: string }> {
    const params = new URLSearchParams({ nft: nftAddress });
    return this.getJson(`/api/buyback/available?${params.toString()}`) as Promise<{ available: boolean; amount?: number; buybackExpiresAt?: string }>;
  }

  async openPack(memo: string): Promise<unknown> {
    return this.postJson("/api/openPack", { memo });
  }

  async submitTransaction(signedTransaction: string): Promise<{ success: boolean; signature?: string; confirmationStatus?: string; [key: string]: unknown }> {
    return this.postJson("/api/submitTransaction", { signedTransaction });
  }

  private async getJson(path: string): Promise<unknown> {
    return this.requestJson(path, "GET");
  }

  private async postJson<T = unknown>(path: string, body: unknown, validate?: (value: Record<string, any>) => boolean): Promise<T> {
    return this.requestJson(path, "POST", body, validate) as Promise<T>;
  }

  private async requestJson(path: string, method: "GET" | "POST", body?: unknown, validate?: (value: Record<string, any>) => boolean): Promise<unknown> {
    const url = new URL(path, this.baseUrl);
    let response: Response;
    try {
      const headers: Record<string, string> = { accept: "application/json" };
      if (this.apiKey) headers["x-api-key"] = this.apiKey;
      if (method === "POST") headers["content-type"] = "application/json";
      response = await this.fetcher(url, {
        method,
        headers,
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15_000)
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "network request failed";
      throw new Error(`Collector Crypt API request failed: ${reason}`);
    }

    if (!response.ok) {
      throw new Error(`Collector Crypt API returned HTTP ${response.status} for ${url.pathname}.`);
    }
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new Error(`Collector Crypt API returned invalid JSON for ${url.pathname}.`);
    }
    if (validate && (!value || typeof value !== "object" || !validate(value as Record<string, any>))) {
      throw new Error(`Collector Crypt API returned an unexpected response for ${url.pathname}.`);
    }
    return value;
  }
}
