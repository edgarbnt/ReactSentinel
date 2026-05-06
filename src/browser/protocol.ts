/**
 * browser/protocol.ts — SCRUM-17
 *
 * Type-safe message protocol for MCP server ↔ browser communication.
 */

/** A request the MCP server sends to the browser runtime. */
export interface BrowserRequest {
  type: "ping" | "evaluate";
  payload?: Record<string, unknown>;
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
