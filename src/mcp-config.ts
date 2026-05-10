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
