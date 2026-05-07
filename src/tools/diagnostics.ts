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
      "its full details, including props, path in the tree, and children count.",
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
    },
    async ({ url, componentName }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.inspectComponent(url, componentName);
        if ("error" in result) return err(result.error);
        return ok(result);
      } catch (e) {
        return err(`inspect_component failed unexpectedly: ${String(e)}`);
      }
    }
  );
}
