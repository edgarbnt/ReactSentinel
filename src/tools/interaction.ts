/**
 * tools/interaction.ts — SCRUM-13
 *
 * MCP tools for simulating user interactions with the browser.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { browserManager } from "../browser/index.js";
import { ok, err } from "../types.js";
import type { ToolResponse } from "../types.js";

export function register(server: McpServer): void {
  // -------------------------------------------------------------------------
  // Tool: simulate_interaction
  // -------------------------------------------------------------------------
  server.tool(
    "simulate_interaction",
    [
      "Simulates a user interaction (click, type, or fill) on the target page.",
      "Useful for reproducing bugs or exploring the application state after interaction.",
      "Requires a valid CSS selector and target URL.",
    ].join(" "),
    {
      url: z.string().url().describe("The URL of the page where the interaction should happen."),
      action: z.enum(["click", "type", "fill"]).describe("The type of interaction to perform."),
      selector: z.string().describe("CSS selector of the element to interact with."),
      value: z.string().optional().describe("Value to type or fill (required for 'type' and 'fill' actions)."),
    },
    async ({ url, action, selector, value }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.simulateInteraction(url, action, selector, value);
        return result.success ? ok(result) : err(result.error || "Interaction failed");
      } catch (e) {
        return err(`simulate_interaction failed unexpectedly: ${String(e)}`);
      }
    }
  );
}
