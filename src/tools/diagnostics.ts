/**
 * tools/diagnostics.ts — SCRUM-28
 *
 * MCP tools for runtime diagnostics.
 * Rule: one file per tool group, export a register(server) function.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { browserManager } from "../browser/index.js";
import type { InspectionResponseMode } from "../diagnostics/protocol.js";
import { ok, err } from "../types.js";
import type { ToolResponse } from "../types.js";

const inspectionResponseModeSchema = z
  .enum(["full", "compact"])
  .default("full")
  .describe("Choose 'compact' to aggressively trim long inspection payloads for AI consumption.");

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

  // -------------------------------------------------------------------------
  // Tool: get_react_tree
  // -------------------------------------------------------------------------
  server.tool(
    "get_react_tree",
    [
      "Extract a simplified representation of the React Fiber tree from a running page.",
      "Returns a hierarchical JSON tree of components and their props.",
    ].join(" "),
    {
      url: z
        .string()
        .url()
        .describe("URL of the page to inspect (e.g. http://localhost:5173)."),
      maxDepth: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum depth to traverse in the Fiber tree. Default is 10."),
      includeHostNodes: z
        .boolean()
        .optional()
        .describe("Include standard HTML elements (HostComponent) in the tree. Default is false."),
    },
    async ({ url, maxDepth = 10, includeHostNodes = false }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.getReactTree(url, maxDepth, includeHostNodes);
        if ("error" in result) return err(result.error);
        return ok(result);
      } catch (e) {
        return err(`get_react_tree failed unexpectedly: ${String(e)}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: inspect_component
  // -------------------------------------------------------------------------
  server.tool(
    "inspect_component",
    [
      "Search the React Fiber tree for a specific component by name and extract",
      "its details for AI inspection, including props, path in the tree,",
      "provider or consumed contexts, children count, and a compact summary.",
      "Use responseMode='compact' when you want a shorter payload.",
    ].join(" "),
    {
      url: z
        .string()
        .url()
        .describe("URL of the page to inspect (e.g. http://localhost:5173)."),
      componentName: z
        .string()
        .min(1)
        .describe("Name of the React component to inspect (e.g. 'TodoItem')."),
      responseMode: inspectionResponseModeSchema,
    },
    async ({ url, componentName, responseMode = "full" }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.inspectComponent(url, componentName, responseMode as InspectionResponseMode);
        if ("error" in result) return err(result.error);
        return ok(result);
      } catch (e) {
        return err(`inspect_component failed unexpectedly: ${String(e)}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: get_component_state
  // -------------------------------------------------------------------------
  server.tool(
    "get_component_state",
    [
      "Inspect a specific React component and return its serializable hook state.",
      "Useful for checking simple useState/useRef/useMemo values without reading source code.",
      "Use responseMode='compact' when you want a shorter payload for AI analysis.",
    ].join(" "),
    {
      url: z
        .string()
        .url()
        .describe("URL of the page to inspect (e.g. http://localhost:5173)."),
      componentName: z
        .string()
        .min(1)
        .describe("Name of the React component whose hook state should be extracted."),
      responseMode: inspectionResponseModeSchema,
    },
    async ({ url, componentName, responseMode = "full" }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.getComponentState(url, componentName, responseMode as InspectionResponseMode);
        if ("error" in result) return err(result.error);
        return ok(result);
      } catch (e) {
        return err(`get_component_state failed unexpectedly: ${String(e)}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: get_render_counts
  // -------------------------------------------------------------------------
  server.tool(
    "get_render_counts",
    [
      "Return per-component render counters collected by the replay runtime monitor.",
      "Each entry includes the component name, path, render count, and first/last observation timestamps.",
    ].join(" "),
    {
      url: z
        .string()
        .url()
        .describe("URL of the page to inspect (e.g. http://localhost:5173)."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Maximum number of component counters to return. Default is 50."),
    },
    async ({ url, limit = 50 }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.getRenderCounts(url, limit);
        if ("error" in result) return err(result.error);
        return ok(result);
      } catch (e) {
        return err(`get_render_counts failed unexpectedly: ${String(e)}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: get_render_hotspots
  // -------------------------------------------------------------------------
  server.tool(
    "get_render_hotspots",
    [
      "List components that rendered too many times in a short window.",
      "Use the threshold and window to detect likely render explosions and get a probable-cause hint.",
    ].join(" "),
    {
      url: z
        .string()
        .url()
        .describe("URL of the page to inspect (e.g. http://localhost:5173)."),
      threshold: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Minimum render count inside the time window before a component is flagged. Default is 8."),
      windowMs: z
        .number()
        .int()
        .min(100)
        .max(30_000)
        .optional()
        .describe("Size of the sliding window used to detect rapid rerenders. Default is 1000ms."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum number of hotspots to return. Default is 20."),
    },
    async ({ url, threshold = 8, windowMs = 1000, limit = 20 }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.getRenderHotspots(url, threshold, windowMs, limit);
        if ("error" in result) return err(result.error);
        return ok(result);
      } catch (e) {
        return err(`get_render_hotspots failed unexpectedly: ${String(e)}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: get_hook_changes
  // -------------------------------------------------------------------------
  server.tool(
    "get_hook_changes",
    [
      "Return the chronological hook-value changes captured for one component across recent renders.",
      "Useful for spotting which hook value keeps changing in a render loop.",
    ].join(" "),
    {
      url: z
        .string()
        .url()
        .describe("URL of the page to inspect (e.g. http://localhost:5173)."),
      componentName: z
        .string()
        .min(1)
        .describe("Name of the component whose hook history should be inspected."),
      pathText: z
        .string()
        .min(1)
        .optional()
        .describe("Optional full component path when multiple instances share the same name."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Maximum number of hook change events to return. Default is 50."),
    },
    async ({ url, componentName, pathText, limit = 50 }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.getHookChanges(url, componentName, pathText, limit);
        if ("error" in result) return err(result.error);
        return ok(result);
      } catch (e) {
        return err(`get_hook_changes failed unexpectedly: ${String(e)}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: get_async_timeline
  // -------------------------------------------------------------------------
  server.tool(
    "get_async_timeline",
    [
      "Return an async timeline derived from the captured fetch/XHR lifecycle.",
      "Useful for spotting concurrent requests, slow operations, and completion order inversions.",
    ].join(" "),
    {
      url: z
        .string()
        .url()
        .describe("URL of the page to inspect (e.g. http://localhost:5173)."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Maximum number of recent requests to convert into async timeline events. Default is 50."),
    },
    async ({ url, limit = 50 }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.getAsyncTimeline(url, limit);
        if ("error" in result) return err(result.error);
        return ok(result);
      } catch (e) {
        return err(`get_async_timeline failed unexpectedly: ${String(e)}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: get_hydration_issues
  // -------------------------------------------------------------------------
  server.tool(
    "get_hydration_issues",
    [
      "Return normalized hydration-related warnings and exceptions captured from the runtime console.",
      "Each entry is tagged as hydration and classified to help separate SSR/client mismatch issues from other failures.",
    ].join(" "),
    {
      url: z
        .string()
        .url()
        .describe("URL of the page to inspect (e.g. http://localhost:5173/hydration-nextjs.html)."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Maximum number of hydration issues to return. Default is 50."),
    },
    async ({ url, limit = 50 }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.getHydrationIssues(url, limit);
        if ("error" in result) return err(result.error);
        return ok(result);
      } catch (e) {
        return err(`get_hydration_issues failed unexpectedly: ${String(e)}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: get_console_events
  // -------------------------------------------------------------------------
  server.tool(
    "get_console_events",
    [
      "Retrieve console events (logs, warnings, errors) and unhandled JavaScript",
      "exceptions that have occurred on the page since it was loaded.",
    ].join(" "),
    {
      url: z
        .string()
        .url()
        .describe("URL of the page to inspect (e.g. http://localhost:5173)."),
    },
    async ({ url }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.getConsoleEvents(url);
        if ("error" in result) return err(result.error);
        return ok(result);
      } catch (e) {
        return err(`get_console_events failed unexpectedly: ${String(e)}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: get_runtime_timeline
  // -------------------------------------------------------------------------
  server.tool(
    "get_runtime_timeline",
    [
      "Return a unified runtime timeline that merges console logs, exceptions,",
      "and network events into a single chronologically sorted stream.",
      "Useful for debugging the exact sequence of a bug.",
    ].join(" "),
    {
      url: z
        .string()
        .url()
        .describe("URL of the page to inspect (e.g. http://localhost:5173)."),
    },
    async ({ url }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.getRuntimeTimeline(url);
        if ("error" in result) return err(result.error);
        return ok(result);
      } catch (e) {
        return err(`get_runtime_timeline failed unexpectedly: ${String(e)}`);
      }
    }
  );
}
