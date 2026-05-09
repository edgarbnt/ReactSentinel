/**
 * tools/browser.ts
 *
 * MCP tools for browser interaction.
 * Rule: one file per tool group, export a register(server) function.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { browserManager } from "../browser/index.js";
import { ok, err } from "../types.js";
import type { ToolResponse } from "../types.js";

export function register(server: McpServer): void {
  // -------------------------------------------------------------------------
  // Tool: get_attach_status
  // -------------------------------------------------------------------------
  server.tool(
    "get_attach_status",
    [
      "Check whether a Chrome instance exposes the CDP version endpoint on the",
      "given host and port. Returns a machine-readable attach readiness status",
      "plus launch guidance when the endpoint is unavailable.",
    ].join(" "),
    {
      endpoint: z
        .string()
        .url()
        .optional()
        .default("http://127.0.0.1:9222")
        .describe("Base CDP endpoint to inspect."),
    },
    async ({ endpoint }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.getAttachStatus(endpoint);
        return ok(result);
      } catch (e) {
        return err(`get_attach_status failed unexpectedly: ${String(e)}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: browser_ping
  // -------------------------------------------------------------------------
  server.tool(
    "browser_ping",
    [
      "Open an isolated browser context, navigate to a URL, and return page",
      "metadata (title, URL, timestamp). Validates the MCP ↔ browser bridge.",
      "Returns a structured error if the URL is unreachable.",
    ].join(" "),
    {
      url: z
        .string()
        .url()
        .describe(
          "URL of the page to ping (e.g. http://localhost:5173)."
        ),
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
