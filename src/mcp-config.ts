import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type McpClient = "claude-code" | "claude-desktop";
export type McpInstallMode = "local" | "global" | "npx";

export type McpServerConfig = {
  command: string;
  args: string[];
};

export type McpConfigDocument = {
  mcpServers: Record<string, McpServerConfig>;
};

export type JsonObject = Record<string, unknown>;

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiledCliEntry = path.join(packageRoot, "dist", "index.js");

function createLaunchArgs(replayHeadless: boolean): string[] {
  return ["mcp", replayHeadless ? "--headless" : "--headed"];
}

export function buildMcpServerConfig(options: {
  mode: McpInstallMode;
  replayHeadless: boolean;
}): McpServerConfig {
  const launchArgs = createLaunchArgs(options.replayHeadless);

  if (options.mode === "local") {
    return {
      command: "node",
      args: [compiledCliEntry, ...launchArgs],
    };
  }

  if (options.mode === "global") {
    return {
      command: "react-sentinel",
      args: launchArgs,
    };
  }

  return {
    command: "npx",
    args: ["-y", "react-sentinel", ...launchArgs],
  };
}

export function buildMcpConfigDocument(options: {
  client: McpClient;
  mode: McpInstallMode;
  serverName: string;
  replayHeadless: boolean;
}): McpConfigDocument {
  return {
    mcpServers: {
      [options.serverName]: buildMcpServerConfig({
        mode: options.mode,
        replayHeadless: options.replayHeadless,
      }),
    },
  };
}

export function renderMcpConfigDocument(document: McpConfigDocument): string {
  return JSON.stringify(document, null, 2);
}

export function resolveDefaultConfigPath(options: {
  client: McpClient;
  cwd?: string;
  homeDir?: string;
  appDataDir?: string;
  platform?: NodeJS.Platform;
}): string {
  const cwd = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? os.homedir();
  const platform = options.platform ?? process.platform;

  if (options.client === "claude-code") {
    return path.join(cwd, ".mcp.json");
  }

  if (platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }

  if (platform === "win32") {
    const appDataDir = options.appDataDir ?? process.env.APPDATA ?? path.join(homeDir, "AppData", "Roaming");
    return path.join(appDataDir, "Claude", "claude_desktop_config.json");
  }

  return path.join(homeDir, ".config", "Claude", "claude_desktop_config.json");
}

export function parseConfigRoot(raw: string): JsonObject {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("MCP config root must be a JSON object.");
  }

  const root = parsed as JsonObject;
  const existingServers = root.mcpServers;
  if (
    existingServers !== undefined &&
    (typeof existingServers !== "object" || existingServers === null || Array.isArray(existingServers))
  ) {
    throw new Error("The mcpServers property must be a JSON object.");
  }

  return root;
}

export function upsertServerConfig(options: {
  root: JsonObject;
  serverName: string;
  serverConfig: McpServerConfig;
}): JsonObject {
  const existingServers = options.root.mcpServers;
  if (
    existingServers !== undefined &&
    (typeof existingServers !== "object" || existingServers === null || Array.isArray(existingServers))
  ) {
    throw new Error("The mcpServers property must be a JSON object.");
  }

  return {
    ...options.root,
    mcpServers: {
      ...(existingServers as Record<string, unknown> | undefined),
      [options.serverName]: options.serverConfig,
    },
  };
}
