# Collector Crypt for PayBox (MCP)

This MCP exposes live Collector Crypt Gacha reads and user-authorized mainnet pack, gift, open, and buyback flows. It uses Collector Crypt's official Gacha API and Solana transactions. The partner API key is optional for standard play endpoints; without it, new memos use the public `cc-` prefix and are not attributed to a partner key.

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
| Pack purchase, gift, and buyback preparation/submission | Uses the official live Gacha API, exact returned transaction bytes, a verified wallet signature, and on-chain signature status. |
| Pack opening and gift claims | Uses Collector Crypt's official memo/challenge APIs; the recipient signs a one-time off-chain claim message. |
| Marketplace, swaps, loans, card transfers, and physical redemption | Not implemented as live flows in this MCP. |

`get_user_collection` currently reports the collection as unavailable and suppresses local sandbox cards. Live Collector Crypt card ownership, NFT metadata, and trustworthy valuations still need an indexed ownership source and a separate implementation.

The sandbox response fields and tool descriptions are intentional. Never treat sandbox values, estimated card prices, or locally recorded activity as assets, payouts, or transaction receipts.

## Run locally

```bash
npm install
npm run build
npm run start:http
```

Copy `.env.example` to `.env` if you want to select a Collector Crypt API environment or provide an RPC endpoint. The default Collector Crypt read API is production; use `https://dev-gacha.collectorcrypt.com` for development data. If Collector Crypt issues a Gacha API partner key for your environment, set it as `COLLECTOR_CRYPT_GACHA_API_KEY` in the server environment (for example, Render). The server sends it as `x-api-key`; it is never returned by an MCP tool. Do not place this key in browser code or share it in chat. The docs do not publish a separate key fee, so confirm access terms with Collector Crypt; pack purchases and on-chain network fees are separate costs.

## Live read tools

- `get_pack_drops` reads current machine configuration, prices, odds, and stock from `GET /api/machines`.
- `get_trending_packs` reads recent winners. Collector Crypt's public endpoint does not provide a verified trending ranking, so the tool does not invent one.
- `get_pack_wallet_activity` reads purchased and gifted pack counts for an address.
- `get_collector_crypt_pack_status` reads a pack's payment, award, and buyback records by memo.

These tools use Collector Crypt's documented public API. Pack history is not the same as wallet NFT ownership; verify NFT holdings against Solana data separately.

## Signing and safety

Money-moving tools require a cryptographically verified wallet session and explicit user confirmation of the live price or payout. The server prepares the official transaction; the wallet/PayBox signer must present that exact transaction for review and signing. The server verifies the transaction message and wallet signature before calling Collector Crypt's submit endpoint. Private keys are never handled or stored by this server.

The repository does not contain a PayBox signer connector implementation: the MCP returns the transaction or message to the host for its connected wallet-signing capability. Confirm that your PayBox host can sign Solana transactions/messages and pass the complete signed result back to the matching submit/claim tool before attempting a live purchase. Never call the legacy `*_sandbox` tools with a real wallet.

Prepared transaction state is short-lived and kept in memory for the active MCP server session. Reconnects or process restarts require preparing a fresh transaction. Do not prepare and sign transactions in one session then submit them through another.

The `COLLECTOR_CRYPT_GACHA_API_KEY` remains an optional server-side setting for future attribution/partner endpoints. Leave it empty for now; if provided later, it is sent only as `x-api-key` from the server and never returned by an MCP tool. Confirm access terms with Collector Crypt; pack prices and Solana transaction fees are separate costs.

## Tests

```bash
npm run test:collector-api
npm run test:wallet-auth
npm run test:wallet-portfolio
```

The Collector Crypt API integration test uses a mocked HTTP client. It verifies request methods, paths, query encoding, headers, request bodies, response validation, and error handling without making purchases or touching a wallet. Other integration checks use local fixtures; they do not submit live transactions.
