/**
 * tools/browser.ts
 *
 * MCP tools for browser interaction.
 * Rule: one file per tool group, export a register(server) function.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { browserManager, DEFAULT_CDP_ENDPOINT } from "../browser/index.js";
import { ok, err } from "../types.js";
import type { ToolResponse } from "../types.js";

const attachTabSelectorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("index"),
    index: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal("url"),
    url: z.string().min(1),
  }),
  z.object({
    kind: z.literal("title"),
    title: z.string().min(1),
  }),
]);

export function register(server: McpServer): void {
  // -------------------------------------------------------------------------
  // Tool: get_attach_status
  // -------------------------------------------------------------------------
  server.tool(
    "get_attach_status",
    [
      "Check whether a Chrome instance exposes the CDP version endpoint at the",
      "given URL. Returns a machine-readable attach readiness status",
      "plus launch guidance when the endpoint is unavailable.",
    ].join(" "),
    {
      endpoint: z
        .string()
        .url()
        .optional()
        .default(DEFAULT_CDP_ENDPOINT)
        .describe("Base CDP endpoint URL to inspect (e.g. http://127.0.0.1:9222)."),
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

  // -------------------------------------------------------------------------
  // Tool: get_attach_tabs
  // -------------------------------------------------------------------------
  server.tool(
    "get_attach_tabs",
    [
      "List the CDP page tabs exposed by a Chrome instance.",
      "Optional URL and title filters narrow the returned tab list.",
      "Returns the currently selected tab when one has already been chosen.",
    ].join(" "),
    {
      endpoint: z
        .string()
        .url()
        .optional()
        .default(DEFAULT_CDP_ENDPOINT)
        .describe("Base CDP endpoint URL to inspect."),
      url: z.string().optional().describe("Optional substring filter applied to the tab URL."),
      title: z.string().optional().describe("Optional substring filter applied to the tab title."),
    },
    async ({ endpoint, url, title }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.getAttachTabs(endpoint, url, title);
        if ("error" in result) return err(result.error);
        return ok(result);
      } catch (e) {
        return err(`get_attach_tabs failed unexpectedly: ${String(e)}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: select_attach_tab
  // -------------------------------------------------------------------------
  server.tool(
    "select_attach_tab",
    [
      "Select one CDP page tab by index, URL, or title.",
      "If no tab matches, the tool returns a structured 'not found' response.",
    ].join(" "),
    {
      endpoint: z
        .string()
        .url()
        .optional()
        .default(DEFAULT_CDP_ENDPOINT)
        .describe("Base CDP endpoint URL to inspect."),
      selector: attachTabSelectorSchema.describe("How to identify the tab to select."),
    },
    async ({ endpoint, selector }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.selectAttachTab(endpoint, selector);
        if ("error" in result) return err(result.error);
        return ok(result);
      } catch (e) {
        return err(`select_attach_tab failed unexpectedly: ${String(e)}`);
      }
    }
  );
}
