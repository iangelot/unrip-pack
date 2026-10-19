import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AccountService } from "./services/accountService.js";
/**
 * Creates and registers all tools for the Collector Crypt PayBox MCP server
 */
export declare function createCollectorCryptServer(accountServiceInstance?: AccountService): McpServer;
