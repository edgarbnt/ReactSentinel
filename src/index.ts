#!/usr/bin/env node
/**
 * React-Sentinel MCP Server — entry point
 *
 * Bridges AI terminals (Claude, Copilot CLI…) to a live browser runtime
 * via the Model Context Protocol (MCP).
 *
 * Transport: stdio (compatible with all MCP clients out of the box).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ok, err } from "./types.js";
import type { ToolResponse } from "./types.js";
import { browserManager, DEFAULT_CDP_ENDPOINT } from "./browser/index.js";
import {
  buildMcpConfigDocument,
  buildMcpServerConfig,
  parseConfigRoot,
  renderMcpConfigDocument,
  resolveDefaultConfigPath,
  type McpClient,
  validateServerConfig,
  type McpInstallMode,
  upsertServerConfig,
} from "./mcp-config.js";
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

type CliCommand = "start" | "mcp" | "init-mcp" | "doctor" | "help";

type StartCommandOptions = {
  replayHeadless: boolean;
  cdpEndpoint: string;
  verbose: boolean;
};

type DoctorCommandOptions = {
  cdpEndpoint: string;
  configPath: string | null;
  json: boolean;
  serverName: string;
};

type InitMcpCommandOptions = {
  client: McpClient;
  mode: McpInstallMode;
  serverName: string;
  replayHeadless: boolean;
  write: boolean;
  configPath: string | null;
};

type CapabilityStatus = "planned" | "partial" | "available";

const serverCapabilities: Record<string, CapabilityStatus> = {
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
};

function createServerInfoPayload(): {
  name: string;
  version: string;
  transport: "stdio";
  capabilities: Record<string, CapabilityStatus>;
} {
  return {
    name: REACT_SENTINEL_NAME,
    version: REACT_SENTINEL_VERSION,
    transport: "stdio",
    capabilities: { ...serverCapabilities },
  };
}

function summarizeCapabilities(capabilities: Record<string, CapabilityStatus>): Record<CapabilityStatus, string[]> {
  const summary: Record<CapabilityStatus, string[]> = {
    planned: [],
    partial: [],
    available: [],
  };

  for (const [name, status] of Object.entries(capabilities)) {
    summary[status].push(name);
  }

  for (const entries of Object.values(summary)) {
    entries.sort((left, right) => left.localeCompare(right));
  }

  return summary;
}

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
        return ok(createServerInfoPayload());
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
  if (options?.verbose) {
    const payload = createServerInfoPayload();
    console.error(
      `[react-sentinel] Verbose startup metadata ${JSON.stringify({
        command: "mcp",
        transport: payload.transport,
        replayDefault: options.replayHeadless === false ? "headed" : "headless",
        cdpEndpoint: browserManager.getDefaultCdpEndpoint(),
        capabilitySummary: summarizeCapabilities(payload.capabilities),
        capabilities: payload.capabilities,
      })}`
    );
  }

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
    "  react-sentinel mcp [--headless|--headed] [--cdp-endpoint <url>]",
    "  react-sentinel init-mcp [--client <claude-code|claude-desktop>] [--mode <local|global|npx>]",
    "  react-sentinel doctor [--cdp-endpoint <url>] [--json]",
    "  react-sentinel help",
    "",
    "Commands:",
    "  start   Start the MCP server over stdio (default command).",
    "  mcp     Explicit stdio MCP server command for agent/client configs.",
    "  init-mcp  Print a ready-to-paste MCP config snippet for Claude-compatible clients.",
    "  doctor  Check the local replay browser runtime and optional CDP attach endpoint.",
    "  help    Show this help message.",
    "",
    "Options:",
    `  --cdp-endpoint <url>  Override the default Chrome DevTools endpoint (default: ${DEFAULT_CDP_ENDPOINT}).`,
    "  --headed              Start replay sessions in visible Chromium mode by default.",
    "  --headless            Force replay sessions to stay headless (default).",
    "  --verbose             Print agent-friendly startup metadata to stderr.",
    "  --json                Print doctor results as JSON.",
    "  --config-path <path>  Validate an existing MCP config file during doctor or init-mcp --write.",
    "  --client <name>       Target MCP client for init-mcp (claude-code or claude-desktop).",
    "  --mode <name>         Launch mode for init-mcp (local, global, or npx).",
    "  --server-name <name>  Server key used inside the generated mcpServers object.",
    "  --write               Write or merge the generated config into a config file.",
    "  --config-path <path>  Override the config file path used with init-mcp --write.",
    "  -h, --help            Show help.",
    "  -v, --version         Show the CLI version.",
    "",
    "Examples:",
    "  npx react-sentinel mcp --headed",
    "  npx react-sentinel doctor --json",
    "  react-sentinel doctor --config-path ~/.config/Claude/claude_desktop_config.json",
    "  react-sentinel init-mcp --client claude-desktop --mode local",
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
      verbose: { type: "boolean", default: false },
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
      verbose: parsed.values.verbose,
    },
    help: parsed.values.help,
    version: parsed.values.version,
  };
}

function parseInitMcpOptions(args: string[]): { options: InitMcpCommandOptions; help: boolean; version: boolean } {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    options: {
      client: { type: "string" },
      "config-path": { type: "string" },
      mode: { type: "string" },
      "server-name": { type: "string" },
      headless: { type: "boolean", default: false },
      headed: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      write: { type: "boolean", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });

  if (parsed.values.headless && parsed.values.headed) {
    throw new Error("Choose either --headless or --headed, not both.");
  }

  const client = parsed.values.client ?? "claude-desktop";
  if (client !== "claude-code" && client !== "claude-desktop") {
    throw new Error(`Invalid value for --client: "${client}". Use "claude-code" or "claude-desktop".`);
  }

  const mode = parsed.values.mode ?? "local";
  if (mode !== "local" && mode !== "global" && mode !== "npx") {
    throw new Error(`Invalid value for --mode: "${mode}". Use "local", "global", or "npx".`);
  }

  const serverName = parsed.values["server-name"] ?? REACT_SENTINEL_NAME;
  if (!serverName.trim()) {
    throw new Error("Invalid value for --server-name: it must not be empty.");
  }

  return {
    options: {
      client,
      mode,
      serverName,
      replayHeadless: parsed.values.headed ? false : true,
      write: parsed.values.write,
      configPath: parsed.values["config-path"] ?? null,
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
      "config-path": { type: "string" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      "server-name": { type: "string" },
      version: { type: "boolean", short: "v", default: false },
    },
  });

  const serverName = parsed.values["server-name"] ?? REACT_SENTINEL_NAME;
  if (!serverName.trim()) {
    throw new Error("Invalid value for --server-name: it must not be empty.");
  }

  return {
    options: {
      cdpEndpoint: parseCdpEndpoint(parsed.values["cdp-endpoint"]),
      configPath: parsed.values["config-path"] ?? null,
      json: parsed.values.json,
      serverName,
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
  let configCheck:
    | undefined
    | {
        status: "pass";
        path: string;
        serverName: string;
        command: string;
        args: string[];
      }
    | {
        status: "fail";
        path: string;
        serverName: string;
        issues: string[];
      };

  if (options.configPath) {
    try {
      const root = parseConfigRoot(await readFile(options.configPath, "utf8"));
      const validation = validateServerConfig(root, options.serverName);
      configCheck =
        validation.status === "pass"
          ? {
              status: "pass",
              path: options.configPath,
              serverName: options.serverName,
              command: validation.command ?? "unknown",
              args: validation.args ?? [],
            }
          : {
              status: "fail",
              path: options.configPath,
              serverName: options.serverName,
              issues: validation.issues,
            };
    } catch (error) {
      const errorCode =
        typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
          ? error.code
          : null;
      configCheck = {
        status: "fail",
        path: options.configPath,
        serverName: options.serverName,
        issues: [
          errorCode === "ENOENT"
            ? `Config file not found at ${options.configPath}.`
            : error instanceof Error
              ? error.message
              : String(error),
        ],
      };
    }
  }

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
      ...(configCheck ? { mcpConfig: configCheck } : {}),
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

    if (configCheck) {
      if (configCheck.status === "pass") {
        lines.push(
          `PASS mcp config ${configCheck.path} -> ${configCheck.command} ${configCheck.args.join(" ")}`
        );
      } else {
        lines.push(`FAIL mcp config ${configCheck.path}`);
        for (const issue of configCheck.issues) {
          lines.push(`Hint: ${issue}`);
        }
      }
    }

    console.log(lines.join("\n"));
  }

  if (
    report.checks.node.status === "fail" ||
    report.checks.replayBrowser.status === "fail" ||
    configCheck?.status === "fail"
  ) {
    process.exitCode = 1;
  }
}

async function runInitMcp(options: InitMcpCommandOptions): Promise<void> {
  const document = buildMcpConfigDocument({
    client: options.client,
    mode: options.mode,
    serverName: options.serverName,
    replayHeadless: options.replayHeadless,
  });

  if (!options.write) {
    console.log(renderMcpConfigDocument(document));
    return;
  }

  const targetPath = options.configPath ?? resolveDefaultConfigPath({ client: options.client });
  let configRoot: Record<string, unknown> = {};

  try {
    configRoot = parseConfigRoot(await readFile(targetPath, "utf8"));
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  const updatedRoot = upsertServerConfig({
    root: configRoot,
    serverName: options.serverName,
    serverConfig: buildMcpServerConfig({
      mode: options.mode,
      replayHeadless: options.replayHeadless,
    }),
  });

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(updatedRoot, null, 2)}\n`, "utf8");

  const nextStep =
    options.client === "claude-desktop"
      ? "Restart Claude Desktop after saving the config."
      : "Restart Claude Code or reopen the project so the new MCP config is loaded.";

  console.log(`Wrote MCP config for "${options.serverName}" to ${targetPath}.`);
  console.log(nextStep);
}

async function runCli(argv: string[]): Promise<void> {
  const [candidateCommand, ...rest] = argv;
  let command: CliCommand = "start";
  let commandArgs = argv;

  if (candidateCommand && !candidateCommand.startsWith("-")) {
    if (
      candidateCommand === "start" ||
      candidateCommand === "mcp" ||
      candidateCommand === "init-mcp" ||
      candidateCommand === "doctor" ||
      candidateCommand === "help"
    ) {
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

  if (command === "start" || command === "mcp") {
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

  if (command === "init-mcp") {
    const parsed = parseInitMcpOptions(commandArgs);
    if (parsed.version) {
      console.log(REACT_SENTINEL_VERSION);
      return;
    }
    if (parsed.help) {
      console.log(formatHelp());
      return;
    }

    await runInitMcp(parsed.options);
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
  const message = e instanceof Error ? e.message : String(e);
  console.error("[react-sentinel] Fatal error:", message);
  console.error("[react-sentinel] Hint: run `react-sentinel mcp --help` for the explicit stdio command and available options.");
  process.exit(1);
});
