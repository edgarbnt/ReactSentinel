import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { browserManager } from "../browser/index.js";
import type {
  Assertion,
  PatchedValidationScenarioResponse,
  RuntimePatch,
  RuntimePatchApplyResponse,
  RuntimePatchResetResponse,
} from "../browser/protocol.js";
import { ok, err } from "../types.js";
import type { ToolResponse } from "../types.js";
import { assertionSchema, buildScenarioMarkdown, replayStepSchema } from "./interaction.js";

const runtimePatchSchema = z.object({
  type: z.literal("script").describe("MVP patch type. Only arbitrary JavaScript runtime scripts are supported in sprint 9."),
  target: z.literal("page").describe("Patch target. Sprint 9 only supports the replay page main world."),
  source: z.string().min(1).max(20_000).describe("JavaScript source executed in the replay page. The script may optionally return a serializable preview value."),
  metadata: z.object({
    id: z.string().regex(/^[A-Za-z0-9._-]+$/).optional().describe("Optional stable patch identifier. Generated automatically when omitted."),
    label: z.string().min(1).max(120).optional().describe("Optional human-readable label shown in reports."),
    source: z.enum(["ai-generated", "manual", "test"]).describe("Who produced the patch payload."),
    expiresWithSession: z.literal(true).describe("Safety guard: runtime patches are always scoped to the current replay session."),
  }).describe("Security metadata for the ephemeral patch."),
});

const replayWaitUntilSchema = z
  .enum(["load", "domcontentloaded", "networkidle"])
  .default("domcontentloaded");

const resetStrategySchema = z.enum(["reload", "reset_session"]);

function buildPatchMarkdown(
  verdict: PatchedValidationScenarioResponse["verdict"],
  apply: RuntimePatchApplyResponse,
  report: PatchedValidationScenarioResponse["report"],
  cleanup?: RuntimePatchResetResponse
): string {
  const lines = [
    "# Patched Validation Report",
    "",
    `- Verdict: ${verdict}`,
    `- Patch: ${apply.patch.id} (${apply.patch.type} -> ${apply.patch.target})`,
    `- Session: replay #${apply.patch.sessionId}`,
    `- Transport: ${apply.transport}`,
    `- Scope: ${apply.patch.scope}`,
    "",
    "## Patch",
    `- Current document: ${apply.currentDocument.status}`,
    `- Label: ${apply.patch.label ?? "n/a"}`,
    `- Source: ${apply.patch.source}`,
    "",
    buildScenarioMarkdown(report),
  ];

  if (cleanup) {
    lines.push(
      "",
      "## Cleanup",
      `- Strategy: ${cleanup.strategy}`,
      `- Removed patches: ${cleanup.removedCount}`,
      `- Reopened URL: ${cleanup.reopenedUrl ?? "none"}`
    );
  }

  return lines.join("\n");
}

export function register(server: McpServer): void {
  server.tool(
    "apply_runtime_patch",
    [
      "Apply an ephemeral JavaScript patch inside the isolated replay sandbox without touching local files.",
      "Sprint 9 MVP supports only { type: 'script', target: 'page' } payloads and always scopes them to the current replay session.",
      "Provide a URL when the patch must be present before the application boots in the sandbox.",
    ].join(" "),
    {
      patch: runtimePatchSchema.describe("Runtime patch payload for the replay sandbox."),
      url: z.string().url().optional().describe("Optional URL to open in the replay browser after the init script is registered."),
      headless: z.boolean().optional().describe("Override the replay browser mode for this patch session."),
      waitUntil: replayWaitUntilSchema.describe("Navigation readiness event when url is provided."),
      timeoutMs: z.number().int().min(1).max(120_000).optional().default(10_000).describe("Navigation timeout in milliseconds when url is provided."),
      resetSession: z.boolean().optional().default(false).describe("Close the current replay sandbox first and start from a clean browser session."),
    },
    async ({ patch, url, headless, waitUntil, timeoutMs, resetSession }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.applyRuntimePatch(patch as RuntimePatch, {
          url,
          headless,
          waitUntil,
          timeoutMs,
          resetSession,
        });
        return "error" in result ? err(result.error) : ok(result);
      } catch (error) {
        return err(`apply_runtime_patch failed unexpectedly: ${String(error)}`);
      }
    }
  );

  server.tool(
    "apply_patch_then_replay",
    [
      "Apply an ephemeral replay patch, run replay steps, then evaluate assertions in the patched sandbox.",
      "Returns an explicit patch_validated / patch_failed verdict plus a readable Markdown report.",
      "Cleanup defaults to reset_session so temporary patches do not leak into later sandbox runs.",
    ].join(" "),
    {
      patch: runtimePatchSchema.describe("Runtime patch payload for the replay sandbox."),
      url: z.string().url().optional().describe("Optional URL to open in the replay browser after the init script is registered."),
      steps: z.array(replayStepSchema).min(1).describe("Ordered replay steps to execute after the patch is active."),
      assertions: z.array(assertionSchema).min(1).describe("Assertions to evaluate after the replayed actions."),
      headless: z.boolean().optional().describe("Override the replay browser mode for this scenario."),
      waitUntil: replayWaitUntilSchema.describe("Navigation readiness event when url is provided."),
      timeoutMs: z.number().int().min(1).max(120_000).optional().default(10_000).describe("Navigation timeout in milliseconds when url is provided."),
      resetSession: z.boolean().optional().default(false).describe("Close the current replay sandbox first and start from a clean browser session."),
      continueOnError: z.boolean().optional().default(false).describe("Keep executing later steps after a step failure."),
      waitMs: z.number().int().min(0).max(60_000).optional().default(500).describe("Wait time in milliseconds before running assertions."),
      cleanup: z.enum(["keep", "reload", "reset_session"]).optional().default("reset_session").describe("How to clean the replay sandbox after the patched validation flow."),
      reopenUrl: z.string().url().optional().describe("Optional clean URL to reopen after cleanup when using reload or reset_session."),
    },
    async ({
      patch,
      url,
      steps,
      assertions,
      headless,
      waitUntil,
      timeoutMs,
      resetSession,
      continueOnError,
      waitMs,
      cleanup,
      reopenUrl,
    }): Promise<ToolResponse> => {
      try {
        const applyResult = await browserManager.applyRuntimePatch(patch as RuntimePatch, {
          url,
          headless,
          waitUntil,
          timeoutMs,
          resetSession,
        });
        if ("error" in applyResult) return err(applyResult.error);

        const report = await browserManager.runValidationScenario(steps, assertions as Assertion[], {
          headless,
          continueOnError,
          waitMs,
        });
        if ("error" in report) {
          if (cleanup !== "keep") {
            await browserManager.resetRuntimePatches({
              strategy: cleanup as "reload" | "reset_session",
              waitUntil,
              timeoutMs,
              headless,
              reopenUrl,
            });
          }
          return err(report.error);
        }

        const response: PatchedValidationScenarioResponse = {
          verdict: report.success ? "patch_validated" : "patch_failed",
          apply: applyResult,
          report,
        };

        if (cleanup !== "keep") {
          const cleanupResult = await browserManager.resetRuntimePatches({
            strategy: cleanup as "reload" | "reset_session",
            waitUntil,
            timeoutMs,
            headless,
            reopenUrl,
          });
          if ("error" in cleanupResult) return err(cleanupResult.error);
          response.cleanup = cleanupResult;
        }

        return ok({
          ...response,
          reportMarkdown: buildPatchMarkdown(response.verdict, response.apply, response.report, response.cleanup),
        });
      } catch (error) {
        return err(`apply_patch_then_replay failed unexpectedly: ${String(error)}`);
      }
    }
  );

  server.tool(
    "reset_runtime_patches",
    [
      "Remove active runtime patches from the replay sandbox and return to a clean page or session.",
      "Use strategy='reload' when removable CDP init scripts were used, or strategy='reset_session' for the strongest cleanup guarantee.",
    ].join(" "),
    {
      strategy: resetStrategySchema.optional().default("reset_session").describe("Cleanup strategy for active runtime patches."),
      waitUntil: replayWaitUntilSchema.describe("Navigation readiness event when a clean page is reopened."),
      timeoutMs: z.number().int().min(1).max(120_000).optional().default(10_000).describe("Navigation timeout in milliseconds when a clean page is reopened."),
      headless: z.boolean().optional().describe("Override the replay browser mode when reopening a clean URL after session reset."),
      reopenUrl: z.string().url().optional().describe("Optional URL to reopen after cleanup."),
    },
    async ({ strategy, waitUntil, timeoutMs, headless, reopenUrl }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.resetRuntimePatches({
          strategy,
          waitUntil,
          timeoutMs,
          headless,
          reopenUrl,
        });
        return "error" in result ? err(result.error) : ok(result);
      } catch (error) {
        return err(`reset_runtime_patches failed unexpectedly: ${String(error)}`);
      }
    }
  );
}
