import assert from "node:assert/strict";
import { startHttpServer } from "../dist/http-server.js";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { AccountService } from "../dist/services/accountService.js";
import { createHash } from "node:crypto";

const server = startHttpServer(0);

try {
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const page = await (await fetch(`${baseUrl}/oauth/authorize`)).text();
  const match = page.match(/id="challengeText" name="challenge" value="([^"]+)"/);

  assert.ok(match, "authorize page should include a base64 challenge");

  const challengeBase64 = match[1];
  const messageBytes = Buffer.from(challengeBase64, "base64");
  assert.equal(messageBytes.toString("base64"), challengeBase64, "challenge should round-trip exactly");

  const challenge = messageBytes.toString("utf8");
  assert.match(challenge, /\nDomain: /);
  assert.match(challenge, /\nNonce: /);

  const keypair = Keypair.generate();
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  const body = new URLSearchParams({
    client_id: "claude-connector",
    redirect_uri: "",
    state: "",
    code_challenge: "",
    wallet_address: keypair.publicKey.toBase58(),
    auth_mode: "signature",
    signature_hex: Buffer.from(signature).toString("hex"),
    challenge: challengeBase64,
  });

  const response = await fetch(`${baseUrl}/oauth/authorize`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.isVerifiedOwner, true);
  assert.equal(result.walletAddress, keypair.publicKey.toBase58());

  const replayed = await fetch(`${baseUrl}/oauth/authorize`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  assert.equal(replayed.status, 400, "a signed challenge must be one-time use");

  const invalidPage = await (await fetch(`${baseUrl}/oauth/authorize`)).text();
  const invalidMatch = invalidPage.match(/id="challengeText" name="challenge" value="([^"]+)"/);
  assert.ok(invalidMatch, "a fresh challenge should be issued for a new attempt");
  const invalidBody = new URLSearchParams(body);
  invalidBody.set("challenge", invalidMatch[1]);
  const rejected = await fetch(`${baseUrl}/oauth/authorize`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: invalidBody,
  });

  assert.equal(rejected.status, 401, "invalid signatures must be rejected");

  const unregisteredRedirect = await fetch(`${baseUrl}/oauth/authorize?client_id=claude-connector&redirect_uri=https%3A%2F%2Fevil.example%2Fcallback&code_challenge=${"A".repeat(43)}`);
  assert.equal(unregisteredRedirect.status, 400, "unregistered redirect URIs must be rejected");

  const missingPkce = await fetch(`${baseUrl}/oauth/authorize?client_id=claude-connector&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback`);
  assert.equal(missingPkce.status, 400, "OAuth redirects must include an S256 PKCE challenge");

  const querySandboxBypass = await fetch(`${baseUrl}/mcp?sandbox=true`);
  assert.equal(querySandboxBypass.status, 401, "the public sandbox query must not bypass authentication");
  const headerSandboxBypass = await fetch(`${baseUrl}/mcp`, { headers: { "x-sandbox-bypass": "true" } });
  assert.equal(headerSandboxBypass.status, 401, "the public sandbox header must not bypass authentication");
  const unauthenticatedSse = await fetch(`${baseUrl}/sse`);
  assert.equal(unauthenticatedSse.status, 401, "legacy SSE must require a wallet bearer token");

  const boundPage = await (await fetch(`${baseUrl}/oauth/authorize`)).text();
  const boundMatch = boundPage.match(/id="challengeText" name="challenge" value="([^"]+)"/);
  assert.ok(boundMatch, "a challenge should be issued for parameter-binding validation");
  const wrongClientBody = new URLSearchParams(body);
  wrongClientBody.set("challenge", boundMatch[1]);
  wrongClientBody.set("client_id", "attacker-client");
  const wrongClient = await fetch(`${baseUrl}/oauth/authorize`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: wrongClientBody,
  });
  assert.equal(wrongClient.status, 400, "OAuth parameters must remain bound to the issued challenge");

  const verifier = "v".repeat(43);
  const pkceChallenge = createHash("sha256").update(verifier).digest("base64url");
  const oauthState = "integration-state";
  const oauthParams = new URLSearchParams({
    client_id: "claude-connector",
    redirect_uri: "https://claude.ai/api/mcp/auth_callback",
    state: oauthState,
    code_challenge: pkceChallenge,
  });
  const oauthPage = await (await fetch(`${baseUrl}/oauth/authorize?${oauthParams}`)).text();
  const oauthMatch = oauthPage.match(/id="challengeText" name="challenge" value="([^"]+)"/);
  assert.ok(oauthMatch, "OAuth flow should issue a challenge after validating redirect and PKCE");
  const oauthMessage = Buffer.from(oauthMatch[1], "base64");
  const oauthSignature = nacl.sign.detached(oauthMessage, keypair.secretKey);
  const oauthBody = new URLSearchParams({
    client_id: "claude-connector",
    redirect_uri: "https://claude.ai/api/mcp/auth_callback",
    state: oauthState,
    code_challenge: pkceChallenge,
    wallet_address: keypair.publicKey.toBase58(),
    auth_mode: "signature",
    signature_hex: Buffer.from(oauthSignature).toString("hex"),
    challenge: oauthMatch[1],
  });
  const oauthResponse = await fetch(`${baseUrl}/oauth/authorize`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: oauthBody,
    redirect: "manual",
  });
  assert.equal(oauthResponse.status, 302, "valid OAuth wallet proof should redirect to registered callback");
  const callback = new URL(oauthResponse.headers.get("location"));
  assert.equal(callback.searchParams.get("state"), oauthState, "OAuth state must survive the redirect");
  const authCode = callback.searchParams.get("code");
  assert.ok(authCode, "OAuth callback must contain an authorization code");

  const exchange = async (codeVerifier) => fetch(`${baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: authCode,
      client_id: "claude-connector",
      redirect_uri: "https://claude.ai/api/mcp/auth_callback",
      code_verifier: codeVerifier,
    }),
  });
  assert.equal((await exchange("x".repeat(43))).status, 400, "wrong PKCE verifier must be rejected");
  const tokenResponse = await exchange(verifier);
  assert.equal(tokenResponse.status, 200, "correct PKCE verifier should exchange the code");
  const token = await tokenResponse.json();
  assert.equal(token.wallet_address, keypair.publicKey.toBase58());

  const accountService = new AccountService({
    getBalances: async () => ({ sol: 0, usdc: 0, cards: 0 }),
  });
  assert.equal(accountService.getAccount().isVerifiedOwner, false, "the sample account must not start as a verified signer");
  const reconnectAddress = Keypair.generate().publicKey.toBase58();
  await accountService.connectWallet(reconnectAddress, true);
  await accountService.connectWallet(reconnectAddress, false);
  assert.equal(accountService.getAccount().isVerifiedOwner, false, "a read-only reconnect must clear prior owner verification");
  assert.throws(() => accountService.requireVerifiedOwner("spend funds"), /Read-Only Spectator Mode/);
  console.log("Wallet auth integration check passed.");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
