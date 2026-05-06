/**
 * tools/diagnostics.ts — SCRUM-28
 *
 * MCP tools for runtime diagnostics.
 * Rule: one file per tool group, export a register(server) function.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { browserManager } from "../browser/index.js";
import { ok, err } from "../types.js";
import type { ToolResponse } from "../types.js";

export function register(server: McpServer): void {
  // -------------------------------------------------------------------------
  // Tool: get_runtime_status
  // -------------------------------------------------------------------------
  server.tool(
    "get_runtime_status",
    [
      "Navigate to a URL and return a full runtime diagnostic snapshot:",
      "page title, URL, viewport dimensions, timestamp, and React detection",
      "(version, fiber presence, devtools hook). Returns a structured error",
      "if the URL is unreachable.",
    ].join(" "),
    {
      url: z
        .string()
        .url()
        .describe("URL of the page to inspect (e.g. http://localhost:5173)."),
    },
    async ({ url }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.getRuntimeStatus(url);
        if ("error" in result) return err(result.error);
        return ok(result);
      } catch (e) {
        return err(`get_runtime_status failed unexpectedly: ${String(e)}`);
      }
    }
  );
}
