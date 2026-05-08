/**
 * tools/network.ts
 *
 * MCP tools for runtime network inspection.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { browserManager } from "../browser/index.js";
import { ok, err } from "../types.js";
import type { ToolResponse } from "../types.js";

export function register(server: McpServer): void {
  server.tool(
    "get_network_events",
    [
      "Returns the recent network events captured from fetch and XMLHttpRequest.",
      "Includes a summary that highlights HTTP errors (4xx/5xx) for quick AI diagnostics.",
    ].join(" "),
    {
      url: z.string().url().describe("URL of the page to inspect."),
      onlyErrors: z.boolean().optional().default(false).describe("Return only HTTP error events."),
      limit: z.number().int().min(1).max(500).optional().default(100).describe("Maximum number of events to return."),
    },
    async ({ url, onlyErrors = false, limit = 100 }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.getNetworkEvents(url, onlyErrors, limit);
        if ("error" in result) return err(result.error);
        return ok(result);
      } catch (e) {
        return err(`get_network_events failed unexpectedly: ${String(e)}`);
      }
    }
  );
}
