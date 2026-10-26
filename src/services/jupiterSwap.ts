import { CONFIG } from "../config.js";

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: unknown[];
  [key: string]: unknown;
}

export class JupiterSwapService {
  private baseUrl = "https://quote-api.jup.ag/v6";

  /**
   * Fetch an optimized swap quote between Solana tokens (e.g. USDC and $CARDS)
   */
  async getQuote(params: {
    inputMint: string;
    outputMint: string;
    amountAtomic: number | bigint;
    slippageBps?: number;
  }): Promise<JupiterQuoteResponse> {
    const slippage = params.slippageBps ?? 50; // default 0.5%
    const url = new URL(`${this.baseUrl}/quote`);
    url.searchParams.set("inputMint", params.inputMint);
    url.searchParams.set("outputMint", params.outputMint);
    url.searchParams.set("amount", params.amountAtomic.toString());
    url.searchParams.set("slippageBps", slippage.toString());

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000)
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Jupiter quote error (${res.status}): ${errorText || res.statusText}`);
    }

    const data = await res.json();
    return data as JupiterQuoteResponse;
  }

  /**
   * Build a serialized base64 VersionedTransaction for the swap
   */
  async createSwapTransaction(params: {
    quoteResponse: JupiterQuoteResponse;
    userPublicKey: string;
    wrapAndUnwrapSol?: boolean;
  }): Promise<{ swapTransaction: string; lastValidBlockHeight?: number }> {
    const res = await fetch(`${this.baseUrl}/swap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        quoteResponse: params.quoteResponse,
        userPublicKey: params.userPublicKey,
        wrapAndUnwrapSol: params.wrapAndUnwrapSol ?? true
      }),
      signal: AbortSignal.timeout(12_000)
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Jupiter swap error (${res.status}): ${errorText || res.statusText}`);
    }

    const data = await res.json() as { swapTransaction: string; lastValidBlockHeight?: number };
    if (!data.swapTransaction || typeof data.swapTransaction !== "string") {
      throw new Error("Jupiter did not return a valid serialized swap transaction.");
    }

    return data;
  }
}
