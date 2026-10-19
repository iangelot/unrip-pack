import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CollectorCryptService } from "./services/collectorCrypt.js";
import { SolanaService } from "./services/solana.js";
import { AccountService } from "./services/accountService.js";
import { registerAccountTools } from "./tools/accountTools.js";
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
export function createCollectorCryptServer(accountServiceInstance) {
    const ccService = new CollectorCryptService();
    const solanaService = new SolanaService();
    const accountService = accountServiceInstance || new AccountService(solanaService);
    const server = new McpServer({
        name: "collector-crypt-paybox-plugin",
        version: "1.0.0"
    });
    // Register all tool suites
    registerAccountTools(server, accountService, ccService);
    registerVaultTools(server, ccService, accountService);
    registerGachaTools(server, ccService, solanaService, accountService);
    registerTokenTools(server, ccService, solanaService, accountService);
    registerRedemptionTools(server, ccService, accountService);
    registerLendingTools(server, ccService, accountService);
    registerAnalyticsTools(server, ccService);
    registerIngestionTools(server);
    return server;
}
//# sourceMappingURL=server.js.map