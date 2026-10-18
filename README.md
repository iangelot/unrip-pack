# Collector Crypt Plugin for PayBox

An AI Agent Model Context Protocol (MCP) plugin that connects **MoonPay's PayBox** non-custodial wallet with **Collector Crypt**, the Solana-based Real-World Asset (RWA) platform for vaulted, authenticated physical collectibles (graded Pokémon cards, sports slabs, One Piece, and MTG).

---

## 💰 Cost Breakdown: What Will This Cost You?

| Item | Cost | Details |
| :--- | :--- | :--- |
| **Development & Code** | **$0.00** | The plugin is built completely and runs on your machine. |
| **Solana RPC Provider** | **$0.00** (Free tier) | Defaults to Solana's public RPC (`api.mainnet-beta.solana.com`). Free tiers on Helius, QuickNode, or Alchemy provide generous monthly allowances if needed. |
| **PayBox MCP Connection** | **$0.00** | Connecting your AI assistant to PayBox (`api.paybox.sh/mcp`) is free. |
| **Network Gas Fees (On-Chain)** | **~$0.0005 - $0.001** / tx | Solana gas fees are fractions of a cent per transaction. |
| **Purchasing Packs / Swapping** | **Variable (Pay As You Go)** | Only if you actually choose to execute purchases (e.g., buying a $35 Gacha pack or swapping $10 USDC into $CARDS). |
| **Hosting (Optional)** | **$0.00** | Runs locally over stdio. If deployed remotely, free tiers on Render, Railway, or Fly.io are sufficient. |

---

## 🚀 Key Features

* **Vault Inventory Search**: Query vaulted physical cards across PSA, BGS, and CGC with filters for grade (PSA 10, Gem Mint), franchise, and price range.
* **Gacha Mystery Packs**: Browse active pack drops, view odds for vintage grails, and prepare purchase payloads.
* **RWA Collateralized Lending**: Calculate 55% LTV borrow terms and lock card NFTs in escrow to borrow USDC into PayBox without selling the physical card.
* **Statistical Pack EV & Analytics**: Mathematical expected value (EV) calculations for mystery packs against market floors.
* **Historical Auction Comps**: Real-world auction comps (Heritage, PWCC, Goldin, eBay) and PSA population scarcity reports.
* **Physical-to-Web3 Ingestion**: Generate intake shipping manifests to send raw or graded cards from home to PSA Delaware or PWCC Oregon for vault tokenization.
* **$CARDS Token Integration**: Check live token price, market stats, community buyback reserves, and prepare token swaps via Jupiter on Solana.
* **Instant Liquidity Buybacks**: Quote instant payouts for tokenized cards in USDC or $CARDS.
* **Physical Vault Redemption**: Calculate courier delivery and vault release fees to burn the NFT digital twin and ship the physical card slab to your door.
* **Security & Gap Auditor Web Tool**: Built-in interactive dashboard to simulate attack vectors, test guardrails, and audit MCP security.

---

## 🛡️ Launch the Interactive Security & Gap Auditor UI

To open the visual security inspection and penetration testing dashboard in your browser:

```bash
npm run audit:ui
```
Or open [`auditor/index.html`](file:///C:/Users/idris/.gemini/antigravity-ide/scratch/paybox-collectorcrypt-plugin/auditor/index.html) directly in any browser.

---

## 🛠️ Installation & Setup

### 1. Build the Project
```bash
npm install
npm run build
```

### 2. Verify All 10 Feature Suites with the Test Runner
```bash
npm run test:client
```

---

## 🌐 Running in Remote Mode (HTTP / SSE) for Cloud AIs & Web Clients

This plugin supports **Dual Mode**:
1. **Local Mode (`stdio`):** Default for local Cursor, Claude Desktop, and CLI harnesses.
2. **Remote Web Mode (`HTTP / SSE`):** Runs an Express server exposing `/sse` and `/messages`, enabling web AIs (ChatGPT, Claude Web, Grok, and PayBox Cloud) to connect via HTTPS without installing any local code.

### Start the Remote Server Locally:
```bash
npm run start:http
```
* **Local Web Server:** `http://localhost:3000`
* **SSE Endpoint:** `http://localhost:3000/sse`
* **Health Check:** `http://localhost:3000/health`

---

## ☁️ 1-Click Free Cloud Deployment (Render / Railway / Fly.io)

### Deploy to Render.com (100% Free):
1. Push your repository to GitHub.
2. Go to [Render Dashboard](https://dashboard.render.com/) -> **New Blueprint**.
3. Select this repo (`render.yaml` will automatically configure the build and start commands).
4. You will get a live public HTTPS URL: `https://paybox-collectorcrypt.onrender.com/sse`.

### Deploy using Docker (Railway, Fly.io, Google Cloud Run):
```bash
docker build -t paybox-collectorcrypt-plugin .
docker run -p 3000:3000 paybox-collectorcrypt-plugin
```

---

## 🔌 Connecting Any AI to Your Server

### Option A: Using the Remote Hosted URL (ChatGPT, Web Claude, PayBox Cloud)
In your AI connector or MCP config:
```json
{
  "mcpServers": {
    "collector-crypt": {
      "url": "https://paybox-collectorcrypt.onrender.com/sse"
    }
  }
}
```

### Option B: Local CLI Execution (Cursor / Claude Desktop)
```json
{
  "mcpServers": {
    "collector-crypt": {
      "command": "node",
      "args": [
        "C:/Users/idris/.gemini/antigravity-ide/scratch/paybox-collectorcrypt-plugin/dist/index.js"
      ]
    }
  }
}
```

---

## 🚀 Publishing to Public Registries (Smithery.ai & npm)

1. **Publish to npm:**
   ```bash
   npm publish --access public
   ```
2. **List on Smithery.ai:**
   * Go to [smithery.ai](https://smithery.ai/) -> Click **Submit Server**.
   * Link your GitHub repo (`smithery.yaml` is pre-configured for automated indexing).
   * Now any user in the world can install your Collector Crypt plugin with one click!

---
```json
{
  "mcpServers": {
    "collector-crypt": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "C:/Users/idris/.gemini/antigravity-ide/scratch/paybox-collectorcrypt-plugin/src/index.ts"
      ]
    }
  }
}
```

---

## 🧰 Available MCP Tools

| Tool | Category | Description |
| :--- | :--- | :--- |
| `get_vault_inventory` | Vault | Search vaulted cards by franchise, PSA grade, and price range. |
| `get_card_details` | Vault | Get cert number, vault facility (PSA Delaware / PWCC Oregon), and 1:1 NFT mint. |
| `get_user_collection` | Portfolio | Inspect cards held in the user's Solana address or PayBox vault. |
| `get_pack_drops` | Gacha | List available mystery packs with live pricing and top prizes. |
| `prepare_buy_gacha_pack` | Action | Prepare a payment payload for PayBox's `request_payment` tool. |
| `get_cards_token_info` | Token | Live $CARDS token price, 24h change, and buyback fund balance. |
| `get_user_balances` | Wallet | Query live SOL, USDC, and $CARDS balances for an address. |
| `prepare_swap_cards` | Action | Prepare a token swap payload for PayBox's `request_swap` tool. |
| `get_buyback_quote` | Liquidity | Instant buyback quote for a card NFT in USDC and $CARDS. |
| `get_physical_redemption_quote` | Physical | Calculate vault handling and insured courier shipping fees. |
| `prepare_physical_redemption` | Action | Prepare an NFT burn instruction for PayBox's `request_wallet_sign` tool. |

---

## 🛡️ Security Architecture

The plugin implements a zero-trust model:
1. **No Private Keys Stored:** The plugin only constructs transaction instructions and metadata.
2. **PayBox Guardrails:** PayBox manages the MPC keys and prompts the user for passkey verification before signing transactions that move funds.
