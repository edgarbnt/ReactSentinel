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

const replayStepSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("click"),
    selector: z.string().min(1),
    timeoutMs: z.number().int().min(1).max(60_000).optional(),
  }),
  z.object({
    action: z.literal("fill"),
    selector: z.string().min(1),
    value: z.string(),
    timeoutMs: z.number().int().min(1).max(60_000).optional(),
  }),
  z.object({
    action: z.literal("wait"),
    durationMs: z.number().int().min(1).max(60_000),
  }),
  z.object({
    action: z.literal("press"),
    key: z.string().min(1),
    selector: z.string().min(1).optional(),
    timeoutMs: z.number().int().min(1).max(60_000).optional(),
  }),
]);

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
      action: z.enum(["click", "type", "fill", "press"]).describe("The type of interaction to perform."),
      selector: z.string().describe("CSS selector of the element to interact with."),
      value: z.string().optional().describe("Value to type or fill (required for 'type' and 'fill' actions)."),
      key: z.string().optional().describe("Keyboard key to press (default: Enter for 'press')."),
    },
    async ({ url, action, selector, value, key }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.simulateInteraction(url, action, selector, value, key);
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
          action: z.enum(["click", "type", "fill", "press"]),
          selector: z.string(),
          value: z.string().optional(),
          key: z.string().optional(),
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
        const interactionResult = await browserManager.simulateInteraction(url, interaction.action, interaction.selector, interaction.value, interaction.key);

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

  // -------------------------------------------------------------------------
  // Tool: replay_interactions — SCRUM-104
  // -------------------------------------------------------------------------
  server.tool(
    "replay_interactions",
    [
      "Replay a deterministic sequence of browser actions inside the isolated replay session.",
      "Supports click, fill, wait, and press steps and logs the result of each step.",
      "Provide a URL to navigate before the replay, or omit it to reuse the current replay page.",
    ].join(" "),
    {
      url: z.string().url().optional().describe("Optional URL to open in the replay browser before the sequence runs."),
      steps: z.array(replayStepSchema).min(1).describe("Ordered replay steps to execute."),
      headless: z.boolean().optional().describe("Override the replay browser mode for this run."),
      waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional().default("domcontentloaded").describe("Navigation readiness event when url is provided."),
      timeoutMs: z.number().int().min(1).max(120_000).optional().default(10_000).describe("Navigation timeout in milliseconds when url is provided."),
      resetSession: z.boolean().optional().default(false).describe("Close the current replay browser first and start a fresh isolated session."),
      continueOnError: z.boolean().optional().default(false).describe("Keep executing later steps after a step failure."),
    },
    async ({ url, steps, headless, waitUntil, timeoutMs, resetSession, continueOnError }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.replayInteractions(steps, {
          url,
          headless,
          waitUntil,
          timeoutMs,
          resetSession,
          continueOnError,
        });
        if ("error" in result) return err(result.error);
        return ok(result);
      } catch (e) {
        return err(`replay_interactions failed unexpectedly: ${String(e)}`);
      }
    }
  );
}
