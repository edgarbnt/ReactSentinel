/**
 * tools/interaction.ts — SCRUM-13
 *
 * MCP tools for simulating user interactions with the browser.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { browserManager } from "../browser/index.js";
import type { Assertion, ReplayStep, ValidationScenarioResponse } from "../browser/protocol.js";
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
    action: z.literal("type"),
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

const interactionSchema = z.object({
  action: z.enum(["click", "type", "fill", "press"]),
  selector: z.string().min(1),
  value: z.string().optional(),
  key: z.string().optional(),
});

const assertionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text_present"),
    expected: z.string().min(1),
  }),
  z.object({
    type: z.literal("text_absent"),
    expected: z.string().min(1),
  }),
  z.object({
    type: z.literal("selector_visible"),
    selector: z.string().min(1),
  }),
  z.object({
    type: z.literal("selector_hidden"),
    selector: z.string().min(1),
  }),
  z.object({
    type: z.literal("component_present"),
    componentName: z.string().min(1),
  }),
  z.object({
    type: z.literal("component_prop_value"),
    componentName: z.string().min(1),
    propPath: z.string().min(1),
    expected: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  }),
  z.object({
    type: z.literal("component_state_value"),
    componentName: z.string().min(1),
    hookIndex: z.number().int().min(0).max(24),
    expected: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    valuePath: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal("no_console_errors"),
  }),
  z.object({
    type: z.literal("no_console_warnings"),
  }),
  z.object({
    type: z.literal("no_http_5xx"),
  }),
  z.object({
    type: z.literal("no_unexpected_http_requests"),
    allowedUrlSubstrings: z.array(z.string().min(1)).min(1),
  }),
]);

function toReplayStep(interaction: z.infer<typeof interactionSchema>): ReplayStep {
  if (interaction.action === "press") {
    return {
      action: "press",
      key: interaction.key || "Enter",
      selector: interaction.selector,
    };
  }

  if (interaction.action === "click") {
    return {
      action: "click",
      selector: interaction.selector,
    };
  }

  if (interaction.action === "type") {
    return {
      action: "type",
      selector: interaction.selector,
      value: interaction.value || "",
    };
  }

  return {
    action: "fill",
    selector: interaction.selector,
    value: interaction.value || "",
  };
}

function formatAssertion(assertion: Assertion): string {
  switch (assertion.type) {
    case "text_present":
      return `text_present "${assertion.expected}"`;
    case "text_absent":
      return `text_absent "${assertion.expected}"`;
    case "selector_visible":
      return `selector_visible ${assertion.selector}`;
    case "selector_hidden":
      return `selector_hidden ${assertion.selector}`;
    case "component_present":
      return `component_present ${assertion.componentName}`;
    case "component_prop_value":
      return `component_prop_value ${assertion.componentName}.${assertion.propPath} == ${JSON.stringify(assertion.expected)}`;
    case "component_state_value":
      return `component_state_value ${assertion.componentName}#${assertion.hookIndex}${assertion.valuePath ? `.${assertion.valuePath}` : ""} == ${JSON.stringify(assertion.expected)}`;
    case "no_console_errors":
      return "no_console_errors";
    case "no_console_warnings":
      return "no_console_warnings";
    case "no_http_5xx":
      return "no_http_5xx";
    case "no_unexpected_http_requests":
      return `no_unexpected_http_requests ${assertion.allowedUrlSubstrings.join(", ")}`;
  }
}

export function buildScenarioMarkdown(report: ValidationScenarioResponse): string {
  const lines: string[] = [
    "# Validation Report",
    "",
    `- URL: ${report.url}`,
    `- Result: ${report.success ? "PASS" : "FAIL"}`,
    `- Duration: ${report.durationMs}ms`,
    `- Actions: ${report.summary.actionCount} (${report.summary.actionFailures} failed)`,
    `- Assertions: ${report.summary.assertionCount} (${report.summary.assertionFailures} failed)`,
    "",
    "## Actions",
  ];

  for (const step of report.steps) {
    lines.push(
      `- [${step.success ? "PASS" : "FAIL"}] #${step.index} ${step.step.action} (${step.durationMs}ms)${step.error ? ` — ${step.error}` : ""}`
    );
  }

  lines.push("", "## Assertions");
  for (const result of report.assertions) {
    lines.push(
      `- [${result.pass ? "PASS" : "FAIL"}] ${formatAssertion(result.assertion)} — ${result.details ?? "No details"}`
    );
  }

  const consoleTraces = report.traces.console.filter(
    (event) => event.type === "warn" || event.type === "error" || event.type === "exception"
  );
  const networkTraces = report.traces.network.filter(
    (event) => event.isHttpError || Boolean(event.error)
  );

  lines.push("", "## Relevant Traces");
  if (consoleTraces.length === 0 && networkTraces.length === 0) {
    lines.push("- No warning/error traces captured.");
  } else {
    for (const event of consoleTraces) {
      lines.push(`- Console ${event.type}: ${event.text}`);
    }
    for (const event of networkTraces) {
      lines.push(`- Network ${event.method} ${event.url}${event.status === null ? "" : ` -> ${event.status}`}${event.error ? ` (${event.error})` : ""}`);
    }
  }

  return lines.join("\n");
}

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
      interaction: interactionSchema.describe("The interaction to perform."),
      assertion: assertionSchema.describe("The assertion to verify after the interaction."),
      waitMs: z.number().optional().default(500).describe("Time to wait (ms) between interaction and validation (default 500ms)."),
    },
    async ({ url, interaction, assertion, waitMs }): Promise<ToolResponse> => {
      try {
        const clearResult = await browserManager.clearRuntimeSignals(url);
        if ("error" in clearResult) return err(clearResult.error);

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

        await new Promise((resolve) => setTimeout(resolve, waitMs));
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
  // Tool: validate_scenario — SCRUM-170
  // -------------------------------------------------------------------------
  server.tool(
    "validate_scenario",
    [
      "Replay a deterministic action sequence and evaluate multiple assertions in one pass.",
      "Returns both a structured JSON report and a Markdown report with actions, assertions, and useful traces.",
    ].join(" "),
    {
      url: z.string().url().optional().describe("Optional URL to open in the replay browser before the scenario runs."),
      steps: z.array(replayStepSchema).min(1).describe("Ordered replay steps to execute before assertions."),
      assertions: z.array(assertionSchema).min(1).describe("Assertions to evaluate after the replayed actions."),
      headless: z.boolean().optional().describe("Override the replay browser mode for this scenario."),
      waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional().default("domcontentloaded").describe("Navigation readiness event when url is provided."),
      timeoutMs: z.number().int().min(1).max(120_000).optional().default(10_000).describe("Navigation timeout in milliseconds when url is provided."),
      resetSession: z.boolean().optional().default(false).describe("Close the current replay browser first and start a fresh isolated session."),
      continueOnError: z.boolean().optional().default(false).describe("Keep executing later steps after a step failure."),
      waitMs: z.number().int().min(0).max(60_000).optional().default(500).describe("Wait time in milliseconds before running assertions."),
    },
    async ({ url, steps, assertions, headless, waitUntil, timeoutMs, resetSession, continueOnError, waitMs }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.runValidationScenario(steps, assertions, {
          url,
          headless,
          waitUntil,
          timeoutMs,
          resetSession,
          continueOnError,
          waitMs,
        });
        if ("error" in result) return err(result.error);

        return ok({
          report: result,
          reportMarkdown: buildScenarioMarkdown(result),
        });
      } catch (e) {
        return err(`validate_scenario failed unexpectedly: ${String(e)}`);
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
      "Supports click, type, fill, wait, and press steps and logs the result of each step.",
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
