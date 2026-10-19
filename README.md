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

## 🌐 Claude Custom Connector & Remote Web Mode (Streamable HTTP)

This plugin runs as an **Agent Wallet** for Claude Custom Connectors, ChatGPT, and PayBox, implementing the modern Anthropic **Streamable HTTP** specification (the same standard used by official connectors like VidIQ and Figma).

### Live Render URL:
```
https://paybox-collectorcrypt-mcp.onrender.com/mcp
```

### Adding to Claude (Web & Desktop):
1. In Claude, go to **Customize** &rarr; **Connectors** &rarr; Click **Add custom connector**.
2. Set **Name:** `Collector Crypt`
3. Set **MCP Server URL:** `https://paybox-collectorcrypt-mcp.onrender.com/mcp`
4. Click **Connect**. That's it!

### 🔑 Wallet Linking & Identity:
* **Zero Address Hassle:** You never have to manually input your 44-character Solana address in chat.
* **Auto-Resolution:** Asking *"What cards do I have?"* or *"What is my balance?"* automatically resolves your active connected wallet.
* **Instant Wallet Generation:** Ask Claude *"Create a new PayBox wallet for me"* to provision a fresh non-custodial Solana keypair with testnet sandbox balances.
* **Link Existing Solana Wallet:** Say *"Link my wallet <solana_address>"* in chat or visit the interactive Web3 portal at `https://paybox-collectorcrypt-mcp.onrender.com/oauth/authorize`.

---

## 🧰 Complete MCP Tool Matrix (23 Tools)

| Tool | Category | Execution Type | Description |
| :--- | :--- | :--- | :--- |
| `get_account` | Account | Auto-Resolve | Connected address, live balances (SOL/USDC/CARDS), spend safety limits. |
| `create_agent_wallet` | Account | Direct | Provision fresh non-custodial Solana keypair with starting sandbox balances. |
| `connect_wallet` | Account | Direct | Link an existing Solana wallet address to your session with Base58 validation. |
| `get_portfolio_summary` | Account | Auto-Resolve | Consolidated single-call card count, estimated collection value, balances, and net worth. |
| `set_spend_limits` | Security | Direct | Configure per-tx spend cap, daily spend limit, and passkey prompt threshold. |
| `get_transactions` | History | Paginated | List recent transaction records, block explorer links, and status. |
| `get_transaction_status` | History | Lookup | Check on-chain confirmation status for any transaction signature. |
| `open_gacha_pack` | Gacha | Direct | Direct pack opening: rolls randomized pull, reveals card + PSA grade + market value, and adds card to your vault. |
| `get_pack_drops` | Gacha | Query | Browse active mystery packs, pricing, remaining supply, and grail odds. |
| `get_pack_history` | Gacha | Paginated | All-time opened packs, pulled cards, and net PnL / ROI tracking. |
| `prepare_buy_gacha_pack` | Gacha | Prepare | Construct transaction payload for external PayBox `request_payment`. |
| `get_vault_inventory` | Vault | Search | Filter vaulted physical cards by franchise (Pokemon/Sports/OP/MTG), PSA grade, and price. |
| `get_card_details` | Vault | Query | In-depth metadata, cert number, digital twin NFT mint, and vault facility. |
| `get_user_collection` | Vault | Paginated | List tokenized card NFTs in your vault with pagination (`limit`, `offset`). |
| `get_buyback_quote` | Liquidity | Query | Instant guaranteed buyback quote in USDC and $CARDS. |
| `execute_card_buyback` | Liquidity | Direct | Sell card back to Collector Crypt, burn NFT, and credit USDC to your account. |
| `get_physical_redemption_quote` | Physical | Query | Calculate courier delivery, vault handling, and insurance fees. |
| `prepare_physical_redemption` | Physical | Prepare | Prepare NFT burn payload for PayBox `request_wallet_sign`. |
| `execute_physical_redemption` | Physical | Direct | Burn NFT and schedule armored FedEx courier delivery of the physical graded slab. |
| `get_lending_terms` | DeFi | Query | Calculate 55% LTV collateralized loan terms, APR, and liquidation threshold. |
| `execute_card_loan` | DeFi | Direct | Lock card NFT in lending escrow and borrow USDC directly into your balance. |
| `execute_token_swap` | Token | Direct | Swap USDC and $CARDS with slippage guardrails and immediate balance updates. |
| `get_cards_token_info` | Token | Query | Live $CARDS token price, 24h change, market cap, and buyback fund. |

---

## 🛡️ Security Architecture & Guardrails

1. **Non-Custodial Architecture:** Keys are never stored in plaintext on disk; operations run under non-custodial MPC protocols.
2. **Deterministic Spend Limits:** The AI agent cannot spend beyond user-configured per-transaction and 24h daily caps.
3. **Passkey Escalation:** High-value actions trigger WebAuthn passkey confirmation before settlement.

