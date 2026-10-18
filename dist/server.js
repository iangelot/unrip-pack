import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CollectorCryptService } from "./services/collectorCrypt.js";
import { SolanaService } from "./services/solana.js";
import { registerVaultTools } from "./tools/vaultTools.js";
import { registerGachaTools } from "./tools/gachaTools.js";
import { registerTokenTools } from "./tools/tokenTools.js";
import { registerRedemptionTools } from "./tools/redemptionTools.js";
import { registerLendingTools } from "./tools/lendingTools.js";
import { registerAnalyticsTools } from "./tools/analyticsTools.js";
import { registerIngestionTools } from "./tools/ingestionTools.js";
/**
 * Creates and registers all tools for the Collector Crypt PayBox MCP server
 */
export function createCollectorCryptServer() {
    const ccService = new CollectorCryptService();
    const solanaService = new SolanaService();
    const server = new McpServer({
        name: "collector-crypt-paybox-plugin",
        version: "1.0.0"
    });
    // Register all tool suites
    registerVaultTools(server, ccService);
    registerGachaTools(server, ccService, solanaService);
    registerTokenTools(server, ccService, solanaService);
    registerRedemptionTools(server, ccService);
    registerLendingTools(server, ccService);
    registerAnalyticsTools(server, ccService);
    registerIngestionTools(server);
    return server;
}
//# sourceMappingURL=server.js.map