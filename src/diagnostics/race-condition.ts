import type { AsyncTimelineEvent, AsyncTimelineInvertedGroup, RaceConditionDiagnosisRequest, RaceConditionDiagnosisResult } from "./protocol.js";

function parseQuery(url: string): string | null {
  try {
    return new URL(url, "http://react-sentinel.local").searchParams.get("query");
  } catch {
    return null;
  }
}

function buildRequestMap(events: AsyncTimelineEvent[]): Map<string, RaceConditionDiagnosisRequest> {
  const requests = new Map<string, RaceConditionDiagnosisRequest>();

  for (const event of events) {
    const current =
      requests.get(event.requestId) ??
      ({
        requestId: event.requestId,
        label: event.label,
        query: parseQuery(event.request.url),
        url: event.request.url,
        status: event.request.status,
        startedAt: null,
        completedAt: null,
      } satisfies RaceConditionDiagnosisRequest);

    if (event.phase === "request_start") {
      current.startedAt = event.timestamp;
    } else {
      current.completedAt = event.timestamp;
      current.status = event.request.status;
    }

    requests.set(event.requestId, current);
  }

  return requests;
}

function readMatchingRequest(
  requests: Map<string, RaceConditionDiagnosisRequest>,
  requestIds: string[],
  finalStateText: string | null
): RaceConditionDiagnosisRequest | null {
  if (!finalStateText) {
    return null;
  }

  const normalizedStateText = finalStateText.toLowerCase();

  for (let index = requestIds.length - 1; index >= 0; index -= 1) {
    const request = requests.get(requestIds[index] ?? "") ?? null;
    if (
      request !== null &&
      request.query !== null &&
      normalizedStateText.includes(request.query.toLowerCase())
    ) {
      return request;
    }
  }

  return null;
}

function readSettledOrderIndex(requestIds: string[], requestId: string): number | null {
  const index = requestIds.lastIndexOf(requestId);
  return index >= 0 ? index : null;
}

export function diagnoseRaceCondition(
  events: AsyncTimelineEvent[],
  invertedGroups: AsyncTimelineInvertedGroup[],
  finalStateText: string | null
): RaceConditionDiagnosisResult {
  const latestGroup = invertedGroups[invertedGroups.length - 1] ?? null;
  if (!latestGroup) {
    return {
      suspected: false,
      diagnosis: "No inverted async completion order was detected in the recent timeline.",
      evidence: finalStateText ? [`Final state text: ${finalStateText}`] : [],
      latestIntent: null,
      finalStateRequest: null,
      invertedGroup: null,
    };
  }

  const requests = buildRequestMap(events);
  const latestIntent = requests.get(latestGroup.startedOrder[latestGroup.startedOrder.length - 1] ?? "") ?? null;
  const finalStateRequest =
    readMatchingRequest(requests, latestGroup.requestIds, finalStateText) ??
    requests.get(latestGroup.settledOrder[latestGroup.settledOrder.length - 1] ?? "") ??
    null;
  const latestIntentSettledIndex =
    latestIntent !== null ? readSettledOrderIndex(latestGroup.settledOrder, latestIntent.requestId) : null;
  const finalStateSettledIndex =
    finalStateRequest !== null ? readSettledOrderIndex(latestGroup.settledOrder, finalStateRequest.requestId) : null;
  const confirmsOverwriteOrder =
    latestIntent !== null &&
    finalStateRequest !== null &&
    latestIntent.requestId !== finalStateRequest.requestId &&
    latestIntentSettledIndex !== null &&
    finalStateSettledIndex !== null &&
    latestIntentSettledIndex < finalStateSettledIndex;

  const suspected = confirmsOverwriteOrder;

  if (!suspected) {
    return {
      suspected: false,
      diagnosis:
        "An inverted completion order was observed, but the current UI text does not clearly match an overwritten older response.",
      evidence: [
        `Started order: ${latestGroup.startedOrder.join(" -> ")}`,
        `Settled order: ${latestGroup.settledOrder.join(" -> ")}`,
        ...(finalStateText ? [`Final state text: ${finalStateText}`] : []),
      ],
      latestIntent,
      finalStateRequest,
      invertedGroup: latestGroup,
    };
  }

  const latestIntentLabel = latestIntent.query ?? latestIntent.label;
  const finalStateLabel = finalStateRequest.query ?? finalStateRequest.label;

  return {
    suspected: true,
    diagnosis: [
      `Latest intent was "${latestIntentLabel}", but the final UI matches "${finalStateLabel}".`,
      `The async timeline shows that "${latestIntentLabel}" resolved before "${finalStateLabel}",`,
      "so the slower response arrived last and overwrote newer state.",
    ].join(" "),
    evidence: [
      `Started order: ${latestGroup.startedOrder.join(" -> ")}`,
      `Settled order: ${latestGroup.settledOrder.join(" -> ")}`,
      `Final state text: ${finalStateText ?? "(missing)"}`,
    ],
    latestIntent,
    finalStateRequest,
    invertedGroup: latestGroup,
  };
}
