import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export type ToolSuccess = {
  ok: true;
  data: unknown;
};

export type ToolFailure = {
  ok: false;
  error: string;
  raw: unknown;
};

export type ToolOutcome = ToolSuccess | ToolFailure;

export type ManagedProcess = {
  name: string;
  child: ChildProcess;
  logs: string[];
};

export type ServerLaunchInfo = {
  mode: "compiled-mcp" | "source-mcp";
  command: string;
  args: string[];
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..");
export const demoUrl = process.env.RS_E2E_URL ?? "http://127.0.0.1:5173";
const demoTarget = new URL(demoUrl);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function stringifyError(error: unknown): string {
  return error instanceof Error ? error.stack || error.message : String(error);
}

function toEnvRecord(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function attachLogs(processHandle: ManagedProcess, prefix: string, data: Buffer | string): void {
  const text = String(data);
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    processHandle.logs.push(`[${prefix}] ${line}`);
  }
}

function createManagedProcess(name: string, child: ChildProcess): ManagedProcess {
  const processHandle: ManagedProcess = {
    name,
    child,
    logs: [],
  };

  child.stdout?.on("data", (chunk) => attachLogs(processHandle, `${name}:stdout`, chunk));
  child.stderr?.on("data", (chunk) => attachLogs(processHandle, `${name}:stderr`, chunk));
  return processHandle;
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "No response received yet.";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

export async function ensureDemoApp(processes: ManagedProcess[]): Promise<{ reused: boolean }> {
  try {
    await waitForHttp(demoUrl, 1500);
    return { reused: true };
  } catch {
    const args = ["run", "dev", "--", "--host", demoTarget.hostname];
    if (demoTarget.port) {
      args.push("--port", demoTarget.port);
    }

    const child = spawn(npmCommand, args, {
      cwd: path.join(repoRoot, "examples", "test-app"),
      env: toEnvRecord(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const managed = createManagedProcess("demo-app", child);
    processes.push(managed);
    await waitForHttp(demoUrl, 30_000);
    return { reused: false };
  }
}

function extractTextContent(result: unknown): string {
  assert(typeof result === "object" && result !== null, "Tool result must be an object.");
  const content = Reflect.get(result, "content");
  assert(Array.isArray(content), "Tool result content is missing.");
  const textItem = content.find(
    (item): item is { type: "text"; text: string } =>
      typeof item === "object" &&
      item !== null &&
      Reflect.get(item, "type") === "text" &&
      typeof Reflect.get(item, "text") === "string"
  );
  assert(textItem, "Tool result does not contain text content.");
  return textItem.text;
}

function parseToolPayload(result: unknown): ToolOutcome {
  const text = extractTextContent(result);
  try {
    const parsed = JSON.parse(text) as { error?: boolean; message?: string };
    if (parsed?.error === true) {
      return {
        ok: false,
        error: typeof parsed.message === "string" ? parsed.message : text,
        raw: parsed,
      };
    }
    return {
      ok: true,
      data: parsed,
    };
  } catch {
    return {
      ok: true,
      data: text,
    };
  }
}

export function expectToolSuccess(outcome: ToolOutcome, toolName: string): unknown {
  assert(outcome.ok, `${toolName} returned an error: ${outcome.error}`);
  return outcome.data;
}

export function expectToolFailure(outcome: ToolOutcome, toolName: string): ToolFailure {
  assert(!outcome.ok, `${toolName} was expected to fail gracefully but succeeded.`);
  return outcome;
}

export async function callTool(
  client: Client,
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<ToolOutcome> {
  const result = await client.callTool({
    name: toolName,
    arguments: args,
  });
  return parseToolPayload(result);
}

export async function stopProcess(processHandle: ManagedProcess): Promise<void> {
  if (processHandle.child.exitCode !== null || processHandle.child.killed) {
    return;
  }

  processHandle.child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => {
      processHandle.child.once("exit", () => resolve());
    }),
    delay(5000).then(() => {
      if (processHandle.child.exitCode === null && !processHandle.child.killed) {
        processHandle.child.kill("SIGKILL");
      }
    }),
  ]);
}

export async function connectMcpClient(
  serverLogs: string[],
  clientInfo: { name: string; version: string }
): Promise<{ client: Client; transport: StdioClientTransport; launch: ServerLaunchInfo }> {
  const compiledEntry = path.join(repoRoot, "dist", "index.js");
  let launch: ServerLaunchInfo;

  try {
    await access(compiledEntry);
    launch = {
      mode: "compiled-mcp",
      command: process.execPath,
      args: [compiledEntry, "mcp", "--verbose"],
    };
  } catch {
    launch = {
      mode: "source-mcp",
      command: process.execPath,
      args: [path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"), path.join(repoRoot, "src", "index.ts"), "mcp", "--verbose"],
    };
  }

  const client = new Client(clientInfo);
  const transport = new StdioClientTransport({
    command: launch.command,
    args: launch.args,
    cwd: repoRoot,
    env: toEnvRecord(),
    stderr: "pipe",
  });

  transport.stderr?.on("data", (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (!line.trim()) continue;
      serverLogs.push(`[mcp-server] ${line}`);
    }
  });

  await client.connect(transport);
  return { client, transport, launch };
}
