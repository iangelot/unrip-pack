# Collector Crypt MCP integration

This repository is an MCP server that is intended to let an AI assistant read Collector Crypt data and, once completed, prepare user-approved actions through PayBox. It is **not yet a complete PayBox marketplace plugin** and must not be treated as a production trading or settlement app.

## Current status

| Capability | Current behavior |
| --- | --- |
| Phantom wallet identity link | Signs a one-time off-chain challenge; it does not send a Solana transaction. This is a direct browser-wallet flow, not PayBox wallet authorization. |
| SOL / SPL balances | Read from Solana RPC for the selected public address. |
| Portfolio summary | Shows RPC token balances only. It does not add sandbox cards, guessed prices, or simulated pack PnL to net worth. |
| Transaction status | Looks up a full base58 signature on the configured Solana RPC; local records are clearly separate and cannot prove settlement. |
| Gacha machines and recent winners | Read from Collector Crypt's public Gacha API. These are platform API records, not independently verified by this server. |
| Pack counts and memo status | Read from Collector Crypt's public Gacha API for a wallet or memo. This does not enumerate all NFTs in a wallet. |
| Local seeded card examples and local history | Sandbox examples only; they are not verified Collector Crypt records or wallet holdings. |
| Pack purchases, openings, buybacks, swaps, loans, card transfers, and redemption | Disabled. No live settlement is implemented in this repository. |

`get_user_collection` currently reports the collection as unavailable and suppresses local sandbox cards. Live Collector Crypt card ownership, NFT metadata, and trustworthy valuations still need an indexed ownership source and a separate implementation.

The sandbox response fields and tool descriptions are intentional. Never treat sandbox values, estimated card prices, or locally recorded activity as assets, payouts, or transaction receipts.

## Run locally

```bash
npm install
npm run build
npm run start:http
```

Copy `.env.example` to `.env` if you want to select a Collector Crypt API environment or provide an RPC endpoint. The default Collector Crypt read API is production; use `https://dev-gacha.collectorcrypt.com` for development data.

## Live read tools

- `get_pack_drops` reads current machine configuration, prices, odds, and stock from `GET /api/machines`.
- `get_trending_packs` reads recent winners. Collector Crypt's public endpoint does not provide a verified trending ranking, so the tool does not invent one.
- `get_pack_wallet_activity` reads purchased and gifted pack counts for an address.
- `get_collector_crypt_pack_status` reads a pack's payment, award, and buyback records by memo.

These tools use Collector Crypt's documented public API. Pack history is not the same as wallet NFT ownership; verify NFT holdings against Solana data separately.

## Required work before live purchases

The live Gacha purchase flow creates a Collector Crypt transaction, requires the wallet owner to review and sign it, submits it, then opens the pack and checks the returned memo/status. Buyback likewise requires a fresh eligibility check, a correctly built signed transaction, and confirmed settlement. Implement and verify those steps against Collector Crypt's development environment before enabling any money-moving tool.

PayBox must be used as the signer/payment authority for the intended PayBox integration. The current Phantom OAuth screen only proves control of a browser wallet and must not be represented as a PayBox connection. PayBox access and its approval rules are configured by the user in PayBox; this server does not receive private keys.

## Tests

```bash
npm run test:collector-api
npm run test:wallet-auth
npm run test:wallet-portfolio
```

The Collector Crypt API integration test uses a mocked HTTP client. It verifies request paths, query encoding, and error handling without making purchases or touching a wallet.
