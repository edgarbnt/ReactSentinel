import type {
  AsyncTimelineResponse,
  ComponentInspectionResponse,
  ConsoleEventsResponse,
  DiagnosticVerdict,
  HookChangesResponse,
  HydrationIssuesResponse,
  RaceConditionDiagnosisResponse,
  RenderCountsResponse,
  RenderHotspotsResponse,
  RuntimeStatus,
} from "./protocol.js";

type ExcessRenderVerdict =
  | "render_loop_detected"
  | "memo_break_suspected"
  | "context_cascade_suspected"
  | "hook_instability_detected"
  | "no_excess_renders_detected"
  | "excess_renders_inconclusive";

type ExcessRenderRawData = {
  runtime_status: RuntimeStatus;
  render_counts: RenderCountsResponse;
  render_hotspots: RenderHotspotsResponse;
  hook_changes?: HookChangesResponse;
  component_inspection?: ComponentInspectionResponse;
};

type MemoBreakVerdict =
  | "memo_break_suspected"
  | "context_cascade_suspected"
  | "internal_state_instability_detected"
  | "memo_break_not_detected"
  | "memo_break_inconclusive";

type MemoBreakRawData = {
  render_hotspots: RenderHotspotsResponse;
  hook_changes?: HookChangesResponse;
  component_inspection?: ComponentInspectionResponse;
};

type RuntimeBugVerdict =
  | "hydration_failure_detected"
  | "race_condition_detected"
  | "render_instability_detected"
  | "runtime_error_detected"
  | "runtime_bug_inconclusive";

type RuntimeBugRawData = {
  runtime_status: RuntimeStatus;
  console_events: ConsoleEventsResponse;
  hydration_issues: HydrationIssuesResponse;
  async_timeline: AsyncTimelineResponse;
  race_condition?: RaceConditionDiagnosisResponse;
  render_hotspots: RenderHotspotsResponse;
};

function matchesComponent(componentName: string, candidateName: string, pathText: string): boolean {
  return candidateName === componentName || pathText.split(" > ").includes(componentName);
}

function buildContextEvidence(component?: ComponentInspectionResponse): string[] {
  const contexts = component?.component?.contexts ?? [];
  if (contexts.length === 0) {
    return [];
  }

  return [
    `Observed contexts/providers: ${contexts.map((context) => `${context.name} (${context.source})`).join(", ")}`,
  ];
}

function createDiagnosis<TVerdict extends string, TRawData>(seed: {
  verdict: TVerdict;
  summary: string;
  evidence: string[];
  confidence: "low" | "medium" | "high";
  suspected_source?: string;
  next_step?: string;
  raw_data: TRawData;
}): DiagnosticVerdict<TVerdict, TRawData> {
  return seed;
}

export function createExcessRenderDiagnosis(seed: {
  componentName?: string;
  runtimeStatus: RuntimeStatus;
  renderCounts: RenderCountsResponse;
  renderHotspots: RenderHotspotsResponse;
  hookChanges?: HookChangesResponse;
  inspection?: ComponentInspectionResponse;
}): DiagnosticVerdict<ExcessRenderVerdict, ExcessRenderRawData> {
  const hotspot =
    seed.componentName
      ? seed.renderHotspots.hotspots.find((entry) => matchesComponent(seed.componentName ?? "", entry.componentName, entry.pathText)) ?? null
      : seed.renderHotspots.hotspots[0] ?? null;

  const raw_data: ExcessRenderRawData = {
    runtime_status: seed.runtimeStatus,
    render_counts: seed.renderCounts,
    render_hotspots: seed.renderHotspots,
    ...(seed.hookChanges ? { hook_changes: seed.hookChanges } : {}),
    ...(seed.inspection ? { component_inspection: seed.inspection } : {}),
  };

  if (!hotspot) {
    return createDiagnosis({
      verdict: "no_excess_renders_detected",
      summary: "No component currently shows a strong excess-render signature in the replay monitor.",
      evidence: [
        `Observed components: ${seed.renderCounts.summary.totalComponents}`,
        `Observed commits: ${seed.renderCounts.summary.observedCommits}`,
        `Detected hotspots: ${seed.renderHotspots.hotspots.length}`,
      ],
      confidence: seed.renderCounts.summary.observedCommits >= 1 ? "medium" : "low",
      next_step: "Replay the failing scenario again or lower the hotspot threshold if the render spike is intermittent.",
      raw_data,
    });
  }

  const hookLead = seed.hookChanges?.summary.suspiciousHooks[0] ?? null;
  const contexts = seed.inspection?.component?.contexts ?? [];
  const hotspotEvidence = [
    `Top hotspot: ${hotspot.pathText} (${hotspot.recentRenderCount} renders in ${hotspot.windowMs}ms)`,
    `Probable cause from render monitor: ${hotspot.probableCause.summary}`,
    ...(seed.hookChanges ? [`Hook-change summary: ${seed.hookChanges.summary.probableCause}`] : []),
    ...buildContextEvidence(seed.inspection),
  ];

  if (hotspot.probableCause.type === "unstable_props") {
    if (contexts.length > 0) {
      return createDiagnosis({
        verdict: "context_cascade_suspected",
        summary: `${hotspot.componentName} rerenders look driven by upstream context/provider churn rather than a local render loop.`,
        evidence: hotspotEvidence,
        confidence: "medium",
        suspected_source: contexts[0]?.name,
        next_step: "Inspect the nearest provider value and memoize or narrow the context payload if it is recreated every render.",
        raw_data,
      });
    }

    return createDiagnosis({
      verdict: "memo_break_suspected",
      summary: `${hotspot.componentName} is rerendering with unstable props, which strongly suggests a memo break upstream.`,
      evidence: hotspotEvidence,
      confidence: "high",
      suspected_source: hotspot.pathText,
      next_step: "Inspect the parent props feeding this component and memoize recreated objects, arrays, or callbacks.",
      raw_data,
    });
  }

  if (hotspot.probableCause.type === "unstable_state") {
    return createDiagnosis({
      verdict: "render_loop_detected",
      summary: `${hotspot.componentName} appears stuck in a state-driven render loop.`,
      evidence: hotspotEvidence,
      confidence: "high",
      suspected_source: hookLead ? `state hook #${hookLead.hookIndex}` : hotspot.pathText,
      next_step: "Inspect the state update path or effect dependencies that keep feeding this component new state.",
      raw_data,
    });
  }

  if (hotspot.probableCause.type === "unstable_hook_value") {
    return createDiagnosis({
      verdict: "hook_instability_detected",
      summary: `${hotspot.componentName} is rerendering because one hook value keeps changing across renders.`,
      evidence: hotspotEvidence,
      confidence: hookLead?.suspected ? "high" : "medium",
      suspected_source: hookLead ? `hook #${hookLead.hookIndex}` : hotspot.pathText,
      next_step: "Inspect the unstable hook output and memoize or debounce the value that changes every render.",
      raw_data,
    });
  }

  return createDiagnosis({
    verdict: "excess_renders_inconclusive",
    summary: `${hotspot.componentName} clearly rerenders too often, but the dominant cause is still inconclusive.`,
    evidence: hotspotEvidence,
    confidence: "medium",
    suspected_source: hotspot.pathText,
    next_step: "Inspect the component tree around this hotspot and compare prop, context, and effect churn together.",
    raw_data,
  });
}

export function createMemoBreakDiagnosis(seed: {
  componentName?: string;
  renderHotspots: RenderHotspotsResponse;
  hookChanges?: HookChangesResponse;
  inspection?: ComponentInspectionResponse;
}): DiagnosticVerdict<MemoBreakVerdict, MemoBreakRawData> {
  const hotspotCandidates = seed.renderHotspots.hotspots.filter((entry) =>
    seed.componentName ? matchesComponent(seed.componentName, entry.componentName, entry.pathText) : true
  );
  const target =
    hotspotCandidates.find((entry) => entry.probableCause.type === "unstable_props") ??
    hotspotCandidates[0] ??
    null;
  const contexts = seed.inspection?.component?.contexts ?? [];
  const raw_data: MemoBreakRawData = {
    render_hotspots: seed.renderHotspots,
    ...(seed.hookChanges ? { hook_changes: seed.hookChanges } : {}),
    ...(seed.inspection ? { component_inspection: seed.inspection } : {}),
  };

  if (!target) {
    return createDiagnosis({
      verdict: "memo_break_not_detected",
      summary: "No strong memo-break signal was found in the current render hotspot set.",
      evidence: [`Detected hotspots: ${seed.renderHotspots.hotspots.length}`],
      confidence: "medium",
      next_step: "Reproduce the issue under replay and target a specific component if the rerender suspect is already known.",
      raw_data,
    });
  }

  const evidence = [
    `Candidate component: ${target.pathText}`,
    `Render monitor cause: ${target.probableCause.summary}`,
    ...(seed.hookChanges ? [`Hook-change summary: ${seed.hookChanges.summary.probableCause}`] : []),
    ...buildContextEvidence(seed.inspection),
  ];

  if (target.probableCause.type === "unstable_props" && contexts.length === 0) {
    return createDiagnosis({
      verdict: "memo_break_suspected",
      summary: `${target.componentName} rerenders with changing props and no dominant local hook churn, which is consistent with a memo break.`,
      evidence,
      confidence: "high",
      suspected_source: target.pathText,
      next_step: "Inspect the parent render path and stabilize recreated prop references passed into this component.",
      raw_data,
    });
  }

  if (contexts.length > 0) {
    return createDiagnosis({
      verdict: "context_cascade_suspected",
      summary: `${target.componentName} looks more affected by context/provider churn than by a classic memo break.`,
      evidence,
      confidence: "medium",
      suspected_source: contexts[0]?.name,
      next_step: "Inspect the provider value identity and split or memoize the context if consumers rerender too broadly.",
      raw_data,
    });
  }

  if ((seed.hookChanges?.summary.suspiciousHooks[0]?.suspected ?? false) || target.probableCause.type === "unstable_state") {
    return createDiagnosis({
      verdict: "internal_state_instability_detected",
      summary: `${target.componentName} is rerendering because its own hook or state values keep changing, so the issue is not primarily a memo break.`,
      evidence,
      confidence: "medium",
      suspected_source: target.pathText,
      next_step: "Inspect the unstable hook or effect before optimizing parent memoization.",
      raw_data,
    });
  }

  return createDiagnosis({
    verdict: "memo_break_inconclusive",
    summary: `${target.componentName} remains a memo-break candidate, but the current runtime signals are not decisive.`,
    evidence,
    confidence: "medium",
    suspected_source: target.pathText,
    next_step: "Collect a longer replay trace or inspect the component's parent chain to confirm whether prop identity churn is real.",
    raw_data,
  });
}

export function createRuntimeBugDiagnosis(seed: {
  symptom: string;
  runtimeStatus: RuntimeStatus;
  consoleEvents: ConsoleEventsResponse;
  hydrationIssues: HydrationIssuesResponse;
  asyncTimeline: AsyncTimelineResponse;
  renderHotspots: RenderHotspotsResponse;
  raceCondition?: RaceConditionDiagnosisResponse;
}): DiagnosticVerdict<RuntimeBugVerdict, RuntimeBugRawData> {
  const symptom = seed.symptom.toLowerCase();
  const firstError = seed.consoleEvents.events.find((event) => event.type === "error" || event.type === "exception") ?? null;
  const firstHotspot = seed.renderHotspots.hotspots[0] ?? null;
  const raw_data: RuntimeBugRawData = {
    runtime_status: seed.runtimeStatus,
    console_events: seed.consoleEvents,
    hydration_issues: seed.hydrationIssues,
    async_timeline: seed.asyncTimeline,
    ...(seed.raceCondition ? { race_condition: seed.raceCondition } : {}),
    render_hotspots: seed.renderHotspots,
  };

  if (seed.hydrationIssues.summary.total > 0 && (/hydr|ssr|server/.test(symptom) || firstError !== null)) {
    const firstIssue = seed.hydrationIssues.issues[0];
    return createDiagnosis({
      verdict: "hydration_failure_detected",
      summary: `The strongest runtime signal points to hydration failure: ${firstIssue?.message ?? "hydration warnings were captured"}.`,
      evidence: [
        `Hydration issues captured: ${seed.hydrationIssues.summary.total}`,
        ...(firstError ? [`Console error: ${firstError.text}`] : []),
      ],
      confidence: "high",
      suspected_source: firstIssue ? `${firstIssue.framework}:${firstIssue.kind}` : "hydration",
      next_step: "Compare server-rendered and client-rendered inputs on the first load to isolate the mismatch source.",
      raw_data,
    });
  }

  if (seed.raceCondition?.suspected || seed.asyncTimeline.summary.invertedGroups.length > 0) {
    return createDiagnosis({
      verdict: "race_condition_detected",
      summary: seed.raceCondition?.diagnosis ?? `Async requests for ${seed.asyncTimeline.summary.invertedGroups[0]?.groupKey ?? "one group"} completed out of order.`,
      evidence: [
        ...(seed.raceCondition?.evidence ?? []),
        `Completion-order inversions: ${seed.asyncTimeline.summary.invertedGroups.length}`,
      ],
      confidence: seed.raceCondition?.suspected ? "high" : "medium",
      suspected_source:
        seed.raceCondition?.invertedGroup?.groupKey ?? seed.asyncTimeline.summary.invertedGroups[0]?.groupKey,
      next_step: "Verify that only the latest async intent can update visible state and guard stale completions.",
      raw_data,
    });
  }

  if (firstHotspot && (/render|rerender|freeze|slow|loop/.test(symptom) || seed.renderHotspots.hotspots.length > 0)) {
    return createDiagnosis({
      verdict: "render_instability_detected",
      summary: `${firstHotspot.componentName} is the clearest runtime suspect because it rerendered ${firstHotspot.recentRenderCount} times in ${firstHotspot.windowMs}ms.`,
      evidence: [
        `Top hotspot: ${firstHotspot.pathText}`,
        `Probable cause: ${firstHotspot.probableCause.summary}`,
      ],
      confidence: "medium",
      suspected_source: firstHotspot.pathText,
      next_step: "Run the excess-render investigation on this component to determine whether props, hooks, or context are responsible.",
      raw_data,
    });
  }

  if (firstError) {
    return createDiagnosis({
      verdict: "runtime_error_detected",
      summary: `The strongest runtime signal is a console-level failure: ${firstError.text}`,
      evidence: [
        `Console events captured: ${seed.consoleEvents.events.length}`,
        firstError.location ? `Location: ${firstError.location}` : "No source location was attached to the error.",
      ],
      confidence: "medium",
      suspected_source: firstError.location,
      next_step: "Inspect the failing runtime path and reproduce the same error under replay or patch validation.",
      raw_data,
    });
  }

  return createDiagnosis({
    verdict: "runtime_bug_inconclusive",
    summary: `React-Sentinel captured runtime signals for "${seed.symptom}" but none stand out strongly enough to explain the bug yet.`,
    evidence: [
      `Hydration issues: ${seed.hydrationIssues.summary.total}`,
      `Async inversions: ${seed.asyncTimeline.summary.invertedGroups.length}`,
      `Render hotspots: ${seed.renderHotspots.hotspots.length}`,
      `Console errors: ${seed.consoleEvents.events.filter((event) => event.type === "error" || event.type === "exception").length}`,
    ],
    confidence: "low",
    next_step: "Refine the symptom with a target component or state selector and replay the failure again to gather stronger evidence.",
    raw_data,
  });
}
