import type { NetworkEvent } from "../browser/protocol.js";
import type {
  AsyncTimelineEvent,
  AsyncTimelineInvertedGroup,
  AsyncTimelineRequestSummary,
  AsyncTimelineSummary,
} from "./protocol.js";

type RequestRecord = {
  requestId: string;
  label: string;
  groupKey: string;
  transport: NetworkEvent["type"];
  method: string;
  url: string;
  status: number | null;
  error?: string;
  durationMs: number;
  startedAt: string;
  completedAt: string;
};

function toStartTimestamp(timestamp: string, durationMs: number): string {
  const completedAtMs = Date.parse(timestamp);
  if (!Number.isFinite(completedAtMs)) {
    return timestamp;
  }

  return new Date(completedAtMs - Math.max(durationMs, 0)).toISOString();
}

function getGroupKey(method: string, url: string): string {
  try {
    const parsed = new URL(url, "http://react-sentinel.local");
    return `${method.toUpperCase()} ${parsed.pathname}`;
  } catch {
    return `${method.toUpperCase()} ${url}`;
  }
}

function toRequestRecords(events: NetworkEvent[], limit: number): RequestRecord[] {
  return events.slice(-limit).map((event, index) => ({
    requestId: `${event.type}-${index + 1}`,
    label: `${event.method.toUpperCase()} ${event.url}`,
    groupKey: getGroupKey(event.method, event.url),
    transport: event.type,
    method: event.method.toUpperCase(),
    url: event.url,
    status: event.status,
    error: event.error,
    durationMs: event.durationMs,
    startedAt: toStartTimestamp(event.timestamp, event.durationMs),
    completedAt: event.timestamp,
  }));
}

function toTimelineEvents(records: RequestRecord[]): AsyncTimelineEvent[] {
  return records
    .flatMap((record, index) => {
      const startEvent: AsyncTimelineEvent = {
        requestId: record.requestId,
        groupKey: record.groupKey,
        label: record.label,
        phase: "request_start",
        timestamp: record.startedAt,
        sequence: index * 2,
        request: {
          transport: record.transport,
          method: record.method,
          url: record.url,
          status: null,
          durationMs: record.durationMs,
          error: null,
        },
      };

      const settleEvent: AsyncTimelineEvent = {
        requestId: record.requestId,
        groupKey: record.groupKey,
        label: record.label,
        phase: record.error ? "request_reject" : "request_resolve",
        timestamp: record.completedAt,
        sequence: index * 2 + 1,
        request: {
          transport: record.transport,
          method: record.method,
          url: record.url,
          status: record.status,
          durationMs: record.durationMs,
          error: record.error ?? null,
        },
      };

      return [startEvent, settleEvent];
    })
    .sort((left, right) => {
      const byTimestamp = left.timestamp.localeCompare(right.timestamp);
      if (byTimestamp !== 0) return byTimestamp;
      return left.sequence - right.sequence;
    });
}

function readInvertedGroups(records: RequestRecord[]): AsyncTimelineInvertedGroup[] {
  const grouped = new Map<string, RequestRecord[]>();

  for (const record of records) {
    const current = grouped.get(record.groupKey) ?? [];
    current.push(record);
    grouped.set(record.groupKey, current);
  }

  return [...grouped.entries()]
    .map(([groupKey, groupRecords]) => {
      if (groupRecords.length < 2) {
        return null;
      }

      const startedOrder = [...groupRecords]
        .sort((left, right) => left.startedAt.localeCompare(right.startedAt))
        .map((record) => record.requestId);
      const settledOrder = [...groupRecords]
        .sort((left, right) => left.completedAt.localeCompare(right.completedAt))
        .map((record) => record.requestId);

      if (startedOrder.every((requestId, index) => requestId === settledOrder[index])) {
        return null;
      }

      return {
        groupKey,
        requestIds: groupRecords.map((record) => record.requestId),
        startedOrder,
        settledOrder,
      } satisfies AsyncTimelineInvertedGroup;
    })
    .filter((group): group is AsyncTimelineInvertedGroup => group !== null);
}

function readSlowRequests(records: RequestRecord[]): AsyncTimelineRequestSummary[] {
  return [...records]
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 5)
    .map((record) => ({
      requestId: record.requestId,
      label: record.label,
      groupKey: record.groupKey,
      durationMs: record.durationMs,
      status: record.status,
    }));
}

export function readAsyncTimelineFromNetworkEvents(
  events: NetworkEvent[],
  options?: { limit?: number }
): { events: AsyncTimelineEvent[]; summary: AsyncTimelineSummary } {
  const limit = options?.limit ?? 50;
  const records = toRequestRecords(events, limit);
  const timelineEvents = toTimelineEvents(records);

  return {
    events: timelineEvents,
    summary: {
      totalEvents: timelineEvents.length,
      totalRequests: records.length,
      groups: new Set(records.map((record) => record.groupKey)).size,
      invertedGroups: readInvertedGroups(records),
      slowRequests: readSlowRequests(records),
    },
  };
}
