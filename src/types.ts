/**
 * types.ts — Shared MCP tool response types and helpers.
 * Rule: all tool handlers return ToolResponse — never throw.
 */

export type ToolResponse = { content: [{ type: "text"; text: string }] };

export interface ToolError {
  error: true;
  message: string;
}

export function ok(data: unknown): ToolResponse {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function err(message: string): ToolResponse {
  const body: ToolError = { error: true, message };
  return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
}
