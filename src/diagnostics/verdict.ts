import type {
  AsyncTimelineResponse,
  DiagnosticConfidence,
  DiagnosticVerdict,
  HydrationIssuesResponse,
  RaceConditionDiagnosisResponse,
  RenderHotspotsResponse,
} from "./protocol.js";

function createVerdict<TRawData, TVerdict extends string>(seed: {
  verdict: TVerdict;
  summary: string;
  evidence: string[];
  confidence: DiagnosticConfidence;
  suspected_source?: string;
  next_step?: string;
  raw_data: TRawData;
}): DiagnosticVerdict<TVerdict, TRawData> {
  return seed;
}

function formatSlowRequest(label: string, durationMs: number, status: number | null): string {
  return `${label} took ${durationMs}ms${status === null ? "" : ` (status ${status})`}.`;
}

export function createRenderHotspotsVerdict(
  payload: RenderHotspotsResponse
): DiagnosticVerdict<"render_hotspots_detected" | "no_hotspots_detected", RenderHotspotsResponse> {
  const primaryHotspot = payload.hotspots[0] ?? null;

  if (!primaryHotspot) {
    return createVerdict({
      verdict: "no_hotspots_detected",
      summary: `No component crossed ${payload.threshold} renders within ${payload.windowMs}ms in the recent replay window.`,
      evidence: [
        `Observed hotspots: 0`,
        `Detection threshold: ${payload.threshold} renders/${payload.windowMs}ms`,
      ],
      confidence: "medium",
      next_step: "If the bug is intermittent, replay the scenario again or lower the hotspot threshold.",
      raw_data: payload,
    });
  }

  return createVerdict({
    verdict: "render_hotspots_detected",
    summary: `${primaryHotspot.componentName} is the top rerender hotspot with ${primaryHotspot.recentRenderCount} renders in ${primaryHotspot.windowMs}ms.`,
    evidence: [
      `Top hotspot: ${primaryHotspot.pathText} (${primaryHotspot.recentRenderCount} renders in ${primaryHotspot.windowMs}ms)`,
      `Probable cause: ${primaryHotspot.probableCause.summary}`,
      `Additional hotspots detected: ${Math.max(payload.hotspots.length - 1, 0)}`,
    ],
    confidence: payload.hotspots.length > 1 || primaryHotspot.recentRenderCount >= payload.threshold * 2 ? "high" : "medium",
    suspected_source: primaryHotspot.probableCause.type,
    next_step: `Inspect ${primaryHotspot.componentName} hook changes or run a higher-level excess render diagnosis to confirm the unstable input.`,
    raw_data: payload,
  });
}

export function createAsyncTimelineVerdict(
  payload: AsyncTimelineResponse
): DiagnosticVerdict<
  "async_order_inversion_detected" | "slow_async_operations_detected" | "no_async_anomalies_detected" | "no_async_activity_detected",
  AsyncTimelineResponse
> {
  const invertedGroup = payload.summary.invertedGroups[0] ?? null;
  const slowRequest = payload.summary.slowRequests[0] ?? null;

  if (payload.summary.totalRequests === 0) {
    return createVerdict({
      verdict: "no_async_activity_detected",
      summary: "No recent fetch or XHR activity was captured in the runtime timeline.",
      evidence: ["Captured requests: 0"],
      confidence: "low",
      next_step: "Reproduce the bug again before requesting the async timeline.",
      raw_data: payload,
    });
  }

  if (invertedGroup) {
    return createVerdict({
      verdict: "async_order_inversion_detected",
      summary: `Async requests for ${invertedGroup.groupKey} completed out of start order, which is a strong race-condition signal.`,
      evidence: [
        `Started order: ${invertedGroup.startedOrder.join(" -> ")}`,
        `Settled order: ${invertedGroup.settledOrder.join(" -> ")}`,
        slowRequest ? `Slowest request: ${formatSlowRequest(slowRequest.label, slowRequest.durationMs, slowRequest.status)}` : "No slow-request outlier detected.",
      ],
      confidence: "high",
      suspected_source: invertedGroup.groupKey,
      next_step: "Verify whether a late async response overwrites newer user intent or state.",
      raw_data: payload,
    });
  }

  if (slowRequest && slowRequest.durationMs >= 1_000) {
    return createVerdict({
      verdict: "slow_async_operations_detected",
      summary: `${slowRequest.label} is the slowest recent request at ${slowRequest.durationMs}ms, which may amplify UI timing bugs.`,
      evidence: [
        formatSlowRequest(slowRequest.label, slowRequest.durationMs, slowRequest.status),
        `Tracked request groups: ${payload.summary.groups}`,
        `Captured requests: ${payload.summary.totalRequests}`,
      ],
      confidence: "medium",
      suspected_source: slowRequest.groupKey,
      next_step: "Inspect the related request path and validate whether slow completion correlates with stale UI state.",
      raw_data: payload,
    });
  }

  return createVerdict({
    verdict: "no_async_anomalies_detected",
    summary: `Captured ${payload.summary.totalRequests} recent async requests without completion-order inversions or major latency outliers.`,
    evidence: [
      `Tracked request groups: ${payload.summary.groups}`,
      `Completion-order inversions: ${payload.summary.invertedGroups.length}`,
    ],
    confidence: "medium",
    next_step: "If the issue still looks asynchronous, collect a longer trace or run an explicit race-condition diagnosis.",
    raw_data: payload,
  });
}

export function createRaceConditionVerdict(
  payload: RaceConditionDiagnosisResponse
): DiagnosticVerdict<
  "race_condition_detected" | "race_condition_inconclusive" | "race_condition_not_detected",
  RaceConditionDiagnosisResponse
> {
  if (payload.suspected) {
    return createVerdict({
      verdict: "race_condition_detected",
      summary: payload.diagnosis,
      evidence: payload.evidence,
      confidence: "high",
      suspected_source: payload.invertedGroup?.groupKey,
      next_step: "Guard late async responses so only the newest intent is allowed to update visible state.",
      raw_data: payload,
    });
  }

  if (payload.invertedGroup) {
    return createVerdict({
      verdict: "race_condition_inconclusive",
      summary: payload.diagnosis,
      evidence: payload.evidence,
      confidence: "medium",
      suspected_source: payload.invertedGroup.groupKey,
      next_step: "Compare the final UI text with the latest user intent or add stronger assertions around the stale state candidate.",
      raw_data: payload,
    });
  }

  return createVerdict({
    verdict: "race_condition_not_detected",
    summary: payload.diagnosis,
    evidence: payload.evidence.length > 0 ? payload.evidence : ["No inverted completion order was detected."],
    confidence: "medium",
    next_step: "If the bug is intermittent, run a stress replay with tighter action timing and explicit assertions.",
    raw_data: payload,
  });
}

export function createHydrationIssuesVerdict(
  payload: HydrationIssuesResponse
): DiagnosticVerdict<"hydration_issues_detected" | "hydration_issues_not_detected", HydrationIssuesResponse> {
  const firstIssue = payload.issues[0] ?? null;

  if (!firstIssue) {
    return createVerdict({
      verdict: "hydration_issues_not_detected",
      summary: "No hydration-related warnings or exceptions were captured from the runtime console.",
      evidence: ["Captured hydration issues: 0"],
      confidence: "medium",
      next_step: "If hydration is still suspected, reload the page from a clean state and inspect the first render again.",
      raw_data: payload,
    });
  }

  return createVerdict({
    verdict: "hydration_issues_detected",
    summary: `${payload.summary.total} hydration signal(s) detected, led by a ${firstIssue.kind} issue in ${firstIssue.framework}.`,
    evidence: [
      `First issue: ${firstIssue.message}`,
      `By kind: ${Object.entries(payload.summary.byKind)
        .filter(([, count]) => count > 0)
        .map(([kind, count]) => `${kind}=${count}`)
        .join(", ")}`,
      `By level: ${Object.entries(payload.summary.byLevel)
        .filter(([, count]) => count > 0)
        .map(([level, count]) => `${level}=${count}`)
        .join(", ")}`,
    ],
    confidence: firstIssue.level === "error" || firstIssue.kind !== "warning" ? "high" : "medium",
    suspected_source: `${firstIssue.framework}:${firstIssue.kind}`,
    next_step: "Inspect the first server/client mismatch and compare the initial render inputs across server and browser.",
    raw_data: payload,
  });
}
