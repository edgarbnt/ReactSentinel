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
  action: "click" | "type" | "fill";
  selector: string;
  value?: string; // For type/fill actions
}

/** Interaction result data */
export interface InteractionData {
  success: boolean;
  action: InteractionPayload["action"];
  selector: string;
  error?: string;
}

/** Assertion types */
export type AssertionType = "text_present" | "no_console_errors";

export interface Assertion {
  type: AssertionType;
  expected?: string; // For text_present
}

/** Validation result */
export interface ValidationResult {
  pass: boolean;
  assertion: Assertion;
  details?: string;
  actual?: unknown;
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
