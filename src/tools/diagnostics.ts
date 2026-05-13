/**
 * tools/diagnostics.ts — SCRUM-28
 *
 * MCP tools for runtime diagnostics.
 * Rule: one file per tool group, export a register(server) function.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { browserManager } from "../browser/index.js";
import {
  createExcessRenderDiagnosis,
  createMemoBreakDiagnosis,
  createRenderAttributionDiagnosis,
  createRuntimeBugDiagnosis,
} from "../diagnostics/investigation.js";
import type { InspectionResponseMode } from "../diagnostics/protocol.js";
import {
  createAsyncTimelineVerdict,
  createHydrationIssuesVerdict,
  createRaceConditionVerdict,
  createRenderHotspotsVerdict,
} from "../diagnostics/verdict.js";
import { ok, err } from "../types.js";
import type { ToolResponse } from "../types.js";

const inspectionResponseModeSchema = z
  .enum(["full", "compact"])
  .default("full")
  .describe("Choose 'compact' to aggressively trim long inspection payloads for AI consumption.");

const hotspotThresholdSchema = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe("Minimum renders inside the observation window before a component is treated as suspicious. Default is 8.");

const hotspotWindowSchema = z
  .number()
  .int()
  .min(100)
  .max(30_000)
  .optional()
  .describe("Observation window in milliseconds used to detect rapid rerenders. Default is 1000ms.");

export const DIAGNOSTIC_TOOL_NAMES = [
  "get_runtime_status",
  "get_react_tree",
  "inspect_component",
  "get_component_state",
  "get_render_counts",
  "get_render_hotspots",
  "get_hook_changes",
  "get_async_timeline",
  "get_race_condition_diagnosis",
  "get_hydration_issues",
  "get_console_events",
  "get_runtime_timeline",
  "diagnose_excess_renders",
  "find_memo_breaks",
  "diagnose_runtime_bug",
  "attribute_render",
] as const;

export function register(server: McpServer): void {
  // -------------------------------------------------------------------------
  // Tool: get_runtime_status
  // -------------------------------------------------------------------------
  server.tool(
    "get_runtime_status",
    [
      "Navigate to a URL and return a full runtime diagnostic snapshot of what React-Sentinel can observe right now.",
      "Use this instead of reading source files when the first question is whether React is mounted, which page is actually loaded, and whether the runtime bridge is healthy.",
      "Returns page title, URL, viewport dimensions, timestamp, React detection, and a structured error if the URL is unreachable.",
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
      "Search the React Fiber tree for a specific component by name and extract its live runtime details.",
      "Use this instead of grep when the bug depends on the actual props, context wiring, or rendered position of a component in the current browser state.",
      "Returns props, path in the tree, provider or consumed contexts, children count, and a compact summary. Use responseMode='compact' when you want a shorter payload.",
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
      "Use this instead of guessing from hooks source when you need the live value that actually kept a button disabled, an effect armed, or a branch hidden.",
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
      "Use this instead of static code reading when you need proof that a component is actually rerendering far more often than expected in the reproduced browser flow.",
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
      "Diagnose likely rerender explosions and return a verdict-first summary with evidence, confidence, and next_step.",
      "Use this instead of grep when you need runtime proof that a render storm is happening and which component path is hottest.",
      "raw_data still contains the detailed hotspot list when deeper inspection is needed.",
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
        return ok(createRenderHotspotsVerdict(result));
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
  // Tool: get_race_condition_diagnosis
  // -------------------------------------------------------------------------
  server.tool(
    "get_race_condition_diagnosis",
    [
      "Diagnose whether a stale async response likely overwrote newer UI intent.",
      "Returns a verdict-first response with evidence, confidence, and next_step plus raw_data for the full trace.",
    ].join(" "),
    {
      url: z
        .string()
        .url()
        .describe("URL of the page to inspect (e.g. http://localhost:5173)."),
      stateSelector: z
        .string()
        .min(1)
        .describe("CSS selector pointing to the UI element that shows the final visible state."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Maximum number of recent requests to inspect. Default is 50."),
    },
    async ({ url, stateSelector, limit = 50 }): Promise<ToolResponse> => {
      try {
        const result = await browserManager.getRaceConditionDiagnosis(url, stateSelector, limit);
        if ("error" in result) return err(result.error);
        return ok(createRaceConditionVerdict(result));
      } catch (e) {
        return err(`get_race_condition_diagnosis failed unexpectedly: ${String(e)}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: get_async_timeline
  // -------------------------------------------------------------------------
  server.tool(
    "get_async_timeline",
    [
      "Diagnose async request ordering and latency patterns from captured fetch/XHR activity.",
      "Returns a verdict-first summary while preserving the full timeline in raw_data.",
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
        return ok(createAsyncTimelineVerdict(result));
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
      "Diagnose server/client hydration failures from runtime console signals and return a verdict-first summary.",
      "raw_data preserves the normalized hydration entries for detailed inspection.",
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
        return ok(createHydrationIssuesVerdict(result));
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

  server.tool(
    "diagnose_excess_renders",
    [
      "High-level render investigation for replay-mode React bugs.",
      "Use this instead of manually chaining atomic render tools when the question is 'why is this rerendering so much?' rather than 'show me raw counters'.",
      "Orchestrates runtime status, render counts, hotspots, hook changes, and component inspection to explain why a component rerenders too often.",
    ].join(" "),
    {
      url: z.string().url().describe("URL of the page to inspect."),
      componentName: z.string().min(1).optional().describe("Optional component to focus on. When omitted, React-Sentinel diagnoses the top hotspot."),
      threshold: hotspotThresholdSchema,
      windowMs: hotspotWindowSchema,
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of render counters and hotspots to inspect. Default is 20."),
    },
    async ({ url, componentName, threshold = 8, windowMs = 1000, limit = 20 }): Promise<ToolResponse> => {
      try {
        const startedAt = Date.now();
        const collectionStartedAt = Date.now();
        const [runtimeStatus, renderCounts, renderHotspots] = await Promise.all([
          browserManager.getRuntimeStatus(url),
          browserManager.getRenderCounts(url, limit),
          browserManager.getRenderHotspots(url, threshold, windowMs, limit),
        ]);
        const collectionMs = Date.now() - collectionStartedAt;
        if ("error" in runtimeStatus) return err(runtimeStatus.error);
        if ("error" in renderCounts) return err(renderCounts.error);
        if ("error" in renderHotspots) return err(renderHotspots.error);

        const target = componentName ?? renderHotspots.hotspots[0]?.componentName ?? undefined;
        const targetPathText =
          renderHotspots.hotspots.find((entry) => (target ? entry.componentName === target : false))?.pathText;
        const followUpStartedAt = Date.now();
        const [hookChanges, inspection] = target
          ? await Promise.all([
              browserManager.getHookChanges(url, target, targetPathText, 50),
              browserManager.inspectComponent(url, target, "compact"),
            ])
          : [undefined, undefined];
        const followUpMs = target ? Date.now() - followUpStartedAt : 0;

        if (hookChanges && "error" in hookChanges) return err(hookChanges.error);
        if (inspection && "error" in inspection) return err(inspection.error);

        const diagnosis = createExcessRenderDiagnosis({
          componentName,
          runtimeStatus,
          renderCounts,
          renderHotspots,
          ...(hookChanges ? { hookChanges } : {}),
          ...(inspection ? { inspection } : {}),
        });

        return ok({
          ...diagnosis,
          timing: {
            totalMs: Date.now() - startedAt,
            collectionMs,
            followUpMs,
          },
        });
      } catch (e) {
        return err(`diagnose_excess_renders failed unexpectedly: ${String(e)}`);
      }
    }
  );

  server.tool(
    "find_memo_breaks",
    [
      "High-level investigation that searches for likely React memo breaks or context cascades.",
      "Use this instead of grep when you need runtime evidence that unstable props or provider churn are breaking memoization in the reproduced flow.",
      "Combines render hotspots, hook churn, and component inspection so the caller gets a verdict instead of raw render data.",
    ].join(" "),
    {
      url: z.string().url().describe("URL of the page to inspect."),
      componentName: z.string().min(1).optional().describe("Optional component to inspect directly. When omitted, React-Sentinel picks the strongest hotspot candidate."),
      threshold: hotspotThresholdSchema,
      windowMs: hotspotWindowSchema,
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of hotspots to inspect. Default is 20."),
    },
    async ({ url, componentName, threshold = 8, windowMs = 1000, limit = 20 }): Promise<ToolResponse> => {
      try {
        const startedAt = Date.now();
        const hotspotStartedAt = Date.now();
        const renderHotspots = await browserManager.getRenderHotspots(url, threshold, windowMs, limit);
        const hotspotMs = Date.now() - hotspotStartedAt;
        if ("error" in renderHotspots) return err(renderHotspots.error);

        const target =
          componentName ??
          renderHotspots.hotspots.find((entry) => entry.probableCause.type === "prop_diff")?.componentName ??
          renderHotspots.hotspots[0]?.componentName ??
          undefined;
        const targetPathText =
          renderHotspots.hotspots.find((entry) => (target ? entry.componentName === target : false))?.pathText;
        const followUpStartedAt = Date.now();
        const [hookChanges, inspection] = target
          ? await Promise.all([
              browserManager.getHookChanges(url, target, targetPathText, 50),
              browserManager.inspectComponent(url, target, "compact"),
            ])
          : [undefined, undefined];
        const followUpMs = target ? Date.now() - followUpStartedAt : 0;

        if (hookChanges && "error" in hookChanges) return err(hookChanges.error);
        if (inspection && "error" in inspection) return err(inspection.error);

        const diagnosis = createMemoBreakDiagnosis({
          componentName,
          renderHotspots,
          ...(hookChanges ? { hookChanges } : {}),
          ...(inspection ? { inspection } : {}),
        });

        return ok({
          ...diagnosis,
          timing: {
            totalMs: Date.now() - startedAt,
            hotspotMs,
            followUpMs,
          },
        });
      } catch (e) {
        return err(`find_memo_breaks failed unexpectedly: ${String(e)}`);
      }
    }
  );

  server.tool(
    "attribute_render",
    [
      "Explain why a specific React component rendered by attributing the strongest runtime cause.",
      "Use this instead of static code inspection when you need the strongest live explanation for one render: props, state, context, provider, hooks, or parent churn.",
      "Uses render hotspots, hook churn, and component inspection to surface the strongest cause with evidence and next steps.",
    ].join(" "),
    {
      url: z.string().url().describe("URL of the page to inspect."),
      componentName: z.string().min(1).describe("React component name to attribute."),
      threshold: hotspotThresholdSchema,
      windowMs: hotspotWindowSchema,
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of hotspots to inspect. Default is 20."),
    },
    async ({ url, componentName, threshold = 8, windowMs = 1000, limit = 20 }): Promise<ToolResponse> => {
      try {
        const startedAt = Date.now();
        const hotspotStartedAt = Date.now();
        const renderHotspots = await browserManager.getRenderHotspots(url, threshold, windowMs, limit);
        const hotspotMs = Date.now() - hotspotStartedAt;
        if ("error" in renderHotspots) return err(renderHotspots.error);

        const targetPathText =
          renderHotspots.hotspots.find((entry) => entry.componentName === componentName || entry.pathText.split(" > ").includes(componentName))
            ?.pathText;
        if (!targetPathText) {
          const diagnosis = createRenderAttributionDiagnosis({
            componentName,
            renderHotspots,
          });

          return ok({
            ...diagnosis,
            timing: {
              totalMs: Date.now() - startedAt,
              hotspotMs,
              followUpMs: 0,
            },
          });
        }

        const followUpStartedAt = Date.now();
        const [hookChanges, inspection] = await Promise.all([
          browserManager.getHookChanges(url, componentName, targetPathText, 50),
          browserManager.inspectComponent(url, componentName, "compact"),
        ]);
        const followUpMs = Date.now() - followUpStartedAt;
        if ("error" in hookChanges) return err(hookChanges.error);
        if ("error" in inspection) return err(inspection.error);

        const diagnosis = createRenderAttributionDiagnosis({
          componentName,
          renderHotspots,
          hookChanges,
          inspection,
        });

        return ok({
          ...diagnosis,
          timing: {
            totalMs: Date.now() - startedAt,
            hotspotMs,
            followUpMs,
          },
        });
      } catch (e) {
        return err(`attribute_render failed unexpectedly: ${String(e)}`);
      }
    }
  );

  server.tool(
    "diagnose_runtime_bug",
    [
      "High-level entry point for vague runtime symptoms such as stale UI, random errors, hydration failures, or unexplained slowness.",
      "Use this instead of bouncing between grep, console logs, and ad-hoc probes when you need the fastest verdict-first answer for a browser bug.",
      "Orchestrates console, hydration, async, and render diagnostics and returns the strongest verdict first.",
    ].join(" "),
    {
      url: z.string().url().describe("URL of the page to inspect."),
      symptom: z.string().min(3).max(200).describe("Short natural-language description of the runtime symptom to bias the diagnosis."),
      stateSelector: z.string().min(1).optional().describe("Optional CSS selector that exposes the final visible state when race conditions are suspected."),
      threshold: hotspotThresholdSchema,
      windowMs: hotspotWindowSchema,
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of async and render events to inspect. Default is 20."),
    },
    async ({ url, symptom, stateSelector, threshold = 8, windowMs = 1000, limit = 20 }): Promise<ToolResponse> => {
      try {
        const startedAt = Date.now();
        const [runtimeStatus, consoleEvents, hydrationIssues, asyncTimeline, renderHotspots, raceCondition] = await Promise.all([
          browserManager.getRuntimeStatus(url),
          browserManager.getConsoleEvents(url),
          browserManager.getHydrationIssues(url, limit),
          browserManager.getAsyncTimeline(url, limit),
          browserManager.getRenderHotspots(url, threshold, windowMs, limit),
          stateSelector ? browserManager.getRaceConditionDiagnosis(url, stateSelector, limit) : Promise.resolve(undefined),
        ]);
        if ("error" in runtimeStatus) return err(runtimeStatus.error);
        if ("error" in consoleEvents) return err(consoleEvents.error);
        if ("error" in hydrationIssues) return err(hydrationIssues.error);
        if ("error" in asyncTimeline) return err(asyncTimeline.error);
        if ("error" in renderHotspots) return err(renderHotspots.error);
        if (raceCondition && "error" in raceCondition) return err(raceCondition.error);

        const diagnosis = createRuntimeBugDiagnosis({
          symptom,
          runtimeStatus,
          consoleEvents,
          hydrationIssues,
          asyncTimeline,
          renderHotspots,
          ...(raceCondition ? { raceCondition } : {}),
        });

        return ok({
          ...diagnosis,
          timing: {
            totalMs: Date.now() - startedAt,
          },
        });
      } catch (e) {
        return err(`diagnose_runtime_bug failed unexpectedly: ${String(e)}`);
      }
    }
  );
}
