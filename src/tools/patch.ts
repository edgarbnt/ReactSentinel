import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { browserManager } from "../browser/index.js";
import type {
  Assertion,
  PatchedValidationScenarioResponse,
  ReplayStep,
  RuntimePatch,
  RuntimePatchApplyResponse,
  RuntimePatchResetResponse,
  ValidationResult,
  ValidationScenarioResponse,
} from "../browser/protocol.js";
import type { DiagnosticVerdict } from "../diagnostics/protocol.js";
import { ok, err } from "../types.js";
import type { ToolResponse } from "../types.js";
import { assertionSchema, buildScenarioMarkdown, replayStepSchema } from "./interaction.js";

const runtimePatchSchema = z.object({
  type: z.literal("script").describe("Patch type. Only arbitrary JavaScript runtime scripts are currently supported."),
  target: z.literal("page").describe("Patch target. Only the replay page main world is currently supported."),
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

type VerificationVerdict = "CONFIRMED" | "REFUTED" | "PARTIAL";

type HypothesisVerificationRawData = {
  hypothesis: string;
  report: ValidationScenarioResponse;
};

type FixVerificationRawData = {
  fix_description: string;
  baseline: ValidationScenarioResponse;
  patched: PatchedValidationScenarioResponse;
  regression_assertions: Assertion[];
};

function countAssertionFailures(results: ValidationResult[]): number {
  return results.filter((result) => !result.pass).length;
}

function buildHypothesisMarkdown(
  hypothesis: string,
  verdict: VerificationVerdict,
  report: ValidationScenarioResponse
): string {
  return [
    "# Hypothesis Verification Report",
    "",
    `- Hypothesis: ${hypothesis}`,
    `- Verdict: ${verdict}`,
    "",
    buildScenarioMarkdown(report),
  ].join("\n");
}

function buildFixVerificationMarkdown(
  fixDescription: string,
  verdict: VerificationVerdict,
  baseline: ValidationScenarioResponse,
  patched: PatchedValidationScenarioResponse,
  regressionAssertions: Assertion[]
): string {
  const lines = [
    "# Fix Verification Report",
    "",
    `- Fix: ${fixDescription}`,
    `- Verdict: ${verdict}`,
    `- Regression assertions: ${regressionAssertions.length}`,
    "",
    "## Baseline",
    buildScenarioMarkdown(baseline),
    "",
    "## Patched Run",
    buildPatchMarkdown(patched.verdict, patched.apply, patched.report, patched.cleanup),
  ];

  return lines.join("\n");
}

function createHypothesisVerdict(seed: {
  hypothesis: string;
  report: ValidationScenarioResponse;
}): DiagnosticVerdict<VerificationVerdict, HypothesisVerificationRawData> {
  const stepFailures = seed.report.steps.filter((step) => !step.success).length;
  const assertionFailures = countAssertionFailures(seed.report.assertions);
  const verdict: VerificationVerdict =
    stepFailures === 0 && assertionFailures === 0
      ? "CONFIRMED"
      : stepFailures === 0 && assertionFailures === seed.report.assertions.length
        ? "REFUTED"
        : "PARTIAL";

  return {
    verdict,
    summary:
      verdict === "CONFIRMED"
        ? `The runtime evidence confirms the hypothesis: ${seed.hypothesis}`
        : verdict === "REFUTED"
          ? `The runtime evidence does not support the hypothesis: ${seed.hypothesis}`
          : `The runtime evidence only partially supports the hypothesis: ${seed.hypothesis}`,
    evidence: [
      `Failed steps: ${stepFailures}`,
      `Failed assertions: ${assertionFailures}/${seed.report.assertions.length}`,
    ],
    confidence: verdict === "PARTIAL" ? "medium" : "high",
    next_step:
      verdict === "CONFIRMED"
        ? "Use the failing evidence to design or verify a targeted fix."
        : verdict === "REFUTED"
          ? "Refine the hypothesis or change the reproduction protocol before editing source code."
          : "Tighten the assertions or reproduction steps to make the result decisive.",
    raw_data: {
      hypothesis: seed.hypothesis,
      report: seed.report,
    },
  };
}

function createFixVerdict(seed: {
  fixDescription: string;
  baseline: ValidationScenarioResponse;
  patched: PatchedValidationScenarioResponse;
  regressionAssertions: Assertion[];
}): DiagnosticVerdict<VerificationVerdict, FixVerificationRawData> {
  const targetAssertionCount = Math.max(seed.baseline.assertions.length - seed.regressionAssertions.length, 0);
  const baselineTargetFailures = countAssertionFailures(seed.baseline.assertions.slice(0, targetAssertionCount));
  const patchedTargetFailures = countAssertionFailures(seed.patched.report.assertions.slice(0, targetAssertionCount));
  const regressionFailureCount = countAssertionFailures(seed.patched.report.assertions.slice(targetAssertionCount));
  const verdict: VerificationVerdict =
    baselineTargetFailures > 0 && patchedTargetFailures === 0 && regressionFailureCount === 0
      ? "CONFIRMED"
      : patchedTargetFailures >= baselineTargetFailures
        ? "REFUTED"
        : "PARTIAL";

  return {
    verdict,
    summary:
      verdict === "CONFIRMED"
        ? `The patch fixes the targeted runtime issue without visible regressions: ${seed.fixDescription}`
        : verdict === "REFUTED"
          ? `The patch does not resolve the target issue convincingly: ${seed.fixDescription}`
          : `The patch improves the target issue but leaves uncertainty or visible regressions: ${seed.fixDescription}`,
    evidence: [
      `Baseline target assertion failures: ${baselineTargetFailures}`,
      `Patched target assertion failures: ${patchedTargetFailures}`,
      `Patched regression failures: ${regressionFailureCount}`,
    ],
    confidence: verdict === "PARTIAL" ? "medium" : "high",
    next_step:
      verdict === "CONFIRMED"
        ? "Promote the runtime patch into a source change or validate it against a broader regression suite."
        : verdict === "REFUTED"
          ? "Revise the patch because the runtime assertions still fail or did not improve."
          : "Inspect the remaining failed assertions and regression signals before deciding whether to keep the patch.",
    raw_data: {
      fix_description: seed.fixDescription,
      baseline: seed.baseline,
      patched: seed.patched,
      regression_assertions: seed.regressionAssertions,
    },
  };
}

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

const patchValidationToolSchema = {
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
};

type PatchValidationToolArgs = {
  patch: RuntimePatch;
  url?: string;
  steps: ReplayStep[];
  assertions: Assertion[];
  headless?: boolean;
  waitUntil: "load" | "domcontentloaded" | "networkidle";
  timeoutMs: number;
  resetSession: boolean;
  continueOnError: boolean;
  waitMs: number;
  cleanup: "keep" | "reload" | "reset_session";
  reopenUrl?: string;
};

const hypothesisVerificationToolSchema = {
  hypothesis: z.string().min(3).max(500).describe("Hypothesis to validate against runtime behavior."),
  url: z.string().url().optional().describe("Optional URL to open in the replay browser before verification."),
  steps: z.array(replayStepSchema).min(1).describe("Replay protocol used to test the hypothesis."),
  assertions: z.array(assertionSchema).min(1).describe("Assertions that should hold if the hypothesis is correct."),
  headless: z.boolean().optional().describe("Override the replay browser mode for this verification."),
  waitUntil: replayWaitUntilSchema.describe("Navigation readiness event when url is provided."),
  timeoutMs: z.number().int().min(1).max(120_000).optional().default(10_000).describe("Navigation timeout in milliseconds when url is provided."),
  continueOnError: z.boolean().optional().default(false).describe("Keep executing later steps after a step failure."),
  waitMs: z.number().int().min(0).max(60_000).optional().default(500).describe("Wait time in milliseconds before running assertions."),
};

type HypothesisVerificationToolArgs = {
  hypothesis: string;
  url?: string;
  steps: ReplayStep[];
  assertions: Assertion[];
  headless?: boolean;
  waitUntil: "load" | "domcontentloaded" | "networkidle";
  timeoutMs: number;
  continueOnError: boolean;
  waitMs: number;
};

const fixVerificationToolSchema = {
  fixDescription: z.string().min(3).max(500).describe("Short description of the fix that the runtime patch is supposed to validate."),
  patch: runtimePatchSchema.describe("Runtime patch payload for the replay sandbox."),
  url: z.string().url().optional().describe("Optional URL to open in the replay browser before the scenario runs."),
  steps: z.array(replayStepSchema).min(1).describe("Ordered replay steps to execute before assertions."),
  assertions: z.array(assertionSchema).min(1).describe("Assertions that should pass after the fix is applied."),
  regressionAssertions: z.array(assertionSchema).optional().default([]).describe("Optional guard assertions that should remain true before and after the patch."),
  headless: z.boolean().optional().describe("Override the replay browser mode for this verification."),
  waitUntil: replayWaitUntilSchema.describe("Navigation readiness event when url is provided."),
  timeoutMs: z.number().int().min(1).max(120_000).optional().default(10_000).describe("Navigation timeout in milliseconds when url is provided."),
  continueOnError: z.boolean().optional().default(false).describe("Keep executing later steps after a step failure."),
  waitMs: z.number().int().min(0).max(60_000).optional().default(500).describe("Wait time in milliseconds before running assertions."),
  cleanup: z.enum(["keep", "reload", "reset_session"]).optional().default("reset_session").describe("How to clean the replay sandbox after patch verification."),
  reopenUrl: z.string().url().optional().describe("Optional clean URL to reopen after cleanup when using reload or reset_session."),
};

type FixVerificationToolArgs = {
  fixDescription: string;
  patch: RuntimePatch;
  url?: string;
  steps: ReplayStep[];
  assertions: Assertion[];
  regressionAssertions: Assertion[];
  headless?: boolean;
  waitUntil: "load" | "domcontentloaded" | "networkidle";
  timeoutMs: number;
  continueOnError: boolean;
  waitMs: number;
  cleanup: "keep" | "reload" | "reset_session";
  reopenUrl?: string;
};

async function runPatchValidationTool(args: PatchValidationToolArgs, toolName: string): Promise<ToolResponse> {
  const { patch, url, steps, assertions, headless, waitUntil, timeoutMs, resetSession, continueOnError, waitMs, cleanup, reopenUrl } = args;
  try {
    const applyResult = await browserManager.applyRuntimePatch(patch, {
      url,
      headless,
      waitUntil,
      timeoutMs,
      resetSession,
    });
    if ("error" in applyResult) return err(applyResult.error);

    const report = await browserManager.runValidationScenario(steps, assertions, {
      headless,
      continueOnError,
      waitMs,
    });
    if ("error" in report) {
      if (cleanup !== "keep") {
        const cleanupResult = await browserManager.resetRuntimePatches({
          strategy: cleanup,
          waitUntil,
          timeoutMs,
          headless,
          reopenUrl,
        });
        if ("error" in cleanupResult) {
          return err(
            `${report.error} Cleanup after validation failure also failed: ${cleanupResult.error}. Runtime patches may still be active.`
          );
        }
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
        strategy: cleanup,
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
    return err(`${toolName} failed unexpectedly: ${String(error)}`);
  }
}

async function runHypothesisVerificationTool(
  args: HypothesisVerificationToolArgs,
  toolName: string
): Promise<ToolResponse> {
  const { hypothesis, url, steps, assertions, headless, waitUntil, timeoutMs, continueOnError, waitMs } = args;
  try {
    const report = await browserManager.runValidationScenario(steps, assertions, {
      url,
      headless,
      waitUntil,
      timeoutMs,
      resetSession: true,
      continueOnError,
      waitMs,
    });
    if ("error" in report) return err(report.error);

    const response = createHypothesisVerdict({
      hypothesis,
      report,
    });

    return ok({
      ...response,
      reportMarkdown: buildHypothesisMarkdown(hypothesis, response.verdict, report),
    });
  } catch (error) {
    return err(`${toolName} failed unexpectedly: ${String(error)}`);
  }
}

async function runFixVerificationTool(args: FixVerificationToolArgs, toolName: string): Promise<ToolResponse> {
  const { fixDescription, patch, url, steps, assertions, regressionAssertions, headless, waitUntil, timeoutMs, continueOnError, waitMs, cleanup, reopenUrl } = args;
  try {
    const combinedAssertions = [...assertions, ...regressionAssertions];
    const baseline = await browserManager.runValidationScenario(steps, combinedAssertions, {
      url,
      headless,
      waitUntil,
      timeoutMs,
      resetSession: true,
      continueOnError,
      waitMs,
    });
    if ("error" in baseline) return err(baseline.error);

    const applyResult = await browserManager.applyRuntimePatch(patch, {
      url,
      headless,
      waitUntil,
      timeoutMs,
      resetSession: true,
    });
    if ("error" in applyResult) return err(applyResult.error);

    const patchedReport = await browserManager.runValidationScenario(steps, combinedAssertions, {
      headless,
      continueOnError,
      waitMs,
    });
    if ("error" in patchedReport) {
      if (cleanup !== "keep") {
        const cleanupResult = await browserManager.resetRuntimePatches({
          strategy: cleanup,
          waitUntil,
          timeoutMs,
          headless,
          reopenUrl,
        });
        if ("error" in cleanupResult) {
          return err(`${patchedReport.error} Cleanup after patch verification also failed: ${cleanupResult.error}.`);
        }
      }
      return err(patchedReport.error);
    }

    const patched: PatchedValidationScenarioResponse = {
      verdict: patchedReport.success ? "patch_validated" : "patch_failed",
      apply: applyResult,
      report: patchedReport,
    };

    if (cleanup !== "keep") {
      const cleanupResult = await browserManager.resetRuntimePatches({
        strategy: cleanup,
        waitUntil,
        timeoutMs,
        headless,
        reopenUrl,
      });
      if ("error" in cleanupResult) return err(cleanupResult.error);
      patched.cleanup = cleanupResult;
    }

    const response = createFixVerdict({
      fixDescription,
      baseline,
      patched,
      regressionAssertions,
    });

    return ok({
      ...response,
      reportMarkdown: buildFixVerificationMarkdown(fixDescription, response.verdict, baseline, patched, regressionAssertions),
    });
  } catch (error) {
    return err(`${toolName} failed unexpectedly: ${String(error)}`);
  }
}

export const PATCH_TOOL_NAMES = [
  "apply_runtime_patch",
  "apply_patch_then_replay",
  "patch_and_validate",
  "reset_runtime_patches",
  "verify_hypothesis",
  "test_runtime_hypothesis",
  "verify_fix",
  "verify_runtime_fix",
] as const;

export function register(server: McpServer): void {
  server.tool(
    "apply_runtime_patch",
    [
      "Apply an ephemeral JavaScript patch inside the isolated replay sandbox without touching local files.",
      "Use this instead of editing the repository when you want to test a runtime idea safely before committing to a source change.",
      "Only { type: 'script', target: 'page' } payloads are currently supported and always scoped to the current replay session.",
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
      "Use this instead of editing files blindly when you want one tool to patch, reproduce, and judge whether the runtime behavior improved.",
      "Returns an explicit patch_validated / patch_failed verdict plus a readable Markdown report, and cleanup defaults to reset_session so temporary patches do not leak into later runs.",
    ].join(" "),
    patchValidationToolSchema,
    async (args): Promise<ToolResponse> => runPatchValidationTool(args as PatchValidationToolArgs, "apply_patch_then_replay")
  );

  server.tool(
    "patch_and_validate",
    [
      "Action-oriented alias for apply_patch_then_replay that tests a runtime patch against a concrete replay protocol.",
      "Prefer this when the agent is thinking 'try this patch and tell me if the bug is gone'.",
    ].join(" "),
    patchValidationToolSchema,
    async (args): Promise<ToolResponse> => runPatchValidationTool(args as PatchValidationToolArgs, "patch_and_validate")
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

  server.tool(
    "verify_hypothesis",
    [
      "Verify a runtime hypothesis before changing repository code.",
      "Use this instead of arguing from source code alone when you need browser evidence that a suspected runtime cause is true, false, or only partly supported.",
      "Runs a replay protocol plus assertions and returns CONFIRMED, REFUTED, or PARTIAL with evidence and a Markdown report.",
    ].join(" "),
    hypothesisVerificationToolSchema,
    async (args): Promise<ToolResponse> => runHypothesisVerificationTool(args as HypothesisVerificationToolArgs, "verify_hypothesis")
  );

  server.tool(
    "test_runtime_hypothesis",
    [
      "Action-oriented alias for verify_hypothesis that tests whether a suspected runtime explanation matches observed browser behavior.",
      "Prefer this when the agent is phrasing the task as 'test this hypothesis in the browser'.",
    ].join(" "),
    hypothesisVerificationToolSchema,
    async (args): Promise<ToolResponse> => runHypothesisVerificationTool(args as HypothesisVerificationToolArgs, "test_runtime_hypothesis")
  );

  server.tool(
    "verify_fix",
    [
      "Validate a runtime patch against a failing scenario before editing source files.",
      "Use this instead of making a speculative code change when you want proof that a candidate fix improves the browser behavior and does not obviously regress other assertions.",
      "Runs a baseline scenario, applies the patch in the replay sandbox, reruns the scenario, checks optional regression assertions, and returns CONFIRMED, REFUTED, or PARTIAL.",
    ].join(" "),
    fixVerificationToolSchema,
    async (args): Promise<ToolResponse> => runFixVerificationTool(args as FixVerificationToolArgs, "verify_fix")
  );

  server.tool(
    "verify_runtime_fix",
    [
      "Action-oriented alias for verify_fix that checks whether a candidate runtime fix actually resolves the bug.",
      "Prefer this when the agent is phrasing the task as 'verify the fix before touching source'.",
    ].join(" "),
    fixVerificationToolSchema,
    async (args): Promise<ToolResponse> => runFixVerificationTool(args as FixVerificationToolArgs, "verify_runtime_fix")
  );
}
