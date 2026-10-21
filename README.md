# Collector Crypt for PayBox (MCP)

This MCP exposes live Collector Crypt Gacha reads and user-authorized mainnet pack, gift, open, and buyback flows. It uses Collector Crypt's official Gacha API and Solana transactions. The partner API key is optional for standard play endpoints; without it, new memos use the public `cc-` prefix and are not attributed to a partner key.

## Current status

| Capability | Current behavior |
| --- | --- |
| Phantom wallet identity link | Signs a one-time off-chain challenge for login; it does not approve or sign Solana transactions. A separate PayBox transaction signer is required for spending flows. |
| SOL / SPL balances | Read from Solana RPC for the selected public address. |
| Standard NFT inventory | Lists Token and Token-2022 mints with wallet balance 1, mint supply 1, zero decimals, and revoked mint authority, verified from Solana RPC. Includes on-chain Metaplex name/symbol/URI when present. Compressed NFTs are not included; collectible value is not inferred. |
| Portfolio summary | Shows RPC token balances and standard NFT mints. It does not add sandbox cards, guessed prices, or simulated pack PnL to net worth. |
| Transaction status | Looks up a full base58 signature on the configured Solana RPC; local records are clearly separate and cannot prove settlement. |
| Gacha machines and recent winners | Read from Collector Crypt's public Gacha API. These are platform API records, not independently verified by this server. |
| Pack counts and memo status | Read from Collector Crypt's public Gacha API for a wallet or memo. This does not enumerate all NFTs in a wallet. |
| Local seeded card examples and local history | Sandbox examples only; they are not verified Collector Crypt records or wallet holdings. |
| Pack purchase, gift, and buyback preparation/submission | Uses the official live Gacha API, exact returned transaction bytes, a verified wallet signature, and on-chain signature status. |
| Pack opening and gift claims | Uses Collector Crypt's official memo/challenge APIs; the recipient signs a one-time off-chain claim message. |
| Marketplace, swaps, loans, card transfers, and physical redemption | Not implemented as live flows in this MCP. |

`get_wallet_nft_inventory` and `get_portfolio_summary` include standard on-chain NFT mints whose wallet balance and mint supply are both one, decimals are zero, and mint authority is revoked. When a Metaplex metadata account exists, its on-chain name, symbol, and URI are included; the server does not fetch the URI. This is not a Collector Crypt card catalog: compressed NFTs are not included, and no card valuation is inferred. `get_user_collection` continues to report Collector Crypt collection details as unavailable and suppresses local sandbox cards until card identity, custody, and valuation can be verified.

The sandbox response fields and tool descriptions are intentional. Never treat sandbox values, estimated card prices, or locally recorded activity as assets, payouts, or transaction receipts.

## Run locally

```bash
npm install
npm run build
npm run start:http
```

Copy `.env.example` to `.env` if you want to select a Collector Crypt API environment or provide an RPC endpoint. The default Collector Crypt read API is production; use `https://dev-gacha.collectorcrypt.com` for development data. The standard on-chain Gacha play endpoints work without a partner API key. Leave `COLLECTOR_CRYPT_GACHA_API_KEY` empty unless you later need partner attribution or a partner-only endpoint. Pack prices and Solana transaction fees are separate from API access.

## Live read tools

- `get_pack_drops` reads current machine configuration, prices, odds, and stock from `GET /api/machines`.
- `get_trending_packs` reads recent winners. Collector Crypt's public endpoint does not provide a verified trending ranking, so the tool does not invent one.
- `get_pack_wallet_activity` reads purchased and gifted pack counts for an address.
- `get_wallet_nft_inventory` lists standard Token and Token-2022 NFTs held by an address from Solana RPC.
- `get_collector_crypt_pack_status` reads a pack's payment, award, and buyback records by memo.

These tools use Collector Crypt's documented public API. Pack history is not the same as wallet NFT ownership; verify NFT holdings against Solana data separately.

## Signing and safety

Money-moving tools require a cryptographically verified wallet session and explicit user confirmation of the live price or payout. The server prepares the official transaction; the wallet/PayBox signer must present that exact transaction for review and signing. The server verifies the transaction message and wallet signature before calling Collector Crypt's submit endpoint. Private keys are never handled or stored by this server.

The repository does not contain a PayBox transaction-signer connector implementation. Wallet authorization here proves control of an address with an off-chain message only; it does not provide a transaction signer. The purchase and buyback code can prepare transactions, but a live flow cannot complete unless your PayBox host can sign Solana transactions and pass the complete signed result back to the matching submit tool. Never call the legacy `*_sandbox` tools with a real wallet. The former “instant agent wallet” option has been removed; this MCP does not create, fund, or custody wallets.

Prepared transaction state is short-lived and kept in memory for the active MCP server session. Reconnects or process restarts require preparing a fresh transaction. Do not prepare and sign transactions in one session then submit them through another.

The `COLLECTOR_CRYPT_GACHA_API_KEY` remains optional. Leave it empty for the current standard Gacha flow; no monthly API subscription is needed for that flow. If a key is ever issued for partner attribution or restricted endpoints, it is sent only as `x-api-key` from the server and never returned by an MCP tool.

## Tests

```bash
npm run test:collector-api
npm run test:wallet-auth
npm run test:wallet-portfolio
```

The Collector Crypt API integration test uses a mocked HTTP client. It verifies request methods, paths, query encoding, headers, request bodies, response validation, and error handling without making purchases or touching a wallet. Other integration checks use local fixtures; they do not submit live transactions.

