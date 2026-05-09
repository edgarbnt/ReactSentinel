/**
 * browser/protocol.ts — SCRUM-17
 *
 * Type-safe message protocol for MCP server ↔ browser communication.
 */

/** A request the MCP server sends to the browser runtime. */
export interface BrowserRequest {
  type: "ping" | "evaluate" | "interaction";
  payload?: Record<string, unknown>;
}

/** Interaction request payload */
export interface InteractionPayload {
  action: "click" | "type" | "fill" | "press";
  selector: string;
  value?: string; // For type/fill actions
  key?: string; // For press actions
}

/** Interaction result data */
export interface InteractionData {
  success: boolean;
  action: InteractionPayload["action"];
  selector: string;
  error?: string;
}

export type AssertionPrimitive = string | number | boolean | null;

export type SessionMode = "replay" | "attach";

export interface ReplayConfig {
  headless: boolean;
}

export interface SessionInfo {
  mode: SessionMode;
  connected: boolean;
  pageUrl: string | null;
  title: string | null;
  replay: {
    active: boolean;
    config: ReplayConfig;
  };
  attach: {
    active: boolean;
    endpoint: string | null;
    selectedTab: AttachTabInfo | null;
  };
}

/** Assertion types */
export type AssertionType =
  | "text_present"
  | "text_absent"
  | "selector_visible"
  | "selector_hidden"
  | "component_present"
  | "component_prop_value"
  | "component_state_value"
  | "no_console_errors"
  | "no_console_warnings"
  | "no_http_5xx"
  | "no_unexpected_http_requests";

export interface TextPresentAssertion {
  type: "text_present";
  expected: string;
}

export interface TextAbsentAssertion {
  type: "text_absent";
  expected: string;
}

export interface SelectorVisibleAssertion {
  type: "selector_visible";
  selector: string;
}

export interface SelectorHiddenAssertion {
  type: "selector_hidden";
  selector: string;
}

export interface ComponentPresentAssertion {
  type: "component_present";
  componentName: string;
}

export interface ComponentPropValueAssertion {
  type: "component_prop_value";
  componentName: string;
  propPath: string;
  expected: AssertionPrimitive;
}

export interface ComponentStateValueAssertion {
  type: "component_state_value";
  componentName: string;
  hookIndex: number;
  expected: AssertionPrimitive;
  valuePath?: string;
}

export interface NoConsoleErrorsAssertion {
  type: "no_console_errors";
}

export interface NoConsoleWarningsAssertion {
  type: "no_console_warnings";
}

export interface NoHttp5xxAssertion {
  type: "no_http_5xx";
}

export interface NoUnexpectedHttpRequestsAssertion {
  type: "no_unexpected_http_requests";
  allowedUrlSubstrings: string[];
}

export type Assertion =
  | TextPresentAssertion
  | TextAbsentAssertion
  | SelectorVisibleAssertion
  | SelectorHiddenAssertion
  | ComponentPresentAssertion
  | ComponentPropValueAssertion
  | ComponentStateValueAssertion
  | NoConsoleErrorsAssertion
  | NoConsoleWarningsAssertion
  | NoHttp5xxAssertion
  | NoUnexpectedHttpRequestsAssertion;

/** Validation result */
export interface ValidationResult {
  pass: boolean;
  assertion: Assertion;
  details?: string;
  expected?: unknown;
  actual?: unknown;
  durationMs?: number;
}

/** A captured network event from fetch or XMLHttpRequest. */
export interface NetworkEvent {
  type: "fetch" | "xhr";
  url: string;
  method: string;
  status: number | null;
  durationMs: number;
  timestamp: string;
  error?: string;
  isHttpError: boolean;
}

/** Summary of network events returned to the MCP layer. */
export interface NetworkEventsSummary {
  total: number;
  httpErrorCount: number;
  statusCounts: Record<string, number>;
  urls: string[];
}

export interface NetworkEventsResponse {
  url: string;
  events: NetworkEvent[];
  summary: NetworkEventsSummary;
  durationMs: number;
}

/** Combined interaction and validation response */
export interface InteractionValidationResponse {
  interaction: InteractionData;
  validation?: ValidationResult;
}

/** Successful browser response. */
export interface BrowserSuccess {
  success: true;
  type: BrowserRequest["type"];
  data: unknown;
  durationMs: number;
}

/** Error response — browser unreachable or navigation failed. */
export interface BrowserError {
  success: false;
  type: BrowserRequest["type"];
  error: string;
  durationMs: number;
}

export type BrowserResult = BrowserSuccess | BrowserError;

/** Data returned by a successful ping request. */
export interface PingData {
  pong: true;
  url: string;
  title: string;
  timestamp: string;
}

export interface CdpVersionInfo {
  Browser?: string;
  "Protocol-Version"?: string;
  "User-Agent"?: string;
  "V8-Version"?: string;
  "WebKit-Version"?: string;
  webSocketDebuggerUrl?: string;
}

export interface CdpTargetInfo {
  id: string;
  title: string;
  url: string;
  type: string;
  webSocketDebuggerUrl?: string;
  devtoolsFrontendUrl?: string;
  faviconUrl?: string;
  description?: string;
  browserContextId?: string;
}

export interface AttachTabInfo extends CdpTargetInfo {
  index: number;
}

export type AttachTabSelector =
  | { kind: "index"; index: number }
  | { kind: "url"; url: string }
  | { kind: "title"; title: string };

export interface AttachTabsResponse {
  endpoint: string;
  checkedAt: string;
  total: number;
  filters: {
    url?: string;
    title?: string;
  };
  tabs: AttachTabInfo[];
  selectedTab: AttachTabInfo | null;
}

export interface AttachTabSelectionResponse {
  endpoint: string;
  checkedAt: string;
  selection: AttachTabSelector;
  matchedCount: number;
  found: boolean;
  confirmed: boolean;
  requiresConfirmation: boolean;
  selectedTab: AttachTabInfo | null;
  candidateTab: AttachTabInfo | null;
  tabs: AttachTabInfo[];
  message: string;
}

export interface AttachStatus {
  endpoint: string;
  checkedAt: string;
  status: "attach_ready" | "attach_unavailable";
  ready: boolean;
  reachable: boolean;
  help: string;
  error?: string;
  browser?: string;
  protocolVersion?: string;
  userAgent?: string;
  webSocketDebuggerUrl?: string;
}

export type ReplayWaitUntil = "load" | "domcontentloaded" | "networkidle";

export interface ReplayNavigationResponse {
  session: SessionInfo;
  url: string;
  title: string;
  navigatedAt: string;
  waitUntil: ReplayWaitUntil;
  timeoutMs: number;
}

export interface ReplayClickStep {
  action: "click";
  selector: string;
  timeoutMs?: number;
}

export interface ReplayFillStep {
  action: "fill";
  selector: string;
  value: string;
  timeoutMs?: number;
}

export interface ReplayTypeStep {
  action: "type";
  selector: string;
  value: string;
  timeoutMs?: number;
}

export interface ReplayWaitStep {
  action: "wait";
  durationMs: number;
}

export interface ReplayPressStep {
  action: "press";
  key: string;
  selector?: string;
  timeoutMs?: number;
}

export type ReplayStep =
  | ReplayClickStep
  | ReplayFillStep
  | ReplayTypeStep
  | ReplayWaitStep
  | ReplayPressStep;

export interface ReplayStepResult {
  index: number;
  step: ReplayStep;
  success: boolean;
  durationMs: number;
  url: string;
  error?: string;
}

export interface ReplaySequenceResponse {
  session: SessionInfo;
  url: string;
  startedAt: string;
  durationMs: number;
  success: boolean;
  steps: ReplayStepResult[];
}

export interface ValidationScenarioSummary {
  actionCount: number;
  actionFailures: number;
  assertionCount: number;
  assertionFailures: number;
  overallPass: boolean;
}

export interface ValidationScenarioResponse {
  session: SessionInfo;
  url: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  success: boolean;
  steps: ReplayStepResult[];
  assertions: ValidationResult[];
  traces: {
    console: import("../diagnostics/protocol.js").ConsoleEvent[];
    network: NetworkEvent[];
  };
  summary: ValidationScenarioSummary;
}
