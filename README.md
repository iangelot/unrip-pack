# Unrip Pack — Collector Crypt & Solana MCP

This Model Context Protocol (MCP) server connects compatible AI clients to Collector Crypt pack data, Solana wallet information, and supported transaction-preparation flows.

> **Security notice:** This software can prepare blockchain transactions. Review every transaction in your wallet before signing. Do not use a wallet holding significant funds until you have independently reviewed and tested the code.

## Capabilities

| Feature | Description |
|---|---|
| Gacha data | Reads machine, pack, price, stock, and odds information from Collector Crypt. |
| Pack operations | Prepares supported purchase, opening, and buyback flows. |
| Solana portfolio | Reads supported token balances and NFT metadata. |
| Jupiter swaps | Retrieves swap quotes and prepares supported swap transactions. |
| Wallet authorization | Supports OAuth 2.1 and Sign-In with Solana (SIWS) for compatible browser wallets. |
| Optional autonomous signing | The server contains an optional environment-configured signing path. See the security section before enabling it. |

Feature availability depends on the upstream services, deployment configuration, and wallet permissions.

## Deployment configuration

Do not publish deployment URLs, private service endpoints, or environment values unless you intentionally want them public. Configure your own deployment URL in your MCP client using the URL supplied by your hosting provider.

The source repository does not require you to publish a live deployment hostname.

## Connecting an MCP client

For a local installation, build the project and configure your MCP client to launch the generated entry point. Use the environment variables documented by the application only when you understand their security implications.

Example configuration (placeholders only):

```json
{
  "mcpServers": {
    "unrip-pack": {
      "command": "node",
      "args": ["<absolute-path-to-repo>/dist/index.js"]
    }
  }
}
```

Do not add real private keys, API tokens, passwords, or wallet seed phrases to this file if it may be shared or committed.

## Security-critical signing configuration

The application recognizes `AGENT_PRIVATE_KEY` and `SOLANA_PRIVATE_KEY` as optional environment variables. If a valid key is supplied to the running server, the application can sign transactions using that wallet.

- Never put either variable's **value** in source code, a committed `.env` file, a public issue, or an AI prompt.
- Store secrets only in a trusted deployment secret manager or a local untracked environment file.
- Autonomous signing is high risk: anyone who compromises the running process or its secret store may be able to use that wallet.
- Prefer a dedicated, low-balance wallet with narrowly limited funds.
- If you do not explicitly need autonomous signing, do not configure either variable.
- Review transaction contents and destinations before approving wallet signatures.

## Development and testing

```bash
npm install
npm run build
npm run test:collector-api
npm run test:client
```

Run tests in a safe development environment and verify the results against the exact commit you intend to deploy. A successful build is not a security audit.

## Security reporting

Please do not publish secrets in GitHub issues. If you discover a vulnerability, report it privately to the repository maintainer.

The `auditor/` page is informational documentation only; it does not run a live audit or certify the security of this project.
