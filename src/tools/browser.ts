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

export const BROWSER_TOOL_NAMES = [
  "get_session_status",
  "navigate_replay",
  "start_debug_replay",
  "get_attach_status",
  "browser_ping",
  "get_attach_tabs",
  "select_attach_tab",
] as const;

export function register(server: McpServer): void {
  // -------------------------------------------------------------------------
  // Tool: get_session_status
  // -------------------------------------------------------------------------
  server.tool(
    "get_session_status",
    [
      "Return the current browser session mode used by React-Sentinel before you run runtime tools.",
      "Use this instead of guessing from config files when you need to know whether the next tool will hit a live attached tab, the managed browser, or the isolated replay browser.",
      "Reports the active mode plus the current replay headless/headed configuration.",
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
      "Navigate the isolated replay browser to a target URL and wait for the app to load in a clean, deterministic session.",
      "Use this instead of manual clicking or grep when you first need a reproducible browser state for runtime diagnostics, assertions, or sandbox patches.",
      "Supports configurable waitUntil, timeout, and headless/headed replay mode and returns readable navigation errors plus session metadata.",
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

  server.tool(
    "start_debug_replay",
    [
      "Action-oriented alias for navigate_replay that starts a clean replay debugging session for runtime investigation.",
      "Prefer this when the agent wants an explicit 'start debugging in replay mode' entry point instead of a lower-level navigation name.",
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
        return err(`start_debug_replay failed unexpectedly: ${String(e)}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: get_attach_status
  // -------------------------------------------------------------------------
  server.tool(
    "get_attach_status",
    [
      "Check whether a Chrome instance exposes the CDP endpoint required for live attach mode.",
      "Use this instead of reading docs or config when runtime debugging depends on an already-authenticated user session in a real Chrome tab.",
      "Returns a machine-readable attach readiness status plus launch guidance when the endpoint is unavailable.",
    ].join(" "),
    {
      endpoint: z
        .string()
        .url()
        .optional()
        .describe("Base CDP endpoint URL to inspect (e.g. http://127.0.0.1:9222)."),
    },
    async ({ endpoint }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.getAttachStatus(endpoint ?? browserManager.getDefaultCdpEndpoint());
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
      "Open an isolated browser context, navigate to a URL, and confirm that React-Sentinel can actually reach the target app.",
      "Use this instead of assuming the app is up when you need a quick bridge smoke test before deeper runtime tools.",
      "Returns page metadata plus a structured error if the URL is unreachable.",
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
      "List the live Chrome tabs exposed by a CDP endpoint so the agent can choose the right authenticated or user-prepared page.",
      "Use this instead of guessing tab order when the runtime bug only reproduces in a real browser session.",
      "Optional URL and title filters narrow the returned tab list and the response also shows the currently selected tab.",
    ].join(" "),
    {
      endpoint: z
        .string()
        .url()
        .optional()
        .describe("Base CDP endpoint URL to inspect."),
      url: z.string().optional().describe("Optional substring filter applied to the tab URL."),
      title: z.string().optional().describe("Optional substring filter applied to the tab title."),
    },
    async ({ endpoint, url, title }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.getAttachTabs(endpoint ?? browserManager.getDefaultCdpEndpoint(), url, title);
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
      "Preview or confirm one live Chrome tab by index, URL, or title before React-Sentinel reuses it in attach mode.",
      "Use this instead of brittle manual coordination when you must point runtime tools at the exact tab that already holds the right app state.",
      "A matched tab is not activated until confirm is true, and missing tabs return a structured not-found response.",
    ].join(" "),
    {
      endpoint: z
        .string()
        .url()
        .optional()
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
        const result = await browserManager.selectAttachTab(
          endpoint ?? browserManager.getDefaultCdpEndpoint(),
          selector,
          confirm
        );
        if ("error" in result) return err(result.error);
        return ok(result);
      } catch (e) {
        return err(`select_attach_tab failed unexpectedly: ${String(e)}`);
      }
    }
  );
}
