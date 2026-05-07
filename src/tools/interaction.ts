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

  // -------------------------------------------------------------------------
  // Tool: validate_after_action — SCRUM-14
  // -------------------------------------------------------------------------
  server.tool(
    "validate_after_action",
    [
      "Performs an interaction followed by a validation assertion in a single flow.",
      "Useful for experimental validation: 'If I click this, does the error disappear?' or 'Does the text X appear?'.",
    ].join(" "),
    {
      url: z.string().url().describe("The URL of the page."),
      interaction: z.object({
        action: z.enum(["click", "type", "fill"]),
        selector: z.string(),
        value: z.string().optional(),
      }).describe("The interaction to perform."),
      assertion: z.object({
        type: z.enum(["text_present", "no_console_errors"]),
        expected: z.string().optional().describe("Expected text (for 'text_present')."),
      }).describe("The assertion to verify after the interaction."),
      waitMs: z.number().optional().default(500).describe("Time to wait (ms) between interaction and validation (default 500ms)."),
    },
    async ({ url, interaction, assertion, waitMs }): Promise<ToolResponse> => {
      try {
        // 1. Clear previous errors to only catch new ones during/after interaction
        browserManager.clearConsoleEvents();

        // 2. Interact
        const interactionResult = await browserManager.simulateInteraction(
          url,
          interaction.action,
          interaction.selector,
          interaction.value
        );

        if (!interactionResult.success) {
          return ok({
            interaction: interactionResult,
            validation: {
              pass: false,
              assertion,
              details: "Validation skipped because interaction failed.",
            },
          });
        }

        // 3. Wait for UI to settle
        await new Promise((resolve) => setTimeout(resolve, waitMs));

        // 4. Validate
        const validationResult = await browserManager.validate(url, assertion);

        return ok({
          interaction: interactionResult,
          validation: validationResult,
        });
      } catch (e) {
        return err(`validate_after_action failed unexpectedly: ${String(e)}`);
      }
    }
  );
}
