#!/usr/bin/env node
/**
 * React-Sentinel MCP Server — entry point
 *
 * Bridges AI terminals (Claude, Copilot CLI…) to a live browser runtime
 * via the Model Context Protocol (MCP).
 *
 * Transport: stdio (compatible with all MCP clients out of the box).
 */

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
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
  createServerInfoPayload,
  summarizeCapabilities,
  validateCapabilities,
} from "./capabilities.js";
import {
  buildAgentPackManifest,
  renderAgentPackManifest,
  installAgentPack,
  uninstallAgentPack,
  readExistingAgentPackManifest,
} from "./agent-pack.js";
import {
  buildMcpConfigDocument,
  buildMcpServerConfig,
  parseConfigRoot,
  REACT_SENTINEL_BINARY_NAME,
  REACT_SENTINEL_PUBLIC_PACKAGE_NAME,
  renderMcpConfigDocument,
  resolveDefaultConfigPath,
  type McpClient,
  type McpConfigRootKey,
  type McpServerConfig,
  validateServerConfig,
  type McpInstallMode,
  upsertServerConfig,
  removeServerConfig,
} from "./mcp-config.js";
import { detectProjectCandidates } from "./project-detection.js";
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
const DEFAULT_PUBLIC_CLIENT = "claude-code";
export const REACT_SENTINEL_VERSION =
  typeof packageVersion === "string" && semverPattern.test(packageVersion)
    ? packageVersion
    : "unknown";

if (REACT_SENTINEL_VERSION === "unknown") {
  console.warn("[react-sentinel] Warning: package.json version is missing or invalid; using \"unknown\".");
}

type CliCommand =
  | "start"
  | "mcp"
  | "init-mcp"
  | "install-agent-pack"
  | "update-agent-pack"
  | "uninstall-agent-pack"
  | "init-agent-pack"
  | "detect-project"
  | "doctor"
  | "help";

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
  client: McpClient | "auto";
  mode: McpInstallMode;
  serverName: string;
  replayHeadless: boolean;
  write: boolean;
  configPath: string | null;
};

type InitMcpClientDefinition = {
  id: McpClient;
  label: string;
  rootKey: McpConfigRootKey;
  supportsWrite: boolean;
  includeTransportType: boolean;
  detectPaths: (cwd: string) => string[];
  nextStep: string;
  limitation: string;
};

type DetectProjectCommandOptions = {
  path: string;
  json: boolean;
  targetUrl: string | null;
};

type InitAgentPackCommandOptions = {
  targetDirectory: string;
  mode: McpInstallMode;
  serverName: string;
  replayHeadless: boolean;
  configPath: string | null;
  write: boolean;
  force: boolean;
};

type UninstallAgentPackCommandOptions = {
  targetDirectory: string;
};

const initMcpClients: Record<McpClient, InitMcpClientDefinition> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    rootKey: "mcpServers",
    supportsWrite: true,
    includeTransportType: false,
    detectPaths: (cwd) => [resolveDefaultConfigPath({ client: "claude-code", cwd })],
    nextStep: "Restart Claude Code or reopen the project so the new MCP config is loaded.",
    limitation: "Project-local setup only; React-Sentinel does not manage global Claude Code config automatically.",
  },
  "claude-desktop": {
    id: "claude-desktop",
    label: "Claude Desktop",
    rootKey: "mcpServers",
    supportsWrite: true,
    includeTransportType: false,
    detectPaths: (cwd) => [resolveDefaultConfigPath({ client: "claude-desktop", cwd })],
    nextStep: "Restart Claude Desktop after saving the config.",
    limitation: "Desktop integration only covers the MCP server entry; prompts and routines stay in the repository docs.",
  },
  cursor: {
    id: "cursor",
    label: "Cursor",
    rootKey: "mcpServers",
    supportsWrite: true,
    includeTransportType: false,
    detectPaths: (cwd) => [resolveDefaultConfigPath({ client: "cursor", cwd })],
    nextStep: "Restart Cursor or reload the window so the MCP server is picked up.",
    limitation: "Only the MCP transport is auto-written; any Cursor-specific prompt workflow remains manual.",
  },
  "gemini-cli": {
    id: "gemini-cli",
    label: "Gemini CLI",
    rootKey: "mcpServers",
    supportsWrite: true,
    includeTransportType: false,
    detectPaths: (cwd) => [resolveDefaultConfigPath({ client: "gemini-cli", cwd })],
    nextStep: "Restart Gemini CLI in this project so it reloads .gemini/settings.json.",
    limitation: "Gemini-specific command aliases and prompt memory remain manual.",
  },
  "github-copilot": {
    id: "github-copilot",
    label: "GitHub Copilot / VS Code",
    rootKey: "servers",
    supportsWrite: true,
    includeTransportType: true,
    detectPaths: (cwd) => [resolveDefaultConfigPath({ client: "github-copilot", cwd })],
    nextStep: "Reload VS Code or reopen the workspace so Copilot can discover the MCP server.",
    limitation: "The generated file targets VS Code/Copilot workspace config; other Copilot surfaces may require manual adaptation.",
  },
  "generic-mcp": {
    id: "generic-mcp",
    label: "Generic MCP client",
    rootKey: "mcpServers",
    supportsWrite: false,
    includeTransportType: false,
    detectPaths: () => [],
    nextStep: "Paste the JSON snippet into your MCP client's config file and restart that client.",
    limitation: "No default config path is assumed because generic MCP clients do not share one standard location.",
  },
};

function formatInitMcpClientList(): string {
  return ["auto", ...Object.keys(initMcpClients)].join("|");
}

function getInitMcpClientDefinition(client: McpClient): InitMcpClientDefinition {
  return initMcpClients[client];
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function detectInitMcpClient(cwd: string): Promise<McpClient> {
  const detectionOrder: McpClient[] = ["cursor", "github-copilot", "gemini-cli", "claude-code", "claude-desktop"];

  for (const client of detectionOrder) {
    const definition = getInitMcpClientDefinition(client);
    for (const candidatePath of definition.detectPaths(cwd)) {
      if (await pathExists(candidatePath)) {
        return client;
      }
    }
  }

  return DEFAULT_PUBLIC_CLIENT;
}

function buildLaunchCommandPreview(serverConfig: McpServerConfig): string {
  return [serverConfig.command, ...serverConfig.args].join(" ");
}

function inferConfigRootKey(targetPath: string): McpConfigRootKey {
  return targetPath.endsWith(path.join(".vscode", "mcp.json")) ? "servers" : "mcpServers";
}

function buildServerInfoResponse(): {
  name: string;
  version: string;
  transport: "stdio";
  capabilities: Record<string, "planned" | "partial" | "available">;
  capabilityDetails: ReturnType<typeof createServerInfoPayload>["capabilityDetails"];
  capabilitiesByMode: ReturnType<typeof createServerInfoPayload>["capabilitiesByMode"];
} {
  return {
    name: REACT_SENTINEL_NAME,
    version: REACT_SENTINEL_VERSION,
    transport: "stdio",
    ...createServerInfoPayload(),
  };
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
        return ok(buildServerInfoResponse());
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
    const payload = buildServerInfoResponse();
    console.error(
      `[react-sentinel] Verbose startup metadata ${JSON.stringify({
        command: "mcp",
        transport: payload.transport,
        replayDefault: options.replayHeadless === false ? "headed" : "headless",
        cdpEndpoint: browserManager.getDefaultCdpEndpoint(),
        capabilitySummary: summarizeCapabilities(payload.capabilities),
        capabilities: payload.capabilities,
        capabilitiesByMode: payload.capabilitiesByMode,
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
    `Public npm package: ${REACT_SENTINEL_PUBLIC_PACKAGE_NAME}`,
    "",
    "Usage:",
    "  react-sentinel start [--headless|--headed] [--cdp-endpoint <url>]",
    "  react-sentinel mcp [--headless|--headed] [--cdp-endpoint <url>]",
    `  react-sentinel init-mcp [--client <${formatInitMcpClientList()}>] [--mode <local|global|npx>]`,
    "  react-sentinel init-agent-pack [--path <dir>] [--mode <local|global|npx>]",
    "  react-sentinel install-agent-pack [--path <dir>] [--mode <local|global|npx>]",
    "  react-sentinel update-agent-pack [--path <dir>] [--mode <local|global|npx>]",
    "  react-sentinel uninstall-agent-pack [--path <dir>]",
    "  react-sentinel detect-project [--path <dir>] [--target-url <url>] [--json]",
    "  react-sentinel doctor [--cdp-endpoint <url>] [--json]",
    "  react-sentinel help",
    "",
    "Commands:",
    "  start   Start the MCP server over stdio (default command).",
    "  mcp     Explicit stdio MCP server command for agent/client configs.",
    "  init-mcp  Print or write a ready-to-paste MCP config snippet for common agent and IDE targets.",
    "  init-agent-pack  Print the Claude Code-first agent-pack manifest prototype.",
    "  install-agent-pack  Install agent-pack files and write the MCP config entry.",
    "  update-agent-pack  Re-install agent-pack files, overwriting managed files and the MCP config entry.",
    "  uninstall-agent-pack  Remove agent-pack files and the managed MCP config entry.",
    "  detect-project  Detect likely React, Next.js, or Vite application roots from package.json files.",
    "  doctor  Check the local replay browser runtime and optional CDP attach endpoint.",
    "  help    Show this help message.",
    "",
    "Options:",
    `  --cdp-endpoint <url>  Override the default Chrome DevTools endpoint (default: ${DEFAULT_CDP_ENDPOINT}).`,
    "  --headed              Start replay sessions in visible Chromium mode by default.",
    "  --headless            Force replay sessions to stay headless (default).",
    "  --verbose             Print agent-friendly startup metadata to stderr.",
    "  --json                Print doctor results as JSON.",
    "  --path <dir>          Base directory scanned by detect-project (defaults to the current directory).",
    "  --target-url <url>    Manual URL fallback used when detect-project should trust a caller-provided target.",
    "  --config-path <path>  Validate an existing MCP config file during doctor, or override the config file path used with init-mcp --write.",
    `  --client <name>       Target MCP client for init-mcp (${formatInitMcpClientList()}).`,
    "  --mode <name>         Launch mode for init-mcp (local, global, or npx).",
    "  --server-name <name>  Server key used inside the generated mcpServers object.",
    "  --write               Write or merge the generated config into a config file.",
    "  --force               Overwrite existing managed files when using install-agent-pack or update-agent-pack.",
    "  -h, --help            Show help.",
    "  -v, --version         Show the CLI version.",
    "",
    "Examples:",
    `  npx -y ${REACT_SENTINEL_PUBLIC_PACKAGE_NAME} mcp --headed`,
    `  npx -y ${REACT_SENTINEL_PUBLIC_PACKAGE_NAME} doctor --json`,
    "  react-sentinel detect-project --path . --target-url http://127.0.0.1:3000 --json",
    "  react-sentinel doctor --config-path ~/.config/Claude/claude_desktop_config.json",
    "  react-sentinel init-mcp --client auto --mode npx",
    "  react-sentinel init-mcp --client claude-desktop --mode local",
    "  react-sentinel init-mcp --client github-copilot --mode npx --write",
    "  react-sentinel init-agent-pack --path . --mode npx",
    "  react-sentinel install-agent-pack --path . --mode local",
    "  react-sentinel update-agent-pack --path . --mode npx",
    "  react-sentinel uninstall-agent-pack --path .",
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

  const client = parsed.values.client ?? "auto";
  if (client !== "auto" && !(client in initMcpClients)) {
    throw new Error(`Invalid value for --client: "${client}". Use one of ${formatInitMcpClientList()}.`);
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
      client: client as InitMcpCommandOptions["client"],
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

function parseDetectProjectOptions(args: string[]): { options: DetectProjectCommandOptions; help: boolean; version: boolean } {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    options: {
      help: { type: "boolean", short: "h", default: false },
      json: { type: "boolean", default: false },
      path: { type: "string" },
      "target-url": { type: "string" },
      version: { type: "boolean", short: "v", default: false },
    },
  });

  const targetUrl = parsed.values["target-url"] ?? null;
  if (targetUrl) {
    try {
      new URL(targetUrl);
    } catch {
      throw new Error(`Invalid value for --target-url: "${targetUrl}". It must be an absolute URL.`);
    }
  }

  return {
    options: {
      path: path.resolve(parsed.values.path ?? process.cwd()),
      json: parsed.values.json,
      targetUrl,
    },
    help: parsed.values.help,
    version: parsed.values.version,
  };
}

function parseInitAgentPackOptions(args: string[]): {
  options: InitAgentPackCommandOptions;
  help: boolean;
  version: boolean;
} {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    options: {
      "config-path": { type: "string" },
      mode: { type: "string" },
      "server-name": { type: "string" },
      headless: { type: "boolean", default: false },
      headed: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      path: { type: "string" },
      write: { type: "boolean", short: "w", default: false },
      force: { type: "boolean", short: "f", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });

  if (parsed.values.headless && parsed.values.headed) {
    throw new Error("Choose either --headless or --headed, not both.");
  }

  const mode = (parsed.values.mode as McpInstallMode) ?? "local";
  if (mode !== "local" && mode !== "global" && mode !== "npx") {
    throw new Error(`Invalid value for --mode: "${mode}". Use "local", "global", or "npx".`);
  }

  const serverName = (parsed.values["server-name"] as string) ?? REACT_SENTINEL_NAME;
  if (!serverName.trim()) {
    throw new Error("Invalid value for --server-name: it must not be empty.");
  }

  return {
    options: {
      targetDirectory: path.resolve((parsed.values.path as string) ?? process.cwd()),
      mode,
      serverName,
      replayHeadless: parsed.values.headed ? false : parsed.values.headless ? true : true,
      configPath: (parsed.values["config-path"] as string) ?? null,
      write: (parsed.values.write as boolean) ?? false,
      force: (parsed.values.force as boolean) ?? false,
    },
    help: (parsed.values.help as boolean),
    version: (parsed.values.version as boolean),
  };
}

function parseUninstallAgentPackOptions(args: string[]): {
  options: UninstallAgentPackCommandOptions;
  help: boolean;
  version: boolean;
} {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    options: {
      help: { type: "boolean", short: "h", default: false },
      path: { type: "string" },
      version: { type: "boolean", short: "v", default: false },
    },
  });

  return {
    options: {
      targetDirectory: path.resolve((parsed.values.path as string) ?? process.cwd()),
    },
    help: (parsed.values.help as boolean),
    version: (parsed.values.version as boolean),
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
  const capabilitiesCheck = validateCapabilities();
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
    const rootKey = inferConfigRootKey(options.configPath);
    try {
      const root = parseConfigRoot(await readFile(options.configPath, "utf8"), rootKey);
      const validation = validateServerConfig(root, options.serverName, rootKey);
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
      capabilities: capabilitiesCheck,
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
      report.checks.capabilities.status === "pass"
        ? `PASS capability registry matches ${report.checks.capabilities.registeredTools.length} registered MCP tools`
        : "FAIL capability registry is inconsistent with the registered MCP tools",
    ];

    if (report.checks.attachEndpoint.status !== "pass") {
      lines.push(`Hint: ${report.checks.attachEndpoint.help}`);
    }

    if (report.checks.capabilities.status === "fail") {
      for (const issue of report.checks.capabilities.issues) {
        lines.push(`Hint: ${issue}`);
      }
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
    report.checks.capabilities.status === "fail" ||
    configCheck?.status === "fail"
  ) {
    process.exitCode = 1;
  }
}

async function runInitMcp(options: InitMcpCommandOptions): Promise<void> {
  const resolvedClient = options.client === "auto" ? await detectInitMcpClient(process.cwd()) : options.client;
  const clientDefinition = getInitMcpClientDefinition(resolvedClient);
  const snippetRootKey = options.write
    ? inferConfigRootKey(options.configPath ?? resolveDefaultConfigPath({ client: resolvedClient }))
    : clientDefinition.rootKey;
  const document = buildMcpConfigDocument({
    rootKey: snippetRootKey,
    mode: options.mode,
    serverName: options.serverName,
    replayHeadless: options.replayHeadless,
  });

  if (!options.write) {
    console.log(renderMcpConfigDocument(document));
    return;
  }

  if (!clientDefinition.supportsWrite) {
    throw new Error(
      `The "${clientDefinition.label}" target does not have a safe default config path. Re-run without --write and paste the snippet manually.`
    );
  }

  const targetPath = options.configPath ?? resolveDefaultConfigPath({ client: resolvedClient });
  const rootKey = inferConfigRootKey(targetPath);
  let configRoot: Record<string, unknown> = {};

  try {
    configRoot = parseConfigRoot(await readFile(targetPath, "utf8"), rootKey);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  const updatedRoot = upsertServerConfig({
    root: configRoot,
    rootKey,
    serverName: options.serverName,
    serverConfig: buildMcpServerConfig({
      mode: options.mode,
      replayHeadless: options.replayHeadless,
      includeTransportType: clientDefinition.includeTransportType,
    }),
  });

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(updatedRoot, null, 2)}\n`, "utf8");

  console.log(`Wrote MCP config for "${options.serverName}" to ${targetPath}.`);
  console.log(`Target: ${clientDefinition.label}`);
  console.log(
    `Launch command: ${buildLaunchCommandPreview(buildMcpServerConfig({
      mode: options.mode,
      replayHeadless: options.replayHeadless,
      includeTransportType: clientDefinition.includeTransportType,
    }))}`
  );
  console.log(`Limit: ${clientDefinition.limitation}`);
  console.log(clientDefinition.nextStep);
}

async function runDetectProject(options: DetectProjectCommandOptions): Promise<void> {
  const candidates = await detectProjectCandidates(options.path);
  const selected = candidates[0] ?? null;
  const resolvedTargetUrl = options.targetUrl ?? selected?.devServer.activeUrl ?? selected?.devServer.suggestedUrl ?? null;

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          basePath: options.path,
          manualTargetUrl: options.targetUrl,
          resolvedTargetUrl,
          selected,
          candidates,
        },
        null,
        2
      )
    );
    return;
  }

  if (!selected) {
    if (options.targetUrl) {
      console.log(`No React, Next.js, or Vite project was detected under ${options.path}.`);
      console.log(`Manual target URL: ${options.targetUrl}`);
      return;
    }

    console.log(`No React, Next.js, or Vite project was detected under ${options.path}.`);
    return;
  }

  const lines = [
    `Detected project root: ${selected.root}`,
    `Framework: ${selected.framework}`,
    `Package: ${selected.packageName ?? "(unnamed package)"}`,
    `Evidence: ${selected.evidence.join(", ")}`,
  ];

  if (selected.scripts.length > 0) {
    const recommended = selected.scripts.find((script) => script.recommendation === "recommended") ?? selected.scripts[0];
    lines.push(`Recommended script: npm run ${recommended.name}`);
    lines.push(
      `Relevant scripts: ${selected.scripts.map((script) => `${script.name} -> ${script.command}`).join(" | ")}`
    );
  }

  if (selected.devServer.activeUrl) {
    lines.push(`Active dev server: ${selected.devServer.activeUrl}`);
  } else if (selected.devServer.suggestedUrl) {
    lines.push(`Suggested dev server: ${selected.devServer.suggestedUrl}`);
  }

  if (options.targetUrl) {
    lines.push(`Manual target URL: ${options.targetUrl}`);
    lines.push(`Resolved target URL: ${resolvedTargetUrl}`);
  }

  if (selected.devServer.source) {
    lines.push(`URL source: ${selected.devServer.source}`);
  }

  if (candidates.length > 1) {
    lines.push(`Other candidates: ${candidates.slice(1).map((candidate) => candidate.root).join(", ")}`);
  }

  console.log(lines.join("\n"));
}

async function runInstallAgentPack(options: InitAgentPackCommandOptions): Promise<void> {
  const { manifest, templates } = await buildAgentPackManifest({
    targetDirectory: options.targetDirectory,
    reactSentinelVersion: REACT_SENTINEL_VERSION,
    serverName: options.serverName,
    mode: options.mode,
    replayHeadless: options.replayHeadless,
    configPath: options.configPath,
  });

  if (!options.write) {
    console.log(renderAgentPackManifest(manifest));
    console.log("\nHint: Use --write to install the pack and update the MCP config.");
    return;
  }

  // 1. Install files
  await installAgentPack({
    targetDirectory: options.targetDirectory,
    manifest,
    force: options.force,
    templates,
  });
  console.log(`Installed agent pack files to ${manifest.packRoot}`);

  // 2. Update MCP config
  const mcpConfigPath = manifest.mcpConfig.path;
  let configRoot: Record<string, unknown> = {};

  try {
    configRoot = parseConfigRoot(await readFile(mcpConfigPath, "utf8"));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  const updatedRoot = upsertServerConfig({
    root: configRoot,
    serverName: options.serverName,
    serverConfig: manifest.mcpConfig.serverConfig,
  });

  await mkdir(path.dirname(mcpConfigPath), { recursive: true });
  await writeFile(mcpConfigPath, `${JSON.stringify(updatedRoot, null, 2)}\n`, "utf8");

  console.log(`Updated MCP config at ${mcpConfigPath}`);
  console.log("Success! React-Sentinel agent pack is ready to use.");
}

async function runUninstallAgentPack(options: UninstallAgentPackCommandOptions): Promise<void> {
  const manifest = await readExistingAgentPackManifest(options.targetDirectory);
  const removedFiles = await uninstallAgentPack(options.targetDirectory);
  console.log(`Uninstalled agent pack files. Removed ${removedFiles.length} files.`);

  if (manifest) {
    const mcpConfigPath = manifest.mcpConfig.path;
    try {
      const configRoot = parseConfigRoot(await readFile(mcpConfigPath, "utf8"));
      const updatedRoot = removeServerConfig({
        root: configRoot,
        serverName: manifest.mcpConfig.serverName,
      });
      await writeFile(mcpConfigPath, `${JSON.stringify(updatedRoot, null, 2)}\n`, "utf8");
      console.log(`Removed "${manifest.mcpConfig.serverName}" from MCP config at ${mcpConfigPath}`);
    } catch (error) {
      // Ignore if config file missing
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        console.warn(`Warning: Could not update MCP config during uninstall: ${String(error)}`);
      }
    }
  }
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
      candidateCommand === "install-agent-pack" ||
      candidateCommand === "update-agent-pack" ||
      candidateCommand === "uninstall-agent-pack" ||
      candidateCommand === "init-agent-pack" ||
      candidateCommand === "detect-project" ||
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

  if (
    command === "install-agent-pack" ||
    command === "update-agent-pack" ||
    (command as string) === "init-agent-pack"
  ) {
    const parsed = parseInitAgentPackOptions(commandArgs);
    if (parsed.version) {
      console.log(REACT_SENTINEL_VERSION);
      return;
    }
    if (parsed.help) {
      console.log(formatHelp());
      return;
    }

    if (command === "update-agent-pack") {
      parsed.options.force = true;
      parsed.options.write = true;
    } else if (command === "install-agent-pack") {
      parsed.options.write = true;
    }

    await runInstallAgentPack(parsed.options);
    return;
  }

  if (command === "uninstall-agent-pack") {
    const parsed = parseUninstallAgentPackOptions(commandArgs);
    if (parsed.version) {
      console.log(REACT_SENTINEL_VERSION);
      return;
    }
    if (parsed.help) {
      console.log(formatHelp());
      return;
    }

    await runUninstallAgentPack(parsed.options);
    return;
  }

  if (command === "detect-project") {
    const parsed = parseDetectProjectOptions(commandArgs);
    if (parsed.version) {
      console.log(REACT_SENTINEL_VERSION);
      return;
    }
    if (parsed.help) {
      console.log(formatHelp());
      return;
    }

    await runDetectProject(parsed.options);
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
