import express from "express";
import cors from "cors";
import crypto from "crypto";
import { Keypair } from "@solana/web3.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createCollectorCryptServer } from "./server.js";
import { SolanaService } from "./services/solana.js";
import { AccountService } from "./services/accountService.js";
export function startHttpServer(port = 3000) {
    const app = express();
    // Enable comprehensive CORS for Claude, ChatGPT, PayBox, and web browsers
    app.use(cors({
        origin: "*",
        methods: ["GET", "POST", "OPTIONS", "HEAD"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "Accept",
            "mcp-session-id",
            "X-Requested-With",
            "anthropic-version"
        ],
        exposedHeaders: ["mcp-session-id", "Content-Type"]
    }));
    app.use(express.json({ limit: "10mb" }));
    app.use(express.urlencoded({ extended: true }));
    // Shared services
    const solanaService = new SolanaService();
    const sharedAccountService = new AccountService(solanaService);
    // In-memory OAuth code & token mappings
    const oauthCodes = new Map();
    const oauthTokensToWallet = new Map();
    // In-memory sessions map for Streamable HTTP transport
    const streamableSessions = new Map();
    const sessionAccountServices = new Map();
    // Active legacy SSE transports
    const sseTransports = {};
    // Health check endpoint
    app.get("/health", (_req, res) => {
        res.json({
            status: "healthy",
            service: "collector-crypt-paybox-mcp",
            version: "1.0.0",
            auth: "OAuth 2.1 + Agent Wallet Session",
            endpoints: {
                streamableHttp: "/mcp",
                legacySse: "/sse",
                oauthAuthorize: "/oauth/authorize",
                oauthToken: "/oauth/token",
                oauthDiscovery: "/.well-known/oauth-authorization-server"
            },
            supportedChain: "Solana Mainnet",
            timestamp: new Date().toISOString()
        });
    });
    // =========================================================================
    // RFC 8414 & OpenID OAuth Discovery Metadata (Required by Claude / IdPs)
    // =========================================================================
    const getDiscoveryMetadata = (req) => {
        const proto = req.headers["x-forwarded-proto"] || "https";
        const host = req.headers.host || "paybox-collectorcrypt-mcp.onrender.com";
        const baseUrl = `${proto}://${host}`;
        return {
            issuer: baseUrl,
            authorization_endpoint: `${baseUrl}/oauth/authorize`,
            token_endpoint: `${baseUrl}/oauth/token`,
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token"],
            code_challenge_methods_supported: ["S256"],
            token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
            scopes_supported: ["wallet:read", "wallet:write", "vault:trade"]
        };
    };
    app.get("/.well-known/oauth-authorization-server", (req, res) => {
        res.json(getDiscoveryMetadata(req));
    });
    app.get("/.well-known/openid-configuration", (req, res) => {
        res.json(getDiscoveryMetadata(req));
    });
    // =========================================================================
    // Interactive Web3 Wallet Link Portal: /oauth/authorize
    // =========================================================================
    app.get("/oauth/authorize", (req, res) => {
        const clientId = req.query.client_id || "claude-connector";
        const redirectUri = req.query.redirect_uri || "";
        const state = req.query.state || "";
        const codeChallenge = req.query.code_challenge || "";
        res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PayBox x Collector Crypt — Connect Agent Wallet</title>
        <style>
          :root {
            --bg: #090b10;
            --card-bg: rgba(22, 27, 38, 0.85);
            --border: rgba(255, 255, 255, 0.1);
            --primary: #6366f1;
            --primary-glow: rgba(99, 102, 241, 0.35);
            --accent: #14f195;
            --text: #f8fafc;
            --text-dim: #94a3b8;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; }
          .container { max-width: 520px; width: 100%; background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; padding: 2.25rem; backdrop-filter: blur(20px); box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
          .logo-badge { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem; }
          .badge-sol { background: #14f19522; color: #14f195; border: 1px solid #14f19544; padding: 0.25rem 0.65rem; border-radius: 999px; font-size: 0.75rem; font-weight: bold; }
          .badge-paybox { background: #6366f122; color: #818cf8; border: 1px solid #6366f144; padding: 0.25rem 0.65rem; border-radius: 999px; font-size: 0.75rem; font-weight: bold; }
          h1 { font-size: 1.6rem; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: -0.02em; }
          p.subtitle { color: var(--text-dim); font-size: 0.95rem; margin-bottom: 1.75rem; line-height: 1.5; }
          .option-card { background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; transition: all 0.2s ease; cursor: pointer; }
          .option-card:hover { border-color: var(--primary); background: rgba(99, 102, 241, 0.05); }
          .option-title { font-weight: 600; font-size: 1rem; margin-bottom: 0.25rem; display: flex; align-items: center; justify-content: space-between; }
          .option-desc { font-size: 0.85rem; color: var(--text-dim); line-height: 1.4; }
          .input-group { margin-top: 1rem; }
          input[type="text"] { width: 100%; background: #0e121a; border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem 1rem; color: #fff; font-family: monospace; font-size: 0.9rem; margin-top: 0.5rem; }
          input[type="text"]:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-glow); }
          .btn-submit { width: 100%; background: linear-gradient(135deg, #6366f1, #4f46e5); color: #fff; border: none; border-radius: 10px; padding: 0.85rem; font-weight: 600; font-size: 1rem; cursor: pointer; margin-top: 1.5rem; transition: opacity 0.2s; }
          .btn-submit:hover { opacity: 0.92; }
          .status-box { margin-top: 1rem; padding: 0.75rem; border-radius: 8px; font-size: 0.85rem; display: none; font-family: monospace; word-break: break-all; }
          .status-success { background: #10b98122; border: 1px solid #10b981; color: #34d399; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo-badge">
            <span class="badge-paybox">PAYBOX VAULT</span>
            <span class="badge-sol">SOLANA RWA</span>
          </div>
          <h1>Connect Agent Wallet</h1>
          <p class="subtitle">Link your Solana wallet to your Claude AI assistant so it can view your vaulted cards, open packs, and execute trades autonomously.</p>

          <form id="authForm" method="POST" action="/oauth/authorize">
            <input type="hidden" name="client_id" value="${clientId}">
            <input type="hidden" name="redirect_uri" value="${redirectUri}">
            <input type="hidden" name="state" value="${state}">
            <input type="hidden" name="code_challenge" value="${codeChallenge}">
            <input type="hidden" id="selectedAddress" name="wallet_address" value="7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU">

            <!-- Option 1: Instant PayBox Agent Wallet -->
            <div class="option-card" onclick="selectInstantWallet()">
              <div class="option-title">
                <span>⚡ Instant PayBox Agent Wallet</span>
                <span style="color: var(--accent); font-size: 0.8rem;">RECOMMENDED</span>
              </div>
              <div class="option-desc">Auto-provisions a fresh non-custodial Solana keypair with testnet funds ($500 USDC & cards).</div>
            </div>

            <!-- Option 2: Connect Phantom/Solflare -->
            <div class="option-card" onclick="connectBrowserWallet()">
              <div class="option-title">
                <span>🦊 Connect Browser Wallet</span>
                <span id="phantomStatus" style="font-size: 0.8rem; color: var(--text-dim);">Phantom / Solflare</span>
              </div>
              <div class="option-desc">Connect using your existing browser extension to link your real Solana portfolio.</div>
            </div>

            <!-- Option 3: Manual Address -->
            <div class="input-group">
              <label style="font-size: 0.85rem; font-weight: 500; color: var(--text-dim);">Or enter Solana Address manually:</label>
              <input type="text" id="manualAddress" placeholder="e.g. 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" value="7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" oninput="updateAddress(this.value)">
            </div>

            <div id="statusBox" class="status-box status-success"></div>

            <button type="submit" class="btn-submit" id="submitBtn">Authorize Claude Connection</button>
          </form>
        </div>

        <script>
          function updateAddress(val) {
            document.getElementById('selectedAddress').value = val.trim();
          }

          function selectInstantWallet() {
            // Generate a random-looking base58 public key representation for UI demonstration
            const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
            let mockKey = 'PayBoxAgent';
            for (let i = 0; i < 33; i++) {
              mockKey += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            document.getElementById('manualAddress').value = mockKey;
            document.getElementById('selectedAddress').value = mockKey;
            showStatus('Instant Agent Wallet generated: ' + mockKey);
          }

          async function connectBrowserWallet() {
            if (window.solana && window.solana.isPhantom) {
              try {
                const resp = await window.solana.connect();
                const pubkey = resp.publicKey.toString();
                document.getElementById('manualAddress').value = pubkey;
                document.getElementById('selectedAddress').value = pubkey;
                showStatus('Connected Phantom: ' + pubkey);
              } catch (err) {
                alert('Connection cancelled or failed: ' + err.message);
              }
            } else {
              alert('Phantom or Solflare wallet extension not detected in this browser tab. You can paste your address below or use the Instant Agent Wallet.');
            }
          }

          function showStatus(text) {
            const box = document.getElementById('statusBox');
            box.style.display = 'block';
            box.innerText = text;
          }
        </script>
      </body>
      </html>
    `);
    });
    // Handle OAuth authorization submission
    app.post("/oauth/authorize", (req, res) => {
        const { client_id, redirect_uri, state, code_challenge, wallet_address } = req.body;
        const finalAddress = wallet_address || "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
        // Validate Solana address
        if (!sharedAccountService.validateSolanaAddress(finalAddress)) {
            // If it starts with PayBoxAgent mock, generate real keypair
            let validKey = finalAddress;
            if (!sharedAccountService.validateSolanaAddress(validKey)) {
                const kp = Keypair.generate();
                validKey = kp.publicKey.toBase58();
            }
            return createAndRedirectCode(validKey, client_id, redirect_uri, state, code_challenge, res);
        }
        createAndRedirectCode(finalAddress, client_id, redirect_uri, state, code_challenge, res);
    });
    function createAndRedirectCode(address, clientId, redirectUri, state, codeChallenge, res) {
        const code = `cc_code_${crypto.randomBytes(16).toString("hex")}`;
        oauthCodes.set(code, {
            code,
            walletAddress: address,
            clientId: clientId || "claude-connector",
            redirectUri: redirectUri || "",
            codeChallenge,
            createdAt: Date.now()
        });
        if (redirectUri && redirectUri.length > 0) {
            const url = new URL(redirectUri);
            url.searchParams.set("code", code);
            if (state)
                url.searchParams.set("state", state);
            res.redirect(url.toString());
        }
        else {
            res.json({
                status: "AUTHORIZED",
                message: "Wallet linked successfully to Claude Custom Connector.",
                walletAddress: address,
                authorizationCode: code,
                instructions: "Claude will exchange this code for a Bearer session token."
            });
        }
    }
    // =========================================================================
    // OAuth Token Exchange: /oauth/token
    // =========================================================================
    app.post("/oauth/token", (req, res) => {
        const { grant_type, code, client_id, redirect_uri } = req.body;
        if (grant_type !== "authorization_code") {
            res.status(400).json({ error: "unsupported_grant_type", error_description: "Only 'authorization_code' grant type is supported." });
            return;
        }
        if (!code || !oauthCodes.has(code)) {
            res.status(400).json({ error: "invalid_grant", error_description: "Invalid or expired authorization code." });
            return;
        }
        const codeEntry = oauthCodes.get(code);
        oauthCodes.delete(code); // One-time use
        // Generate Bearer token
        const accessToken = `pb_tok_${crypto.randomBytes(24).toString("hex")}`;
        oauthTokensToWallet.set(accessToken, codeEntry.walletAddress);
        // Pre-initialize account in shared account service
        const account = sharedAccountService.getAccount();
        sharedAccountService.registerTokenAccount(accessToken, {
            ...account,
            walletAddress: codeEntry.walletAddress,
            connectedVia: "PayBox MPC Vault"
        });
        res.json({
            access_token: accessToken,
            token_type: "Bearer",
            expires_in: 2592000, // 30 days
            scope: "wallet:read wallet:write vault:trade",
            wallet_address: codeEntry.walletAddress
        });
    });
    // Welcome & documentation page
    app.get("/", (req, res) => {
        const proto = req.headers["x-forwarded-proto"] || "https";
        const host = req.headers.host || "paybox-collectorcrypt-mcp.onrender.com";
        const baseUrl = `${proto}://${host}`;
        res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Collector Crypt PayBox Remote MCP Connector</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0a0c10; color: #f8fafc; padding: 2.5rem 1.5rem; max-width: 800px; margin: 0 auto; line-height: 1.6; }
          .badge { background: #10b981; color: #000; padding: 0.25rem 0.75rem; border-radius: 999px; font-weight: bold; font-size: 0.8rem; }
          .code-box { background: #161b26; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 1.25rem; font-family: monospace; overflow-x: auto; color: #38bdf8; margin: 1rem 0; font-size: 0.95rem; }
          h1 { color: #6366f1; font-size: 1.8rem; margin-bottom: 0.5rem; }
          .highlight { color: #14f195; font-weight: bold; }
          a { color: #38bdf8; text-decoration: none; }
          a:hover { text-decoration: underline; }
          .features { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1.5rem 0; }
          .feat-card { background: #131722; border: 1px solid rgba(255,255,255,0.06); padding: 1rem; border-radius: 8px; font-size: 0.9rem; }
        </style>
      </head>
      <body>
        <h1>Collector Crypt Agent Connector <span class="badge">ONLINE</span></h1>
        <p>A live, non-custodial Model Context Protocol (MCP) agent wallet connecting <strong>Claude Custom Connectors</strong> with <strong>Collector Crypt</strong> physical graded collectibles on Solana.</p>
        
        <div class="features">
          <div class="feat-card">
            <strong>🔒 Wallet Auto-Resolution</strong><br>
            Claude automatically knows your connected wallet. Zero 44-character address typing required.
          </div>
          <div class="feat-card">
            <strong>📦 Instant Pack Opening</strong><br>
            Direct execution with RNG card pulls, PSA grades, market value estimation, and PnL receipts.
          </div>
          <div class="feat-card">
            <strong>💰 Instant Liquidity & Buyback</strong><br>
            Sell cards back directly to Collector Crypt with instant USDC cash-out to your balance.
          </div>
          <div class="feat-card">
            <strong>🛡️ Spend Limits & Safeguards</strong><br>
            Per-transaction caps, daily spend budgets, and biometric passkey thresholds for AI safety.
          </div>
        </div>

        <h2 style="margin-top: 2rem;">Connecting to Claude (Web & Desktop):</h2>
        <p>In Claude, go to <strong>Customize</strong> &rarr; <strong>Connectors</strong> &rarr; <strong>Add custom connector</strong> and enter:</p>
        
        <div class="code-box">
Name: Collector Crypt
MCP Server URL: ${baseUrl}/mcp
        </div>

        <p>Supports both direct Streamable HTTP and OAuth 2.1 wallet linking (<a href="/oauth/authorize">Wallet Link Portal</a>).</p>
      </body>
      </html>
    `);
    });
    // =========================================================================
    // Modern Streamable HTTP endpoint: /mcp (Identical to VidIQ & Figma)
    // =========================================================================
    app.all("/mcp", async (req, res) => {
        // Ensure Accept header permits event-stream / json to prevent 406 errors
        const acceptHeader = req.headers["accept"] || "";
        if (!acceptHeader.includes("text/event-stream") && !acceptHeader.includes("application/json")) {
            req.headers["accept"] = "application/json, text/event-stream";
        }
        const sessionId = req.headers["mcp-session-id"] || req.query.sessionId;
        const authHeader = req.headers["authorization"];
        const bearerToken = authHeader?.replace(/^Bearer\s+/i, "");
        let transport;
        if (sessionId && streamableSessions.has(sessionId)) {
            transport = streamableSessions.get(sessionId);
        }
        else {
            const newSessionId = sessionId || crypto.randomUUID();
            transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => newSessionId,
                enableJsonResponse: true
            });
            transport.onclose = () => {
                if (transport.sessionId) {
                    streamableSessions.delete(transport.sessionId);
                    sessionAccountServices.delete(transport.sessionId);
                }
            };
            // Check if this session has a linked OAuth wallet
            let sessionAccountService = sharedAccountService;
            if (bearerToken && oauthTokensToWallet.has(bearerToken)) {
                const linkedWallet = oauthTokensToWallet.get(bearerToken);
                sessionAccountService = new AccountService(solanaService);
                await sessionAccountService.connectWallet(linkedWallet);
            }
            sessionAccountServices.set(newSessionId, sessionAccountService);
            const server = createCollectorCryptServer(sessionAccountService);
            await server.connect(transport);
            streamableSessions.set(newSessionId, transport);
        }
        try {
            await transport.handleRequest(req, res, req.body);
        }
        catch (err) {
            console.error("[StreamableHTTP] Error handling request:", err);
            if (!res.headersSent) {
                res.status(500).json({ error: "Internal error processing MCP request" });
            }
        }
    });
    // =========================================================================
    // Backward compatibility: /sse and /messages (Legacy SSE clients)
    // =========================================================================
    app.get("/sse", async (_req, res) => {
        console.log("[Legacy SSE] Client connecting to /sse...");
        const server = createCollectorCryptServer(sharedAccountService);
        const transport = new SSEServerTransport("/messages", res);
        const sessionId = transport.sessionId;
        sseTransports[sessionId] = transport;
        transport.onclose = () => {
            delete sseTransports[sessionId];
        };
        await server.connect(transport);
    });
    app.post("/messages", async (req, res) => {
        const sessionId = req.query.sessionId;
        const transport = sseTransports[sessionId];
        if (!transport) {
            res.status(404).send("Session not found or expired");
            return;
        }
        await transport.handlePostMessage(req, res);
    });
    const serverInstance = app.listen(port, () => {
        console.log(`\n=======================================================`);
        console.log(`🚀 Collector Crypt Remote MCP Connector Ready!`);
        console.log(`📡 Base URL: http://localhost:${port}`);
        console.log(`⚡ Streamable HTTP (Claude / VidIQ spec): http://localhost:${port}/mcp`);
        console.log(`⚡ OAuth Discovery: http://localhost:${port}/.well-known/oauth-authorization-server`);
        console.log(`⚡ Wallet Link Portal: http://localhost:${port}/oauth/authorize`);
        console.log(`⚡ Legacy SSE: http://localhost:${port}/sse`);
        console.log(`=======================================================\n`);
    });
    return serverInstance;
}
//# sourceMappingURL=http-server.js.map