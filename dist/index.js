#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCollectorCryptServer } from "./server.js";
import { startHttpServer } from "./http-server.js";
async function main() {
    const args = process.argv.slice(2);
    const isHttpMode = args.includes("--http") || process.env.MODE === "http" || !!process.env.PORT;
    if (isHttpMode) {
        const port = Number(process.env.PORT) || 3000;
        startHttpServer(port);
    }
    else {
        // Default Stdio mode for local Cursor / Claude Desktop / CLI
        const server = createCollectorCryptServer();
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("Collector Crypt PayBox Plugin MCP Server running on stdio");
    }
}
main().catch((error) => {
    console.error("Fatal error running Collector Crypt PayBox Plugin:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map