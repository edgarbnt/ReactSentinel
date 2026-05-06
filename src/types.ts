/**
 * types.ts — Shared MCP tool response types and helpers.
 *
 * Rule: all tool handlers return ToolResponse — never throw.
 */

/** Uniform MCP tool response shape required by all tool handlers. */
export type ToolResponse = { content: [{ type: "text"; text: string }] };

/** Structured error payload — returned instead of throwing. */
export interface ToolError {
  error: true;
  message: string;
}

/** Wrap a successful result as a ToolResponse. */
export function ok(data: unknown): ToolResponse {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/** Wrap an error message as a ToolResponse (never throws). */
export function err(message: string): ToolResponse {
  const body: ToolError = { error: true, message };
  return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
}
