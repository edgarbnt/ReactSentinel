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

const replayWaitUntilSchema = z
  .enum(["load", "domcontentloaded", "networkidle"])
  .default("domcontentloaded");

export function register(server: McpServer): void {
  // -------------------------------------------------------------------------
  // Tool: get_session_status
  // -------------------------------------------------------------------------
  server.tool(
    "get_session_status",
    [
      "Return the current browser session mode used by React-Sentinel.",
      "Reports whether tools will use the attached live tab or the isolated replay browser,",
      "plus the current replay headless/headed configuration.",
    ].join(" "),
    {},
    async (): Promise<ToolResponse> => {
      try {
        return ok(await browserManager.getSessionInfo());
      } catch (e) {
        return err(`get_session_status failed unexpectedly: ${String(e)}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: navigate_replay
  // -------------------------------------------------------------------------
  server.tool(
    "navigate_replay",
    [
      "Navigate the isolated replay browser to a target URL and wait for the application to load.",
      "Supports configurable waitUntil, timeout, and headless/headed replay mode.",
      "Returns readable navigation errors plus the active session metadata.",
    ].join(" "),
    {
      url: z.string().url().describe("Target URL for the replay browser."),
      waitUntil: replayWaitUntilSchema.describe("Playwright readiness event to wait for before returning."),
      timeoutMs: z.number().int().min(1).max(120_000).optional().default(10_000).describe("Navigation timeout in milliseconds."),
      headless: z.boolean().optional().describe("Override the replay browser mode for this navigation."),
      resetSession: z.boolean().optional().default(false).describe("Close the current replay browser first and start a fresh isolated session."),
    },
    async ({ url, waitUntil, timeoutMs, headless, resetSession }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.navigateReplay(url, {
          waitUntil,
          timeoutMs,
          headless,
          resetSession,
        });
        if ("error" in result) return err(result.error);
        return ok(result);
      } catch (e) {
        return err(`navigate_replay failed unexpectedly: ${String(e)}`);
      }
    }
  );

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
      "Preview or confirm one CDP page tab by index, URL, or title.",
      "A matched tab is not activated for live browser mode until confirm is true.",
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
      confirm: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Set to true to explicitly allow React-Sentinel to reuse the selected live browser tab."
        ),
    },
    async ({ endpoint, selector, confirm }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.selectAttachTab(endpoint, selector, confirm);
        if ("error" in result) return err(result.error);
        return ok(result);
      } catch (e) {
        return err(`select_attach_tab failed unexpectedly: ${String(e)}`);
      }
    }
  );
}
