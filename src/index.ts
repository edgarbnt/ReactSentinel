#!/usr/bin/env node
/**
 * React-Sentinel MCP Server — entry point
 *
 * Bridges AI terminals (Claude, Copilot CLI…) to a live browser runtime
 * via the Model Context Protocol (MCP).
 *
 * Transport: stdio (compatible with all MCP clients out of the box).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ok, err } from "./types.js";
import type { ToolResponse } from "./types.js";
import { browserManager } from "./browser/index.js";
import * as browserTools from "./tools/browser.js";
import * as diagnosticsTools from "./tools/diagnostics.js";
import * as networkTools from "./tools/network.js";
import * as interactionTools from "./tools/interaction.js";

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "react-sentinel",
  version: "0.1.0",
});

// ---------------------------------------------------------------------------
// Core tools (health-check, introspection)
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
          browser_ping: "available",
          get_attach_status: "available",
          get_attach_tabs: "available",
          select_attach_tab: "available",
          get_runtime_status: "available",
          get_component_state: "available",
          get_network_events: "available",
          get_runtime_timeline: "available",
          runtime_inspection: "available",
          shadow_sandbox: "planned",
          interaction_simulation: "available",
        },
      });
    } catch (e) {
      return err(`get_server_info failed: ${String(e)}`);
    }
  }
);

server.tool(
  "echo",
  "Echoes back the provided message. Useful for testing the MCP transport.",
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
// Browser tools (SCRUM-12)
// ---------------------------------------------------------------------------

browserTools.register(server);

// ---------------------------------------------------------------------------
// Diagnostics tools (SCRUM-7)
// ---------------------------------------------------------------------------

diagnosticsTools.register(server);

// ---------------------------------------------------------------------------
// Network tools (SCRUM-102)
// ---------------------------------------------------------------------------

networkTools.register(server);

// ---------------------------------------------------------------------------
// Interaction tools (SCRUM-13)
// ---------------------------------------------------------------------------

interactionTools.register(server);

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[react-sentinel] MCP server started (stdio transport) ✅");

  // Graceful shutdown — close browser on exit
  const shutdown = async (): Promise<void> => {
    console.error("[react-sentinel] Shutting down...");
    await browserManager.close();
    process.exit(0);
  };
  process.on("SIGINT", () => { void shutdown(); });
  process.on("SIGTERM", () => { void shutdown(); });
}

main().catch((e: unknown) => {
  console.error("[react-sentinel] Fatal error:", e);
  process.exit(1);
});
