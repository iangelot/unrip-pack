import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import crypto from "crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createCollectorCryptServer } from "./server.js";

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

  // In-memory sessions map for Streamable HTTP transport
  const streamableSessions = new Map<string, StreamableHTTPServerTransport>();
  // Active legacy SSE transports
  const sseTransports: Record<string, SSEServerTransport> = {};

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "healthy",
      service: "collector-crypt-paybox-mcp",
      version: "1.0.0",
      endpoints: {
        streamableHttp: "/mcp",
        legacySse: "/sse"
      },
      supportedChain: "Solana Mainnet",
      timestamp: new Date().toISOString()
    });
  });

  // Welcome & documentation page
  app.get("/", (req: Request, res: Response) => {
    const host = req.headers.host || "paybox-collectorcrypt-mcp.onrender.com";
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
        </style>
      </head>
      <body>
        <h1>Collector Crypt Connector <span class="badge">ONLINE</span></h1>
        <p>This is a live, remote Model Context Protocol (MCP) server compatible with <strong>Claude Custom Connectors</strong>, <strong>ChatGPT</strong>, and <strong>PayBox</strong>.</p>
        
        <h2 style="margin-top: 2rem;">Connecting to Claude (Web & Desktop):</h2>
        <p>In Claude, go to <strong>Customize</strong> &rarr; <strong>Connectors</strong> &rarr; <strong>Add custom connector</strong> and enter:</p>
        
        <div class="code-box">
Name: Collector Crypt
MCP Server URL: https://${host}/mcp
        </div>

        <p>This endpoint supports standard Streamable HTTP used by official connectors like VidIQ and Figma.</p>
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

    const sessionId = (req.headers["mcp-session-id"] as string) || (req.query.sessionId as string);
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
        }
      };

      const server = createCollectorCryptServer();
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
  app.get("/sse", async (_req: Request, res: Response) => {
    console.log("[Legacy SSE] Client connecting to /sse...");
    const server = createCollectorCryptServer();
    const transport = new SSEServerTransport("/messages", res);

    const sessionId = transport.sessionId;
    sseTransports[sessionId] = transport;

    transport.onclose = () => {
      delete sseTransports[sessionId];
    };

    await server.connect(transport);
  });

  app.post("/messages", async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
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
    console.log(`⚡ Legacy SSE: http://localhost:${port}/sse`);
    console.log(`=======================================================\n`);
  });

  return serverInstance;
}
