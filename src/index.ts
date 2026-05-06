#!/usr/bin/env node
/**
 * React-Sentinel MCP Server — entry point
 *
 * Bridges AI terminals (Claude, Copilot CLI…) to a live browser runtime
 * via the Model Context Protocol (MCP), enabling runtime inspection,
 * shadow sandboxing, and interaction simulation.
 *
 * Transport: stdio (compatible with all MCP clients out of the box).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Uniform MCP tool response shape (rule: always use this format). */
type ToolResponse = { content: [{ type: "text"; text: string }] };

/** Structured error returned by tool handlers — never throw. */
interface ToolError {
  error: true;
  message: string;
}

function ok(data: unknown): ToolResponse {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function err(message: string): ToolResponse {
  const body: ToolError = { error: true, message };
  return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "react-sentinel",
  version: "0.1.0",
});

// ---------------------------------------------------------------------------
// Tool: ping — health-check
// ---------------------------------------------------------------------------

server.tool(
  "ping",
  "Health-check — confirms the React-Sentinel server is running correctly.",
  {},
  async (): Promise<ToolResponse> => {
    try {
      return ok({ status: "online", server: "react-sentinel", version: "0.1.0" });
    } catch (e) {
      return err(`ping failed: ${String(e)}`);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: get_server_info — capability manifest
// ---------------------------------------------------------------------------

server.tool(
  "get_server_info",
  "Returns metadata and planned capabilities of this React-Sentinel instance.",
  {},
  async (): Promise<ToolResponse> => {
    try {
      return ok({
        name: "react-sentinel",
        version: "0.1.0",
        transport: "stdio",
        capabilities: {
          runtime_inspection: "planned",
          shadow_sandbox: "planned",
          interaction_simulation: "planned",
        },
        status: "bootstrap — stack validated",
      });
    } catch (e) {
      return err(`get_server_info failed: ${String(e)}`);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: echo — development utility
// ---------------------------------------------------------------------------

server.tool(
  "echo",
  "Echoes back the provided message. Useful for testing the MCP transport layer.",
  { message: z.string().describe("The message to echo back.") },
  async ({ message }): Promise<ToolResponse> => {
    try {
      return ok({ echo: message });
    } catch (e) {
      return err(`echo failed: ${String(e)}`);
    }
  }
);

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr — stdout is reserved for the MCP protocol messages.
  console.error("[react-sentinel] MCP server started (stdio transport) ✅");
}

main().catch((e: unknown) => {
  console.error("[react-sentinel] Fatal error:", e);
  process.exit(1);
});
