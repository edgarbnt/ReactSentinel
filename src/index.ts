#!/usr/bin/env node
/**
 * React-Sentinel MCP Server — entry point
 *
 * Bridges AI terminals (Claude, Copilot CLI…) to a live browser runtime
 * via the Model Context Protocol (MCP).
 *
 * Transport: stdio (compatible with all MCP clients out of the box).
 */

import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ok, err } from "./types.js";
import type { ToolResponse } from "./types.js";
import { browserManager, DEFAULT_CDP_ENDPOINT } from "./browser/index.js";
import * as browserTools from "./tools/browser.js";
import * as diagnosticsTools from "./tools/diagnostics.js";
import * as networkTools from "./tools/network.js";
import * as interactionTools from "./tools/interaction.js";
import * as patchTools from "./tools/patch.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version?: string };
const packageVersion = packageJson.version;
const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export const REACT_SENTINEL_NAME = "react-sentinel";
export const REACT_SENTINEL_VERSION =
  typeof packageVersion === "string" && semverPattern.test(packageVersion)
    ? packageVersion
    : "unknown";

if (REACT_SENTINEL_VERSION === "unknown") {
  console.warn("[react-sentinel] Warning: package.json version is missing or invalid; using \"unknown\".");
}

type CliCommand = "start" | "doctor" | "help";

type StartCommandOptions = {
  replayHeadless: boolean;
  cdpEndpoint: string;
};

type DoctorCommandOptions = {
  cdpEndpoint: string;
  json: boolean;
};

function createServer(): McpServer {
  const server = new McpServer({
    name: REACT_SENTINEL_NAME,
    version: REACT_SENTINEL_VERSION,
  });

  server.tool(
    "ping",
    "Health-check — confirms the React-Sentinel server is running correctly.",
    {},
    async (): Promise<ToolResponse> => {
      try {
        return ok({ status: "online", server: REACT_SENTINEL_NAME, version: REACT_SENTINEL_VERSION });
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
          name: REACT_SENTINEL_NAME,
          version: REACT_SENTINEL_VERSION,
          transport: "stdio",
          capabilities: {
            browser_ping: "available",
            get_session_status: "available",
            get_attach_status: "available",
            get_attach_tabs: "available",
            select_attach_tab: "available",
            navigate_replay: "available",
            get_runtime_status: "available",
            get_component_state: "available",
            get_async_timeline: "available",
            get_race_condition_diagnosis: "available",
            get_hydration_issues: "available",
            get_render_counts: "available",
            get_render_hotspots: "available",
            get_hook_changes: "available",
            get_network_events: "available",
            get_runtime_timeline: "available",
            runtime_inspection: "available",
            render_monitor: "available",
            replay_sandbox: "available",
            replay_interactions: "available",
            validate_scenario: "available",
            apply_runtime_patch: "available",
            apply_patch_then_replay: "available",
            reset_runtime_patches: "available",
            shadow_sandbox: "available",
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

  browserTools.register(server);
  diagnosticsTools.register(server);
  networkTools.register(server);
  interactionTools.register(server);
  patchTools.register(server);

  return server;
}

export async function startServer(options?: StartCommandOptions): Promise<void> {
  browserManager.configureDefaults({
    replayHeadless: options?.replayHeadless,
    cdpEndpoint: options?.cdpEndpoint,
  });

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[react-sentinel] MCP server started (stdio transport, replay ${options?.replayHeadless === false ? "headed" : "headless"}, CDP ${browserManager.getDefaultCdpEndpoint()}) ✅`
  );

  const shutdown = async (): Promise<void> => {
    console.error("[react-sentinel] Shutting down...");
    await browserManager.close();
    process.exit(0);
  };

  process.on("SIGINT", () => { void shutdown(); });
  process.on("SIGTERM", () => { void shutdown(); });
}

function formatHelp(): string {
  return [
    "React-Sentinel CLI",
    "",
    "Usage:",
    "  react-sentinel start [--headless|--headed] [--cdp-endpoint <url>]",
    "  react-sentinel doctor [--cdp-endpoint <url>] [--json]",
    "  react-sentinel help",
    "",
    "Commands:",
    "  start   Start the MCP server over stdio (default command).",
    "  doctor  Check the local replay browser runtime and optional CDP attach endpoint.",
    "  help    Show this help message.",
    "",
    "Options:",
    `  --cdp-endpoint <url>  Override the default Chrome DevTools endpoint (default: ${DEFAULT_CDP_ENDPOINT}).`,
    "  --headed              Start replay sessions in visible Chromium mode by default.",
    "  --headless            Force replay sessions to stay headless (default).",
    "  --json                Print doctor results as JSON.",
    "  -h, --help            Show help.",
    "  -v, --version         Show the CLI version.",
  ].join("\n");
}

function readNodeMajorVersion(version: string): number | null {
  const match = version.match(/^v(\d+)/);
  return match ? Number(match[1]) : null;
}

function parseCdpEndpoint(rawEndpoint: string | undefined): string {
  const endpoint = rawEndpoint ?? DEFAULT_CDP_ENDPOINT;
  try {
    new URL(endpoint);
    return endpoint;
  } catch {
    throw new Error(
      `Invalid value for --cdp-endpoint: "${endpoint}". It must be an absolute URL, for example ${DEFAULT_CDP_ENDPOINT}.`
    );
  }
}

function parseStartOptions(args: string[]): { options: StartCommandOptions; help: boolean; version: boolean } {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    options: {
      "cdp-endpoint": { type: "string" },
      headless: { type: "boolean", default: false },
      headed: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });

  if (parsed.values.headless && parsed.values.headed) {
    throw new Error("Choose either --headless or --headed, not both.");
  }

  return {
    options: {
      replayHeadless: parsed.values.headed ? false : true,
      cdpEndpoint: parseCdpEndpoint(parsed.values["cdp-endpoint"]),
    },
    help: parsed.values.help,
    version: parsed.values.version,
  };
}

function parseDoctorOptions(args: string[]): { options: DoctorCommandOptions; help: boolean; version: boolean } {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    options: {
      "cdp-endpoint": { type: "string" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });

  return {
    options: {
      cdpEndpoint: parseCdpEndpoint(parsed.values["cdp-endpoint"]),
      json: parsed.values.json,
    },
    help: parsed.values.help,
    version: parsed.values.version,
  };
}

async function runDoctor(options: DoctorCommandOptions): Promise<void> {
  const nodeMajor = readNodeMajorVersion(process.version);
  let replayCheck:
    | { status: "pass"; details: { active: boolean; sessionId: number | null; headless: boolean } }
    | { status: "fail"; error: string; hint: string };

  try {
    await browserManager.launch();
    const session = await browserManager.getSessionInfo();
    replayCheck = {
      status: "pass",
      details: {
        active: session.replay.active,
        sessionId: session.replay.sessionId,
        headless: session.replay.config.headless,
      },
    };
  } catch (error) {
    replayCheck = {
      status: "fail",
      error: error instanceof Error ? error.message : String(error),
      hint: "Install Chromium once with `npx playwright install chromium` if Playwright cannot launch the replay browser.",
    };
  }

  const attachCheck = await browserManager.getAttachStatus(options.cdpEndpoint);

  const report = {
    name: REACT_SENTINEL_NAME,
    version: REACT_SENTINEL_VERSION,
    checkedAt: new Date().toISOString(),
    checks: {
      node: {
        status: nodeMajor !== null && nodeMajor >= 20 ? "pass" : "fail",
        version: process.version,
        required: ">=20",
      },
      replayBrowser: replayCheck,
      attachEndpoint: attachCheck.ready
        ? {
            status: "pass",
            endpoint: attachCheck.endpoint,
            browser: attachCheck.browser ?? null,
          }
        : {
            status: "warn",
            endpoint: attachCheck.endpoint,
            reachable: attachCheck.reachable,
            error: attachCheck.error,
            help: attachCheck.help,
          },
    },
  };

  await browserManager.close();

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const lines = [
      `React-Sentinel doctor (${REACT_SENTINEL_VERSION})`,
      "",
      `${report.checks.node.status === "pass" ? "PASS" : "FAIL"} node ${report.checks.node.version} (required ${report.checks.node.required})`,
      report.checks.replayBrowser.status === "pass"
        ? "PASS replay browser can launch"
        : `FAIL replay browser ${report.checks.replayBrowser.error}`,
      report.checks.attachEndpoint.status === "pass"
        ? `PASS attach endpoint ready at ${report.checks.attachEndpoint.endpoint}`
        : `WARN attach endpoint ${report.checks.attachEndpoint.error}`,
    ];

    if (report.checks.attachEndpoint.status !== "pass") {
      lines.push(`Hint: ${report.checks.attachEndpoint.help}`);
    }

    console.log(lines.join("\n"));
  }

  if (report.checks.node.status === "fail" || report.checks.replayBrowser.status === "fail") {
    process.exitCode = 1;
  }
}

async function runCli(argv: string[]): Promise<void> {
  const [candidateCommand, ...rest] = argv;
  let command: CliCommand = "start";
  let commandArgs = argv;

  if (candidateCommand && !candidateCommand.startsWith("-")) {
    if (candidateCommand === "start" || candidateCommand === "doctor" || candidateCommand === "help") {
      command = candidateCommand;
      commandArgs = rest;
    } else {
      throw new Error(`Unknown command: ${candidateCommand}`);
    }
  }

  if (command === "help") {
    console.log(formatHelp());
    return;
  }

  if (command === "start") {
    const parsed = parseStartOptions(commandArgs);
    if (parsed.version) {
      console.log(REACT_SENTINEL_VERSION);
      return;
    }
    if (parsed.help) {
      console.log(formatHelp());
      return;
    }

    await startServer(parsed.options);
    return;
  }

  const parsed = parseDoctorOptions(commandArgs);
  if (parsed.version) {
    console.log(REACT_SENTINEL_VERSION);
    return;
  }
  if (parsed.help) {
    console.log(formatHelp());
    return;
  }

  await runDoctor(parsed.options);
}

runCli(process.argv.slice(2)).catch((e: unknown) => {
  console.error("[react-sentinel] Fatal error:", e);
  process.exit(1);
});
