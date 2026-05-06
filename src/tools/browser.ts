/**
 * tools/browser.ts — MCP tools for browser interaction.
 * Rule: one file per tool group, export a register(server) function.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { browserManager } from "../browser/index.js";
import { ok, err } from "../types.js";
import type { ToolResponse } from "../types.js";

export function register(server: McpServer): void {
  server.tool(
    "browser_ping",
    "Open an isolated browser context, navigate to a URL, and return page metadata (title, URL, timestamp). Validates the MCP ↔ browser bridge.",
    {
      url: z.string().url().describe("URL to ping (e.g. http://localhost:5173)."),
    },
    async ({ url }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.ping(url);
        return result.success ? ok(result.data) : err(result.error);
      } catch (e) {
        return err(`browser_ping failed unexpectedly: ${String(e)}`);
      }
    }
  );
}
