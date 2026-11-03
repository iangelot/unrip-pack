# Collector Crypt & Solana Trading Agent (MCP)

This Model Context Protocol (MCP) server provides autonomous AI agents (Claude, Cursor, etc.) with live access to **Collector Crypt Gacha packs**, on-chain **Solana NFT & token portfolio balances**, and real-time **DEX token swaps via Jupiter Aggregator v6**.

It is 100% self-contained—it requires **no secondary MCPs**, no PayBox subscriptions, and no paid API keys.

---

## Capabilities Overview

| Feature | Status | Implementation |
| :--- | :---: | :--- |
| **Gacha Machines & Live Odds** | 🟢 **Live** | Reads live machine configs, active stock, prices, and drop odds directly from Collector Crypt (`/api/machines`). |
| **Pack Purchase** | 🟢 **Live** | Prepares real Solana transactions via Collector Crypt API (`/api/generatePack`). Supports autonomous 1-click execution or wallet signature. |
| **Pack Opening** | 🟢 **Live** | Opens purchased packs by official memo via Collector Crypt (`/api/openPack`) to assign won collectibles. |
| **Pack Buybacks (Selling back)** | 🟢 **Live** | Checks real-time buyback eligibility (`/api/buyback/available`) and builds on-chain settlement transactions (`/api/buyback`). |
| **DEX Token Swaps ($CARDS / USDC / SOL)** | 🟢 **Live** | Real-time quote routing, price impact, and transaction building via **Jupiter Aggregator v6** with 0 protocol fees. |
| **Wallet Portfolio & Balances** | 🟢 **Live** | Live SOL, USDC, and $CARDS balances via Solana RPC. Scans standard Token & Token-2022 NFTs with Metaplex metadata. |
| **Autonomous Agent Wallet** | 🟠 **Opt-in** | Disabled by default. Requires `ENABLE_AUTONOMOUS_SIGNING=true` plus a dedicated, low-balance agent wallet key. |
| **Web Authorization Portal** | 🟢 **Live** | Built-in OAuth 2.1 & Sign-In with Solana (SIWS) for browser wallets (Phantom, Solflare). |

---

## Live Endpoints (Render)

The service is deployed on Render:
* **Streamable HTTP (Claude Connector spec)**: `<YOUR_DEPLOYMENT_URL>/mcp`
* **Legacy SSE Endpoint**: `<YOUR_DEPLOYMENT_URL>/sse`
* **Health Check**: `<YOUR_DEPLOYMENT_URL>/health`
* **Wallet Authorization Portal**: `<YOUR_DEPLOYMENT_URL>/oauth/authorize`

---

## How to Connect to AI Clients

### 1. Claude Desktop / Cursor (Stdio Mode)
Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "collector-crypt": {
      "command": "node",
      "args": ["<path-to-repo>/dist/index.js"],
      "env": {
        "SOLANA_RPC_URL": "https://api.mainnet-beta.solana.com",
        "AGENT_PRIVATE_KEY": "<optional-base58-solana-private-key>"
      }
    }
  }
}
```

### 2. Remote / Web (Claude.ai Custom Connector)
* **Server URL**: `<YOUR_DEPLOYMENT_URL>/mcp`
* **Authentication**: OAuth 2.1 (Auto-discovered via `/.well-known/oauth-authorization-server`)

---

## Key MCP Tools

### Gacha Pack Operations
* `get_pack_drops`: List active live Gacha machines, current USDC prices, and rarity drop odds.
* `get_trending_packs`: View recent winning pulls on Collector Crypt.
* `get_collector_crypt_pack_status`: Check confirmation and reward status of any pack by its memo.
* `prepare_collector_crypt_pack_purchase`: Reserve a memo and get an unsigned Solana transaction for any live machine.
* `execute_collector_crypt_pack_purchase`: 1-step autonomous pack purchase (when `AGENT_PRIVATE_KEY` is configured).
* `open_collector_crypt_pack`: Open a confirmed pack to reveal and mint the won collectible NFT to your wallet.
* `prepare_collector_crypt_buyback`: Get instant buyback quotes and build the sellback transaction for eligible pack wins.
* `submit_collector_crypt_transaction`: Submit signed transactions to Collector Crypt's broadcaster.

### Jupiter DEX Token Swaps
* `get_swap_quote`: Real-time quote for swapping USDC <-> $CARDS (or SOL) with exact output and route.
* `prepare_swap_cards`: Generate a serialized Solana VersionedTransaction for the swap.
* `submit_token_swap`: Broadcast a signed swap transaction directly to Solana RPC.
* `execute_token_swap`: 1-step autonomous swap (when `AGENT_PRIVATE_KEY` is configured).

### Balances & Portfolio
* `get_user_balances`: Real-time SOL, USDC, and $CARDS balances from Solana RPC.
* `get_wallet_nft_inventory`: On-chain Token and Token-2022 NFT holdings with Metaplex metadata.
* `get_portfolio_summary`: Consolidated token and NFT portfolio summary.
* `update_spend_limits`: Configure safety ceilings ($ per transaction, daily spend caps).

---

## Development & Testing

```bash
# Install dependencies
npm install

# Run TypeScript compilation
npm run build

# Run Collector Crypt live API tests
npm run test:collector-api

# Run component and portfolio integration tests
npm run test:client
```

---

## Security & Guardrails

**Security status:** This project has not been independently audited. The included auditor page is informational only and does not perform live vulnerability tests. Do not use it as evidence that the server is secure or production-ready.

1. **Spend Limits**: Built-in enforcement of maximum per-transaction caps and daily limits.
2. **Key Safety**: Autonomous signing is disabled by default. If explicitly enabled, keys must be stored only as deployment secrets and must belong to a dedicated low-balance wallet—not a personal or treasury wallet.
3. **Transaction Validation**: Review every transaction in your wallet before signing. Do not treat a successful tool response as an independent security audit.
