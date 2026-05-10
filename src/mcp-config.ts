import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type McpClient =
  | "claude-code"
  | "claude-desktop"
  | "cursor"
  | "gemini-cli"
  | "github-copilot"
  | "generic-mcp";
export type McpInstallMode = "local" | "global" | "npx";
export type McpConfigRootKey = "mcpServers" | "servers";

export type McpServerConfig = {
  type?: "stdio";
  command: string;
  args: string[];
};

export type McpConfigDocument = Partial<Record<McpConfigRootKey, Record<string, McpServerConfig>>> & JsonObject;

export type JsonObject = Record<string, unknown>;

export type McpConfigValidation = {
  status: "pass" | "fail";
  issues: string[];
  command: string | null;
  args: string[] | null;
};

export const REACT_SENTINEL_BINARY_NAME = "react-sentinel";
export const REACT_SENTINEL_PUBLIC_PACKAGE_NAME = "@edgarbrunet/react-sentinel";
export const REACT_SENTINEL_LEGACY_PUBLIC_PACKAGE_NAME = "react-sentinel";
const acceptedNpxPackageNames = [REACT_SENTINEL_PUBLIC_PACKAGE_NAME, REACT_SENTINEL_LEGACY_PUBLIC_PACKAGE_NAME];

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiledCliEntry = path.join(packageRoot, "dist", "index.js");

function createLaunchArgs(replayHeadless: boolean): string[] {
  return ["mcp", replayHeadless ? "--headless" : "--headed"];
}

export function buildMcpServerConfig(options: {
  mode: McpInstallMode;
  replayHeadless: boolean;
  includeTransportType?: boolean;
}): McpServerConfig {
  const launchArgs = createLaunchArgs(options.replayHeadless);

  if (options.mode === "local") {
    return {
      ...(options.includeTransportType ? { type: "stdio" as const } : {}),
      command: "node",
      args: [compiledCliEntry, ...launchArgs],
    };
  }

  if (options.mode === "global") {
    return {
      ...(options.includeTransportType ? { type: "stdio" as const } : {}),
      command: REACT_SENTINEL_BINARY_NAME,
      args: launchArgs,
    };
  }

  return {
    ...(options.includeTransportType ? { type: "stdio" as const } : {}),
    command: "npx",
    args: ["-y", REACT_SENTINEL_PUBLIC_PACKAGE_NAME, ...launchArgs],
  };
}

export function buildMcpConfigDocument(options: {
  rootKey?: McpConfigRootKey;
  mode: McpInstallMode;
  serverName: string;
  replayHeadless: boolean;
}): McpConfigDocument {
  const rootKey = options.rootKey ?? "mcpServers";

  return {
    [rootKey]: {
      [options.serverName]: buildMcpServerConfig({
        mode: options.mode,
        replayHeadless: options.replayHeadless,
        includeTransportType: rootKey === "servers",
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

  if (options.client === "cursor") {
    return path.join(cwd, ".cursor", "mcp.json");
  }

  if (options.client === "gemini-cli") {
    return path.join(cwd, ".gemini", "settings.json");
  }

  if (options.client === "github-copilot") {
    return path.join(cwd, ".vscode", "mcp.json");
  }

  if (options.client === "generic-mcp") {
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

export function parseConfigRoot(raw: string, rootKey: McpConfigRootKey = "mcpServers"): JsonObject {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("MCP config root must be a JSON object.");
  }

  const root = parsed as JsonObject;
  const existingServers = root[rootKey];
  if (
    existingServers !== undefined &&
    (typeof existingServers !== "object" || existingServers === null || Array.isArray(existingServers))
  ) {
    throw new Error(`The ${rootKey} property must be a JSON object.`);
  }

  return root;
}

export function upsertServerConfig(options: {
  root: JsonObject;
  rootKey?: McpConfigRootKey;
  serverName: string;
  serverConfig: McpServerConfig;
}): JsonObject {
  const rootKey = options.rootKey ?? "mcpServers";
  const existingServers = options.root[rootKey];
  if (
    existingServers !== undefined &&
    (typeof existingServers !== "object" || existingServers === null || Array.isArray(existingServers))
  ) {
    throw new Error(`The ${rootKey} property must be a JSON object.`);
  }

  return {
    ...options.root,
    [rootKey]: {
      ...(existingServers as Record<string, unknown> | undefined),
      [options.serverName]: options.serverConfig,
    },
  };
}

export function removeServerConfig(options: {
  root: JsonObject;
  rootKey?: McpConfigRootKey;
  serverName: string;
}): JsonObject {
  const rootKey = options.rootKey ?? "mcpServers";
  const existingServers = options.root[rootKey];
  if (
    existingServers !== undefined &&
    (typeof existingServers !== "object" || existingServers === null || Array.isArray(existingServers))
  ) {
    throw new Error(`The ${rootKey} property must be a JSON object.`);
  }

  if (!existingServers) {
    return options.root;
  }

  const { [options.serverName]: _, ...remainingServers } = existingServers as Record<string, unknown>;

  return {
    ...options.root,
    [rootKey]: remainingServers,
  };
}

export function validateServerConfig(
  root: JsonObject,
  serverName: string,
  rootKey: McpConfigRootKey = "mcpServers",
): McpConfigValidation {
  const issues: string[] = [];
  const rawServers = root[rootKey];
  if (rawServers === undefined) {
    return {
      status: "fail",
      issues: [`Missing top-level ${rootKey} object.`],
      command: null,
      args: null,
    };
  }

  if (typeof rawServers !== "object" || rawServers === null || Array.isArray(rawServers)) {
    return {
      status: "fail",
      issues: [`The ${rootKey} property must be a JSON object.`],
      command: null,
      args: null,
    };
  }

  const serverEntry = (rawServers as Record<string, unknown>)[serverName];
  if (serverEntry === undefined) {
    return {
      status: "fail",
      issues: [`Missing ${rootKey}.${serverName} entry.`],
      command: null,
      args: null,
    };
  }

  if (typeof serverEntry !== "object" || serverEntry === null || Array.isArray(serverEntry)) {
    return {
      status: "fail",
      issues: [`The ${rootKey}.${serverName} entry must be a JSON object.`],
      command: null,
      args: null,
    };
  }

  const command = typeof (serverEntry as Record<string, unknown>).command === "string"
    ? (serverEntry as Record<string, unknown>).command as string
    : null;
  const rawArgs = (serverEntry as Record<string, unknown>).args;
  const args = Array.isArray(rawArgs) && rawArgs.every((value) => typeof value === "string")
    ? rawArgs as string[]
    : null;

  if (!command || !command.trim()) {
    issues.push(`The ${rootKey}.${serverName}.command value is missing or empty.`);
  }

  if (!args) {
    issues.push(`The ${rootKey}.${serverName}.args value must be an array of strings.`);
  }

  if (command === "node" && args) {
    if (!args[0]) {
      issues.push("The node command requires the CLI entry path as its first argument.");
    } else if (!path.isAbsolute(args[0])) {
      issues.push(`The local node entry path must be absolute: received "${args[0]}".`);
    }

    if (!args[1] || (args[1] !== "mcp" && args[1] !== "start")) {
      issues.push('The node command must launch React-Sentinel with "mcp" or "start" as the first CLI argument.');
    }
  }

  if (command === REACT_SENTINEL_BINARY_NAME && args && (!args[0] || (args[0] !== "mcp" && args[0] !== "start"))) {
    issues.push('The global react-sentinel command must receive "mcp" or "start" as its first argument.');
  }

  if (command === "npx" && args) {
    const packageIndex = args.findIndex((value) => acceptedNpxPackageNames.includes(value));
    if (packageIndex === -1) {
      issues.push(
        `The npx command must reference "${REACT_SENTINEL_PUBLIC_PACKAGE_NAME}" (or the legacy "${REACT_SENTINEL_LEGACY_PUBLIC_PACKAGE_NAME}") in args.`
      );
    } else {
      const launchCommand = args[packageIndex + 1];
      if (!launchCommand || (launchCommand !== "mcp" && launchCommand !== "start")) {
        issues.push('The npx command must launch React-Sentinel with "mcp" or "start" after the package name.');
      }
    }
  }

  return {
    status: issues.length === 0 ? "pass" : "fail",
    issues,
    command,
    args,
  };
}
