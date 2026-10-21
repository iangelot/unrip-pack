import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import crypto from "crypto";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createCollectorCryptServer } from "./server.js";
import { SolanaService } from "./services/solana.js";
import { AccountService } from "./services/accountService.js";

interface AuthChallengeEntry {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  createdAt: number;
}

interface OAuthCodeEntry {
  code: string;
  walletAddress: string;
  clientId: string;
  redirectUri: string;
  codeChallenge?: string;
  createdAt: number;
  isVerifiedOwner: boolean;
}

export function startHttpServer(port: number = 3000) {
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
  interface OAuthTokenData {
    walletAddress: string;
    isVerifiedOwner: boolean;
    expiresAt: number;
  }
  const authChallenges = new Map<string, AuthChallengeEntry>();
  const oauthCodes = new Map<string, OAuthCodeEntry>();
  const oauthTokensToWallet = new Map<string, OAuthTokenData>();

  // In-memory sessions map for Streamable HTTP transport
  const streamableSessions = new Map<string, StreamableHTTPServerTransport>();
  const sessionAccountServices = new Map<string, AccountService>();
  // Active legacy SSE transports
  const sseTransports: Record<string, SSEServerTransport> = {};
  const sseTokenBySession: Record<string, string> = {};

  // Registered OAuth clients (pre-configured static client + dynamic clients)
  interface RegisteredClient {
    clientId: string;
    clientName: string;
    redirectUris: string[];
  }
  const registeredClients = new Map<string, RegisteredClient>();
  registeredClients.set("claude-connector", {
    clientId: "claude-connector",
    clientName: "Claude AI Custom Connector",
    redirectUris: ["https://claude.ai/api/mcp/auth_callback"]
  });

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "healthy",
      service: "unrip-agent-protocol",
      version: "1.0.0",
      productName: "Unrip Protocol",
      description: "Autonomous Web3 physical graded collectibles and pack opening protocol",
      auth: "OAuth 2.1 (RFC 7591 Dynamic Client Registration + Web3 Agent Wallet)",
      staticClientId: "claude-connector",
      endpoints: {
        streamableHttp: "/mcp",
        legacySse: "/sse",
        oauthAuthorize: "/oauth/authorize",
        oauthToken: "/oauth/token",
        oauthRegister: "/oauth/register",
        oauthDiscovery: "/.well-known/oauth-authorization-server"
      },
      supportedChain: "Solana Mainnet",
      timestamp: new Date().toISOString()
    });
  });

  // =========================================================================
  // RFC 8414 & OpenID OAuth Discovery Metadata (Required by Claude / IdPs)
  // =========================================================================
  const getDiscoveryMetadata = (req: Request) => {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host || "paybox-collectorcrypt-mcp.onrender.com";
    const baseUrl = `${proto}://${host}`;

    return {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["wallet:read", "wallet:write", "vault:trade"]
    };
  };

  app.use("/.well-known/oauth-authorization-server", (req: Request, res: Response) => {
    res.json(getDiscoveryMetadata(req));
  });

  app.use("/.well-known/openid-configuration", (req: Request, res: Response) => {
    res.json(getDiscoveryMetadata(req));
  });

  app.use("/.well-known/oauth-protected-resource", (req: Request, res: Response) => {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host || "paybox-collectorcrypt-mcp.onrender.com";
    const baseUrl = `${proto}://${host}`;
    res.json({
      resource: `${baseUrl}/mcp`,
      authorization_servers: [baseUrl],
      scopes_supported: ["wallet:read", "wallet:write", "vault:trade"]
    });
  });

  // =========================================================================
  // RFC 7591 Dynamic Client Registration (DCR) endpoint
  // =========================================================================
  app.post(["/oauth/register", "/register"], (req: Request, res: Response) => {
    const { redirect_uris, client_name } = req.body || {};
    const clientId = `claude_${crypto.randomBytes(12).toString("hex")}`;
    const validRedirects = Array.isArray(redirect_uris) && redirect_uris.length > 0
      ? redirect_uris
      : ["https://claude.ai/api/mcp/auth_callback"];

    registeredClients.set(clientId, {
      clientId,
      clientName: client_name || "Claude Custom Connector",
      redirectUris: validRedirects
    });

    console.log(`[OAuth DCR] Registered dynamic client: ${clientId}`);

    res.status(201).json({
      client_id: clientId,
      client_name: client_name || "Claude Custom Connector",
      redirect_uris: validRedirects,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none"
    });
  });

  // =========================================================================
  // Interactive Web3 Wallet Link Portal: /oauth/authorize
  // =========================================================================
  // =========================================================================
  // Interactive Web3 Wallet Link Portal: /oauth/authorize (Sign-In with Solana)
  // =========================================================================
  app.get("/oauth/authorize", (req: Request, res: Response) => {
    const clientId = typeof req.query.client_id === "string" ? req.query.client_id : "claude-connector";
    const redirectUri = typeof req.query.redirect_uri === "string" ? req.query.redirect_uri : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const codeChallenge = typeof req.query.code_challenge === "string" ? req.query.code_challenge : "";
    const client = registeredClients.get(clientId);
    if (!client) {
      res.status(400).send("Unknown OAuth client.");
      return;
    }
    if (redirectUri && !client.redirectUris.includes(redirectUri)) {
      res.status(400).send("Redirect URI is not registered for this client.");
      return;
    }
    if (redirectUri && !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) {
      res.status(400).send("A valid S256 PKCE code challenge is required.");
      return;
    }
    if (state.length > 512) {
      res.status(400).send("OAuth state is too long.");
      return;
    }
    const nonce = crypto.randomBytes(16).toString("hex");
    const domain = req.headers.host || "paybox-collectorcrypt-mcp.onrender.com";
    const challenge = `Unrip Protocol Authentication\nDomain: ${domain}\nNonce: ${nonce}\nTimestamp: ${new Date().toISOString()}\n\nSign this one-time message to prove control of this wallet for this MCP session. This is off-chain login only; it does not approve or sign Solana transactions.`;
    // Base64 keeps the exact UTF-8 challenge bytes intact across HTML parsing and form submission.
    const challengeBase64 = Buffer.from(challenge, "utf8").toString("base64");
    const now = Date.now();
    for (const [issuedChallenge, entry] of authChallenges) {
      if (now - entry.createdAt > 10 * 60 * 1000) authChallenges.delete(issuedChallenge);
    }
    authChallenges.set(challengeBase64, { clientId, redirectUri, state, codeChallenge, createdAt: now });
    const htmlEscapes: Record<string, string> = {
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    };
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
    const safeClientId = escapeHtml(clientId);
    const safeRedirectUri = escapeHtml(redirectUri);
    const safeState = escapeHtml(state);
    const safeCodeChallenge = escapeHtml(codeChallenge);

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Unrip Protocol — Authorize Claude AI Connector</title>
        <style>
          :root {
            --bg: #090b10;
            --card-bg: rgba(22, 27, 38, 0.9);
            --border: rgba(255, 255, 255, 0.1);
            --border-hover: rgba(99, 102, 241, 0.5);
            --primary: #6366f1;
            --primary-glow: rgba(99, 102, 241, 0.35);
            --accent: #14f195;
            --warning: #f59e0b;
            --text: #f8fafc;
            --text-dim: #94a3b8;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; }
          .container { max-width: 560px; width: 100%; background: var(--card-bg); border: 1px solid var(--border); border-radius: 20px; padding: 2.25rem; backdrop-filter: blur(24px); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6); }
          .logo-badge { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem; }
          .badge-brand { background: #6366f122; color: #a5b4fc; border: 1px solid #6366f155; padding: 0.3rem 0.75rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em; }
          .badge-sol { background: #14f19522; color: #14f195; border: 1px solid #14f19555; padding: 0.3rem 0.75rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700; }
          h1 { font-size: 1.65rem; font-weight: 800; margin-bottom: 0.5rem; letter-spacing: -0.02em; }
          p.subtitle { color: var(--text-dim); font-size: 0.92rem; margin-bottom: 1.75rem; line-height: 1.5; }
          
          .option-card { background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border); border-radius: 14px; padding: 1.25rem; margin-bottom: 1rem; transition: all 0.25s ease; cursor: pointer; position: relative; }
          .option-card:hover { border-color: var(--border-hover); background: rgba(99, 102, 241, 0.06); transform: translateY(-1px); }
          .option-card.primary-choice { border-color: rgba(99, 102, 241, 0.4); background: rgba(99, 102, 241, 0.04); }
          .option-title { font-weight: 700; font-size: 1rem; margin-bottom: 0.35rem; display: flex; align-items: center; justify-content: space-between; }
          .option-desc { font-size: 0.84rem; color: var(--text-dim); line-height: 1.45; }
          .badge-pill { font-size: 0.72rem; padding: 0.2rem 0.55rem; border-radius: 999px; font-weight: 700; }
          .badge-verified { background: #14f19522; color: #14f195; border: 1px solid #14f19544; }
          .badge-spectator { background: #f59e0b22; color: #f59e0b; border: 1px solid #f59e0b44; }

          .input-group { margin-top: 1rem; }
          input[type="text"] { width: 100%; background: #0c0f17; border: 1px solid var(--border); border-radius: 10px; padding: 0.75rem 1rem; color: #fff; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.88rem; margin-top: 0.4rem; }
          input[type="text"]:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-glow); }
          
          .btn-action { width: 100%; background: linear-gradient(135deg, #6366f1, #4f46e5); color: #fff; border: none; border-radius: 10px; padding: 0.85rem; font-weight: 700; font-size: 0.95rem; cursor: pointer; margin-top: 0.75rem; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.5rem; }
          .btn-action:hover { opacity: 0.93; transform: scale(1.005); }
          .btn-secondary { background: rgba(255, 255, 255, 0.08); color: #e2e8f0; border: 1px solid var(--border); }
          .btn-secondary:hover { background: rgba(255, 255, 255, 0.12); }
          
          .status-box { margin-top: 1rem; padding: 0.85rem; border-radius: 10px; font-size: 0.85rem; display: none; line-height: 1.4; word-break: break-all; }
          .status-success { background: #10b98118; border: 1px solid #10b98144; color: #34d399; }
          .status-error { background: #ef444418; border: 1px solid #ef444444; color: #f87171; }
          .security-footer { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.06); font-size: 0.75rem; color: var(--text-dim); text-align: center; line-height: 1.4; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo-badge">
            <span class="badge-brand">UNRIP PROTOCOL</span>
            <span class="badge-sol">SOLANA ED25519</span>
          </div>
          <h1>Connect a Solana wallet</h1>
          <p class="subtitle">Link a wallet to this MCP session. The signature below proves wallet control for login only; it does not approve or sign transactions or give this server access to your funds.</p>

          <form id="authForm" method="POST" action="/oauth/authorize">
            <input type="hidden" name="client_id" value="${safeClientId}">
            <input type="hidden" name="redirect_uri" value="${safeRedirectUri}">
            <input type="hidden" name="state" value="${safeState}">
            <input type="hidden" name="code_challenge" value="${safeCodeChallenge}">
            <input type="hidden" id="challengeText" name="challenge" value="${challengeBase64}">
            <input type="hidden" id="authMode" name="auth_mode" value="signature">
            <input type="hidden" id="signatureHex" name="signature_hex" value="">
            <input type="hidden" id="selectedAddress" name="wallet_address" value="">

            <!-- Option 1: Sign-In with Solana (Phantom / Solflare) -->
            <div class="option-card primary-choice" id="cardSIWS">
              <div class="option-title">
                <span>🦊 Sign-In with Solana Extension</span>
                <span class="badge-pill badge-verified">BROWSER EXTENSION</span>
              </div>
              <div class="option-desc">Connect Phantom, Solflare, Backpack, or another supported browser wallet. It signs a one-time off-chain login message only; no Solana transaction is approved here.</div>
              <button type="button" class="btn-action" onclick="connectAndSignBrowserWallet()">Sign with Browser Wallet</button>
            </div>

            <!-- Option 2: Read-Only Spectator Mode -->
            <div class="option-card" id="cardSpectator">
              <div class="option-title">
                <span>👁️ Read-Only Spectator Mode</span>
                <span class="badge-pill badge-spectator">INSPECTION ONLY</span>
              </div>
              <div class="option-desc">Enter a public Solana address to inspect its RPC token balances and standard NFT mints. This does not verify Collector Crypt card identity or value and cannot spend or transfer funds.</div>
              <div class="input-group">
                <input type="text" id="spectatorAddress" placeholder="Paste a Solana address">
                <button type="button" class="btn-action btn-secondary" style="margin-top: 0.5rem;" onclick="submitSpectatorMode()">Connect in Spectator Mode</button>
              </div>
            </div>

            <div id="statusBox" class="status-box"></div>
          </form>

          <div class="security-footer">
            🔒 This page only verifies wallet login; it cannot approve a Solana transaction. To sign Collector Crypt transactions, connect PayBox’s official MCP (https://api.paybox.sh/mcp) to the same AI client as this MCP and use a PayBox wallet with the same address.
          </div>
        </div>

        <script>
          function showStatus(text, isError = false) {
            const box = document.getElementById('statusBox');
            box.style.display = 'block';
            box.className = 'status-box ' + (isError ? 'status-error' : 'status-success');
            box.innerText = text;
          }

          async function getProvider() {
            let p = window.phantom?.solana || window.solflare || window.backpack || window.solana || window.coinbaseSolana || window.okxwallet?.solana;
            if (p) return p;

            // Wait up to 1.5s for extensions that inject asynchronously into the DOM
            for (let i = 0; i < 6; i++) {
              await new Promise(r => setTimeout(r, 250));
              p = window.phantom?.solana || window.solflare || window.backpack || window.solana || window.coinbaseSolana || window.okxwallet?.solana;
              if (p) return p;
            }
            return null;
          }

          async function connectAndSignBrowserWallet() {
            showStatus('Detecting wallet extension in this browser tab...');
            const provider = await getProvider();
            if (!provider) {
              showStatus('⚠️ Wallet extension not detected in this browser tab. Please ensure Phantom or Solflare is unlocked and active in this browser.', true);
              return;
            }

            try {
              showStatus('Connecting to wallet extension...');
              const resp = await provider.connect();
              const pubkey = (resp.publicKey || provider.publicKey).toString();
              
              showStatus('Please approve the signature challenge in your wallet...');
              const challengeBase64 = document.getElementById('challengeText').value;
              const encodedChallenge = Uint8Array.from(atob(challengeBase64), char => char.charCodeAt(0));

              let signed;
              if (provider.signMessage) {
                signed = await provider.signMessage(encodedChallenge, 'utf8');
              } else {
                throw new Error('Wallet does not support message signing.');
              }

              const rawSig = signed.signature || signed;
              const sigHex = Array.from(new Uint8Array(rawSig))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');

              document.getElementById('selectedAddress').value = pubkey;
              document.getElementById('signatureHex').value = sigHex;
              document.getElementById('authMode').value = 'signature';

              showStatus('✅ Signature verified! Authorizing Claude AI connection...');
              setTimeout(() => {
                document.getElementById('authForm').submit();
              }, 400);
            } catch (err) {
              showStatus('Authentication failed: ' + (err.message || err), true);
            }
          }

          function submitSpectatorMode() {
            const addr = document.getElementById('spectatorAddress').value.trim();
            if (!addr) {
              showStatus('Please enter a valid Solana address.', true);
              return;
            }
            document.getElementById('selectedAddress').value = addr;
            document.getElementById('authMode').value = 'spectator';
            showStatus('👁️ Authorizing in Read-Only Spectator Mode...');
            setTimeout(() => {
              document.getElementById('authForm').submit();
            }, 300);
          }
        </script>
      </body>
      </html>
    `);
  });

  // Handle OAuth authorization submission
  app.post("/oauth/authorize", (req: Request, res: Response) => {
    const {
      client_id,
      redirect_uri,
      state,
      code_challenge,
      wallet_address,
      auth_mode,
      signature_hex,
      challenge
    } = req.body;
    const issued = typeof challenge === "string" ? authChallenges.get(challenge) : undefined;
    if (!issued || Date.now() - issued.createdAt > 10 * 60 * 1000) {
      if (typeof challenge === "string") authChallenges.delete(challenge);
      res.status(400).send("Authentication challenge is missing, expired, or already used. Reload and try again.");
      return;
    }
    authChallenges.delete(challenge);
    if (client_id !== issued.clientId || (redirect_uri || "") !== issued.redirectUri || (state || "") !== issued.state || (code_challenge || "") !== issued.codeChallenge) {
      res.status(400).send("OAuth request parameters changed after the challenge was issued.");
      return;
    }

    let finalAddress = (wallet_address as string || "").trim();
    let isVerifiedOwner = false;

    if (auth_mode === "signature") {
      if (!finalAddress || !sharedAccountService.validateSolanaAddress(finalAddress)) {
        res.status(400).send("Invalid Solana wallet address provided.");
        return;
      }

      if (!signature_hex || !challenge) {
        res.status(400).send("Missing cryptographic signature or challenge message.");
        return;
      }

      try {
        const pubkey = new PublicKey(finalAddress);
        const pubkeyBytes = pubkey.toBytes();
        const challengeBytes = Buffer.from(challenge as string, "base64");
        if (challengeBytes.toString("base64") !== challenge) {
          res.status(400).send("Invalid challenge encoding.");
          return;
        }
        const messageBytes = new Uint8Array(challengeBytes);
        if (typeof signature_hex !== "string" || !/^[0-9a-fA-F]{128}$/.test(signature_hex)) {
          res.status(400).send("Invalid signature encoding.");
          return;
        }
        const signatureBytes = new Uint8Array(Buffer.from(signature_hex, "hex"));

        const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes);
        if (!isValid) {
          res.status(401).send("Cryptographic signature verification failed. Public key ownership not proven.");
          return;
        }
        isVerifiedOwner = true;
      } catch (err: unknown) {
        res.status(400).send(`Signature verification error: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    } else if (auth_mode === "spectator") {
      // Read-only mode: this links an address but does not prove ownership.
      if (!finalAddress) {
        res.status(400).send("Enter a Solana wallet address for read-only access.");
        return;
      }
      if (!sharedAccountService.validateSolanaAddress(finalAddress)) {
        res.status(400).send(`Invalid Solana address format: ${finalAddress}`);
        return;
      }
      isVerifiedOwner = false;
    } else {
      res.status(400).send("Unsupported wallet authorization mode.");
      return;
    }

    createAndRedirectCode(finalAddress, isVerifiedOwner, issued.clientId, issued.redirectUri, issued.state, issued.codeChallenge, res);
  });

  function createAndRedirectCode(
    address: string,
    isVerifiedOwner: boolean,
    clientId: string,
    redirectUri: string,
    state: string,
    codeChallenge: string | undefined,
    res: Response
  ) {
    const code = `cc_code_${crypto.randomBytes(16).toString("hex")}`;
    oauthCodes.set(code, {
      code,
      walletAddress: address,
      clientId: clientId || "claude-connector",
      redirectUri: redirectUri || "",
      codeChallenge,
      createdAt: Date.now(),
      isVerifiedOwner
    });

    if (redirectUri && redirectUri.length > 0) {
      const url = new URL(redirectUri);
      url.searchParams.set("code", code);
      if (state) url.searchParams.set("state", state);
      res.redirect(url.toString());
    } else {
      res.json({
        status: "AUTHORIZED",
        message: "Wallet linked successfully to Claude Custom Connector.",
        walletAddress: address,
        isVerifiedOwner,
        mode: isVerifiedOwner ? "CRYPTOGRAPHICALLY_VERIFIED_OWNER" : "READ_ONLY_SPECTATOR",
        authorizationCode: code,
        instructions: "Claude will exchange this code for a Bearer session token."
      });
    }
  }

  // =========================================================================
  // OAuth Token Exchange: /oauth/token
  // =========================================================================
  app.post("/oauth/token", (req: Request, res: Response) => {
    const { grant_type, code, client_id, redirect_uri, code_verifier } = req.body;

    if (grant_type !== "authorization_code") {
      res.status(400).json({ error: "unsupported_grant_type", error_description: "Only 'authorization_code' grant type is supported." });
      return;
    }

    if (!code || !oauthCodes.has(code)) {
      res.status(400).json({ error: "invalid_grant", error_description: "Invalid or expired authorization code." });
      return;
    }

    const codeEntry = oauthCodes.get(code)!;
    if (Date.now() - codeEntry.createdAt > 10 * 60 * 1000) {
      oauthCodes.delete(code);
      res.status(400).json({ error: "invalid_grant", error_description: "Authorization code expired." });
      return;
    }
    if (client_id !== codeEntry.clientId || (redirect_uri || "") !== codeEntry.redirectUri) {
      res.status(400).json({ error: "invalid_grant", error_description: "Client or redirect URI does not match the authorization request." });
      return;
    }
    if (codeEntry.codeChallenge) {
      if (typeof code_verifier !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/.test(code_verifier)) {
        res.status(400).json({ error: "invalid_grant", error_description: "A valid PKCE code_verifier is required." });
        return;
      }
      const verifierChallenge = crypto.createHash("sha256").update(code_verifier).digest("base64url");
      if (verifierChallenge !== codeEntry.codeChallenge) {
        res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed." });
        return;
      }
    }
    oauthCodes.delete(code); // Consume only after validating the client, redirect URI, and PKCE proof.

    // Generate Bearer token
    const accessToken = `pb_tok_${crypto.randomBytes(24).toString("hex")}`;
    oauthTokensToWallet.set(accessToken, {
      walletAddress: codeEntry.walletAddress,
      isVerifiedOwner: codeEntry.isVerifiedOwner,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
    });

    // Pre-initialize account in shared account service
    const account = sharedAccountService.getAccount();
    sharedAccountService.registerTokenAccount(accessToken, {
      ...account,
      walletAddress: codeEntry.walletAddress,
      connectedVia: codeEntry.isVerifiedOwner ? "Sign-In with Solana (SIWS)" : "Read-Only Spectator",
      isVerifiedOwner: codeEntry.isVerifiedOwner
    });

    res.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 2592000, // 30 days
      scope: "wallet:read wallet:write vault:trade",
      wallet_address: codeEntry.walletAddress,
      is_verified_owner: codeEntry.isVerifiedOwner
    });
  });

  // Welcome & documentation page
  app.get("/", (req: Request, res: Response) => {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host || "paybox-collectorcrypt-mcp.onrender.com";
    const baseUrl = `${proto}://${host}`;

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Unrip Protocol - Autonomous Physical Collectibles Agent</title>
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
        <h1>Unrip Agent Protocol <span class="badge">ONLINE</span></h1>
        <p>A Collector Crypt MCP for reading public Gacha data and selected Solana wallet information. Standard Gacha purchase and buyback flows require a host wallet that can sign Solana transactions; this server does not hold wallet keys.</p>
        
        <div class="features">
          <div class="feat-card">
            <strong>🔒 Wallet linking</strong><br>
            A browser wallet can sign an off-chain login message. This does not authorize Solana transactions.
          </div>
          <div class="feat-card">
            <strong>📦 Collector Crypt Gacha</strong><br>
            Read public machine and pack information. Pack outcomes and card proof come from Collector Crypt; this MCP does not independently verify collectible identity or value.
          </div>
          <div class="feat-card">
            <strong>💰 Eligible pack buybacks</strong><br>
            The MCP can prepare the documented Gacha buyback flow, but completion requires a supported PayBox transaction signer and Collector Crypt settlement.
          </div>
          <div class="feat-card">
            <strong>🛡️ Wallet safety</strong><br>
            Review each prepared transaction in your wallet before signing. This MCP does not create or fund agent wallets.
          </div>
        </div>

        <h2 style="margin-top: 2rem;">Connecting to Claude (Web & Desktop):</h2>
        <p>In Claude, go to <strong>Customize</strong> &rarr; <strong>Connectors</strong> &rarr; <strong>Add custom connector</strong> and enter:</p>
        
        <div class="code-box">
Name: Unrip
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
  app.all("/mcp", async (req: Request, res: Response) => {
    // Ensure Accept header permits event-stream / json to prevent 406 errors
    const acceptHeader = req.headers["accept"] || "";
    if (!acceptHeader.includes("text/event-stream") && !acceptHeader.includes("application/json")) {
      req.headers["accept"] = "application/json, text/event-stream";
    }

    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host || "paybox-collectorcrypt-mcp.onrender.com";
    const baseUrl = `${proto}://${host}`;

    const sessionId = (req.headers["mcp-session-id"] as string) || (req.query.sessionId as string);
    const authHeader = req.headers["authorization"] as string | undefined;
    const bearerToken = authHeader?.replace(/^Bearer\s+/i, "");

    const isSandboxBypass = process.env.NODE_ENV !== "production" && process.env.ALLOW_SANDBOX_BYPASS === "true";

    // RFC 9728 & Model Context Protocol Security Spec:
    // If client does not provide Bearer credentials, respond with HTTP 401 and WWW-Authenticate
    // This tells Claude's connector wizard that OAuth sign-in is required ("Sign in now [Detected]").
    if (!bearerToken && !isSandboxBypass) {
      res.setHeader(
        "WWW-Authenticate",
        `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
      );
      res.status(401).json({
        error: "unauthorized",
        error_description: "Sign-In with Solana required via Unrip OAuth.",
        resource_metadata: `${baseUrl}/.well-known/oauth-protected-resource`
      });
      return;
    }

    const tokenData = bearerToken ? oauthTokensToWallet.get(bearerToken) : undefined;
    if (bearerToken && (!tokenData || tokenData.expiresAt <= Date.now()) && !isSandboxBypass) {
      if (tokenData) oauthTokensToWallet.delete(bearerToken);
      res.setHeader(
        "WWW-Authenticate",
        `Bearer error="invalid_token", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
      );
      res.status(401).json({
        error: "invalid_token",
        error_description: "Access token is invalid or expired.",
        resource_metadata: `${baseUrl}/.well-known/oauth-protected-resource`
      });
      return;
    }

    let transport: StreamableHTTPServerTransport;

    if (sessionId && streamableSessions.has(sessionId)) {
      transport = streamableSessions.get(sessionId)!;
    } else {
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

      // Ensure strict session isolation: each session gets its own AccountService instance
      let sessionAccountService = new AccountService(solanaService);
      if (bearerToken && tokenData) {
        await sessionAccountService.connectWallet(tokenData.walletAddress, tokenData.isVerifiedOwner);
      }


      sessionAccountServices.set(newSessionId, sessionAccountService);

      const server = createCollectorCryptServer(sessionAccountService);
      await server.connect(transport);
      streamableSessions.set(newSessionId, transport);
    }

    try {
      await transport.handleRequest(req, res, req.body);
    } catch (err: unknown) {
      console.error("[StreamableHTTP] Error handling request:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal error processing MCP request" });
      }
    }
  });

  // =========================================================================
  // Backward compatibility: /sse and /messages (Legacy SSE clients)
  // =========================================================================
  app.get("/sse", async (req: Request, res: Response) => {
    const bearerToken = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const tokenData = bearerToken ? oauthTokensToWallet.get(bearerToken) : undefined;
    if (!bearerToken || !tokenData || tokenData.expiresAt <= Date.now()) {
      if (tokenData && bearerToken) oauthTokensToWallet.delete(bearerToken);
      res.setHeader("WWW-Authenticate", 'Bearer error="invalid_token"');
      res.status(401).json({ error: "unauthorized", error_description: "A valid Unrip OAuth bearer token is required." });
      return;
    }
    console.log("[Legacy SSE] Client connecting to /sse...");
    const sessionAccountService = new AccountService(solanaService);
    await sessionAccountService.connectWallet(tokenData.walletAddress, tokenData.isVerifiedOwner);
    const server = createCollectorCryptServer(sessionAccountService);
    const transport = new SSEServerTransport("/messages", res);

    const sessionId = transport.sessionId;
    sseTransports[sessionId] = transport;
    sseTokenBySession[sessionId] = bearerToken;

    transport.onclose = () => {
      delete sseTransports[sessionId];
      delete sseTokenBySession[sessionId];
    };

    await server.connect(transport);
  });

  app.post("/messages", async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    const transport = sseTransports[sessionId];
    const bearerToken = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const expectedToken = sseTokenBySession[sessionId];
    const tokenData = bearerToken ? oauthTokensToWallet.get(bearerToken) : undefined;

    if (!transport) {
      res.status(404).send("Session not found or expired");
      return;
    }
    if (!bearerToken || bearerToken !== expectedToken || !tokenData || tokenData.expiresAt <= Date.now()) {
      res.status(401).json({ error: "unauthorized", error_description: "The SSE session requires its valid owning bearer token." });
      return;
    }

    await transport.handlePostMessage(req, res);
  });

  const serverInstance = app.listen(port, () => {
    console.log(`\n=======================================================`);
    console.log(`🚀 Unrip Protocol - Autonomous Physical Collectibles Agent Ready!`);
    console.log(`📡 Base URL: http://localhost:${port}`);
    console.log(`⚡ Streamable HTTP (Claude Connector spec): http://localhost:${port}/mcp`);
    console.log(`⚡ OAuth Discovery: http://localhost:${port}/.well-known/oauth-authorization-server`);
    console.log(`⚡ Wallet Link Portal: http://localhost:${port}/oauth/authorize`);
    console.log(`⚡ Legacy SSE: http://localhost:${port}/sse`);
    console.log(`=======================================================\n`);
  });

  return serverInstance;
}
