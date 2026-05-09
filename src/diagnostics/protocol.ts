/**
* diagnostics/protocol.ts — SCRUM-24
*
* Type definitions for all runtime diagnostic responses.
* Designed to be extensible for future inspection commands (fiber, network…).
*/

// ---------------------------------------------------------------------------
// React detection (SCRUM-26)
// ---------------------------------------------------------------------------

/** Result of React presence detection in a page. */
export interface ReactInfo {
  /** Whether a React app was detected on this page. */
  detected: boolean;
  /** React version string, if detectable (e.g. "18.3.1"). Null otherwise. */
  version: string | null;
  /** Whether the __REACT_DEVTOOLS_GLOBAL_HOOK__ is present (React's extension bridge). */
  devtoolsHookPresent: boolean;
}

// ---------------------------------------------------------------------------
// Runtime status (get_runtime_status)
// ---------------------------------------------------------------------------

/** Full runtime status of a connected page. */
export interface RuntimeStatus {
  /** Current page URL as seen by the browser. */
  url: string;
  /** Page <title> content. */
  title: string;
  /** ISO 8601 timestamp of when the snapshot was taken. */
  timestamp: string;
  /** Viewport dimensions in logical pixels. */
  viewport: {
    width: number;
    height: number;
  };
  /** React presence and version information. */
  react: ReactInfo;
  /** How long the full operation took (ms). */
  durationMs: number;
}

// ---------------------------------------------------------------------------
// React Tree (SCRUM-5)
// ---------------------------------------------------------------------------

export interface ReactTreeNode {
  name: string;
  props: Record<string, unknown>;
  children: ReactTreeNode[];
}

export interface ReactTreeResponse {
  url: string;
  tree: ReactTreeNode | null;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Component Inspection (SCRUM-9)
// ---------------------------------------------------------------------------

export type ComponentHookKind = "state" | "ref" | "memo" | "unknown";

export interface ComponentHookValue {
  index: number;
  kind: ComponentHookKind;
  source: "memoizedState";
  value: unknown;
}

export interface ComponentContextValue {
  name: string;
  source: "dependency" | "provider";
  value: unknown;
}

export interface ComponentInspectionNode {
  name: string;
  props: Record<string, unknown>;
  path: string[];
  childrenCount: number;
  contexts: ComponentContextValue[];
}

export interface ComponentInspectionResponse {
  url: string;
  componentName: string;
  found: boolean;
  component: ComponentInspectionNode | null;
  durationMs: number;
}

export interface ComponentStateNode {
  name: string;
  path: string[];
  childrenCount: number;
  hooks: ComponentHookValue[];
}

export interface ComponentStateResponse {
  url: string;
  componentName: string;
  found: boolean;
  state: ComponentStateNode | null;
  durationMs: number;
}

export interface ConsoleEvent {
  type: "log" | "warn" | "error" | "exception";
  text: string;
  location?: string;
  timestamp: string;
}

export interface ConsoleEventsResponse {
  url: string;
  events: ConsoleEvent[];
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Runtime timeline (S4-03)
// ---------------------------------------------------------------------------

export type RuntimeTimelineSource = "console" | "exception" | "network";

export type RuntimeTimelineLevel = "log" | "warn" | "error" | "exception" | "info";

export interface RuntimeTimelineEvent {
  source: RuntimeTimelineSource;
  level: RuntimeTimelineLevel;
  message: string;
  timestamp: string;
  sequence: number;
  payload?: Record<string, unknown>;
}

export interface RuntimeTimelineSummary {
  total: number;
  bySource: Record<RuntimeTimelineSource, number>;
  byLevel: Record<RuntimeTimelineLevel, number>;
  errorCount: number;
}

export interface RuntimeTimelineResponse {
  url: string;
  events: RuntimeTimelineEvent[];
  summary: RuntimeTimelineSummary;
  durationMs: number;
}
