import dotenv from "dotenv";
dotenv.config();

export const CONFIG = {
  // Solana RPC (Public fallback or custom e.g. Helius / QuickNode)
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  
  // Collector Crypt Token & Contract Constants
  CARDS_MINT_ADDRESS: process.env.CARDS_MINT_ADDRESS || "CARDSccUMFKoPRZxt5vt3ksUbxEFEcnZ3H2pd3dKxYjp",
  USDC_MINT_ADDRESS: process.env.USDC_MINT_ADDRESS || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  
  // Collector Crypt Vault & Program Addresses (Solana Mainnet)
  COLLECTOR_CRYPT_PROGRAM_ID: process.env.COLLECTOR_CRYPT_PROGRAM_ID || "Co11ectorCrypt11111111111111111111111111111",
  COLLECTOR_TREASURY_WALLET: process.env.COLLECTOR_TREASURY_WALLET || "Card5Treasury111111111111111111111111111111",
  
  // PayBox Integration Defaults
  PAYBOX_DEFAULT_SLIPPAGE_BPS: 50, // 0.5%
  PAYBOX_MAX_AUTONOMOUS_USD: 100, // Safe threshold before requesting explicit passkey confirmation
  
  // External APIs
  COLLECTOR_CRYPT_GACHA_API_BASE_URL: process.env.COLLECTOR_CRYPT_GACHA_API_BASE_URL || "https://gacha.collectorcrypt.com",
  // Keep partner credentials server-side; never expose them through MCP tools.
  COLLECTOR_CRYPT_GACHA_API_KEY: process.env.COLLECTOR_CRYPT_GACHA_API_KEY || "",
  JUPITER_PRICE_API: "https://api.jup.ag/price/v2",
  JUPITER_QUOTE_API: "https://quote-api.jup.ag/v6"
};

