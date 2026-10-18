import express from "express";
import cors from "cors";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createCollectorCryptServer } from "./server.js";
export function startHttpServer(port = 3000) {
    const app = express();
    app.use(cors());
    // Store active SSE transports by session
    const transports = {};
    // Health check endpoint
    app.get("/health", (_req, res) => {
        res.json({
            status: "healthy",
            service: "collector-crypt-paybox-mcp",
            version: "1.0.0",
            transport: "SSE",
            supportedChain: "Solana Mainnet",
            timestamp: new Date().toISOString()
        });
    });
    // Welcome & Documentation home page
    app.get("/", (_req, res) => {
        res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Collector Crypt PayBox Remote MCP Server</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0a0c10; color: #f8fafc; padding: 2rem; max-width: 800px; margin: 0 auto; line-height: 1.6; }
          .badge { background: #10b981; color: #000; padding: 0.2rem 0.6rem; border-radius: 999px; font-weight: bold; font-size: 0.8rem; }
          .code-box { background: #161b26; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 1rem; font-family: monospace; overflow-x: auto; color: #38bdf8; margin: 1rem 0; }
          h1 { color: #6366f1; }
        </style>
      </head>
      <body>
        <h1>Collector Crypt PayBox Remote MCP <span class="badge">ONLINE</span></h1>
        <p>This remote Model Context Protocol server connects any AI assistant (Claude, Cursor, ChatGPT, Grok, PayBox) to Collector Crypt real-world asset (RWA) vault on Solana.</p>
        
        <h2>How to Connect Any AI to This URL:</h2>
        <p>Add this endpoint to your AI client's MCP configuration:</p>
        <div class="code-box">
{
  "mcpServers": {
    "collector-crypt": {
      "url": "https://${_req.headers.host || "your-app.onrender.com"}/sse"
    }
  }
}
        </div>

        <h3>Endpoints:</h3>
        <ul>
          <li><code>/sse</code> - Server-Sent Events MCP connection stream</li>
          <li><code>/messages</code> - JSON-RPC message receiver</li>
          <li><code>/health</code> - Service health and diagnostic status</li>
        </ul>
      </body>
      </html>
    `);
    });
    // SSE endpoint for AI clients
    app.get("/sse", async (_req, res) => {
        console.log("[SSE] New incoming MCP client connection...");
        const server = createCollectorCryptServer();
        const transport = new SSEServerTransport("/messages", res);
        const sessionId = transport.sessionId;
        transports[sessionId] = transport;
        transport.onclose = () => {
            console.log(`[SSE] Client disconnected session: ${sessionId}`);
            delete transports[sessionId];
        };
        await server.connect(transport);
    });
    // Message handler for client JSON-RPC commands
    app.post("/messages", async (req, res) => {
        const sessionId = req.query.sessionId;
        const transport = transports[sessionId];
        if (!transport) {
            res.status(404).send("Session not found or expired");
            return;
        }
        await transport.handlePostMessage(req, res);
    });
    const serverInstance = app.listen(port, () => {
        console.log(`\n=======================================================`);
        console.log(`🚀 Collector Crypt PayBox Remote MCP Server Running!`);
        console.log(`📡 URL: http://localhost:${port}`);
        console.log(`⚡ SSE Endpoint: http://localhost:${port}/sse`);
        console.log(`=======================================================\n`);
    });
    return serverInstance;
}
//# sourceMappingURL=http-server.js.map