/**
 * browser/protocol.ts — Type-safe message protocol for MCP ↔ browser communication.
 */

export interface BrowserRequest {
  type: "ping" | "evaluate";
  payload?: Record<string, unknown>;
}

export interface BrowserSuccess {
  success: true;
  type: BrowserRequest["type"];
  data: unknown;
  durationMs: number;
}

export interface BrowserError {
  success: false;
  type: BrowserRequest["type"];
  error: string;
  durationMs: number;
}

export type BrowserResult = BrowserSuccess | BrowserError;

export interface PingData {
  pong: true;
  url: string;
  title: string;
  timestamp: string;
}
