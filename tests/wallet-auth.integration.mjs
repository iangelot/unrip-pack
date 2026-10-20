import assert from "node:assert/strict";
import { startHttpServer } from "../dist/http-server.js";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";

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

  const invalidBody = new URLSearchParams(body);
  invalidBody.set("signature_hex", "00".repeat(64));
  const rejected = await fetch(`${baseUrl}/oauth/authorize`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: invalidBody,
  });

  assert.equal(rejected.status, 401, "invalid signatures must be rejected");
  console.log("Wallet auth integration check passed.");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
