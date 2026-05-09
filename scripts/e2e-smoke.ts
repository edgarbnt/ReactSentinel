import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type ToolSuccess = {
  ok: true;
  data: unknown;
};

type ToolFailure = {
  ok: false;
  error: string;
  raw: unknown;
};

type ToolOutcome = ToolSuccess | ToolFailure;

type ManagedProcess = {
  name: string;
  child: ChildProcess;
  logs: string[];
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const demoUrl = process.env.RS_E2E_URL ?? "http://127.0.0.1:5173";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const expectedTools = [
  "ping",
  "get_server_info",
  "echo",
  "get_session_status",
  "navigate_replay",
  "get_attach_status",
  "browser_ping",
  "get_attach_tabs",
  "select_attach_tab",
  "get_runtime_status",
  "get_react_tree",
  "inspect_component",
  "get_component_state",
  "get_console_events",
  "get_runtime_timeline",
  "get_network_events",
  "simulate_interaction",
  "validate_after_action",
  "validate_scenario",
  "replay_interactions",
  "apply_runtime_patch",
  "apply_patch_then_replay",
  "reset_runtime_patches",
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function stringifyError(error: unknown): string {
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
    const message = `[${prefix}] ${line}`;
    processHandle.logs.push(message);
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

async function ensureDemoApp(processes: ManagedProcess[]): Promise<{ reused: boolean }> {
  try {
    await waitForHttp(demoUrl, 1500);
    return { reused: true };
  } catch {
    const child = spawn(npmCommand, ["run", "dev", "--", "--host", "127.0.0.1"], {
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

function expectToolSuccess(outcome: ToolOutcome, toolName: string): unknown {
  assert(outcome.ok, `${toolName} returned an error: ${outcome.error}`);
  return outcome.data;
}

function expectToolFailure(outcome: ToolOutcome, toolName: string): ToolFailure {
  assert(!outcome.ok, `${toolName} was expected to fail gracefully but succeeded.`);
  return outcome;
}

async function callTool(
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

async function stopProcess(processHandle: ManagedProcess): Promise<void> {
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

async function main(): Promise<void> {
  const managedProcesses: ManagedProcess[] = [];
  const checks: string[] = [];
  let transport: StdioClientTransport | null = null;
  const serverLogs: string[] = [];

  try {
    const demo = await ensureDemoApp(managedProcesses);
    checks.push(`demo-app:${demo.reused ? "reused" : "started"}`);

    const client = new Client({
      name: "react-sentinel-e2e-smoke",
      version: "0.1.0",
    });

    transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"), path.join(repoRoot, "src", "index.ts")],
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
    checks.push("mcp-connect:ok");

    const toolsResult = await client.listTools();
    const toolNames = new Set(toolsResult.tools.map((tool) => tool.name));
    for (const toolName of expectedTools) {
      assert(toolNames.has(toolName), `tools/list is missing "${toolName}".`);
    }
    checks.push(`tools/list:${toolsResult.tools.length}`);

    const ping = expectToolSuccess(await callTool(client, "ping"), "ping") as { status: string };
    assert(ping.status === "online", "ping did not report online status.");
    checks.push("ping:ok");

    const serverInfo = expectToolSuccess(await callTool(client, "get_server_info"), "get_server_info") as {
      capabilities: Record<string, string>;
    };
    assert(serverInfo.capabilities.shadow_sandbox === "available", "shadow_sandbox capability is not available.");
    assert(serverInfo.capabilities.apply_patch_then_replay === "available", "apply_patch_then_replay capability missing.");
    checks.push("get_server_info:ok");

    const echo = expectToolSuccess(await callTool(client, "echo", { message: "react-sentinel-e2e" }), "echo") as {
      echo: string;
    };
    assert(echo.echo === "react-sentinel-e2e", "echo did not round-trip the message.");
    checks.push("echo:ok");

    const attachStatus = expectToolSuccess(await callTool(client, "get_attach_status"), "get_attach_status") as {
      ready: boolean;
      status: string;
    };
    checks.push(`get_attach_status:${attachStatus.status}`);

    const attachTabsOutcome = await callTool(client, "get_attach_tabs");
    if (attachStatus.ready) {
      const attachTabs = expectToolSuccess(attachTabsOutcome, "get_attach_tabs") as { tabs: unknown[] };
      assert(Array.isArray(attachTabs.tabs), "get_attach_tabs did not return a tabs array.");
    } else {
      expectToolFailure(attachTabsOutcome, "get_attach_tabs");
    }
    checks.push("get_attach_tabs:ok");

    const selectAttachOutcome = await callTool(client, "select_attach_tab", {
      selector: { kind: "index", index: 0 },
      confirm: false,
    });
    if (attachStatus.ready) {
      const selection = expectToolSuccess(selectAttachOutcome, "select_attach_tab") as { found: boolean };
      assert(typeof selection.found === "boolean", "select_attach_tab did not return a found flag.");
    } else {
      expectToolFailure(selectAttachOutcome, "select_attach_tab");
    }
    checks.push("select_attach_tab:ok");

    const browserPing = expectToolSuccess(await callTool(client, "browser_ping", { url: demoUrl }), "browser_ping") as {
      pong: boolean;
      title: string;
    };
    assert(browserPing.pong === true, "browser_ping did not report pong.");
    assert(browserPing.title.includes("React-Sentinel Test App"), "browser_ping title mismatch.");
    checks.push("browser_ping:ok");

    const sessionStatus = expectToolSuccess(await callTool(client, "get_session_status"), "get_session_status") as {
      mode: string;
      replay: { active: boolean };
    };
    assert(sessionStatus.mode === "replay", "get_session_status did not stay in replay mode.");
    assert(sessionStatus.replay.active === true, "replay session is not active after browser_ping.");
    checks.push("get_session_status:ok");

    const navigateReplay = expectToolSuccess(
      await callTool(client, "navigate_replay", { url: demoUrl, resetSession: true }),
      "navigate_replay"
    ) as { url: string };
    assert(navigateReplay.url === demoUrl || navigateReplay.url === `${demoUrl}/`, "navigate_replay URL mismatch.");
    checks.push("navigate_replay:ok");

    const runtimeStatus = expectToolSuccess(await callTool(client, "get_runtime_status", { url: demoUrl }), "get_runtime_status") as {
      react: { detected: boolean };
    };
    assert(runtimeStatus.react.detected === true, "React was not detected by get_runtime_status.");
    checks.push("get_runtime_status:ok");

    const reactTree = expectToolSuccess(
      await callTool(client, "get_react_tree", { url: demoUrl, maxDepth: 3 }),
      "get_react_tree"
    ) as { tree: unknown };
    assert(reactTree.tree !== null, "get_react_tree returned no tree.");
    checks.push("get_react_tree:ok");

    const inspectComponent = expectToolSuccess(
      await callTool(client, "inspect_component", {
        url: demoUrl,
        componentName: "ThemePreview",
        responseMode: "compact",
      }),
      "inspect_component"
    ) as { found: boolean; component: { contexts: unknown[] } | null };
    assert(inspectComponent.found === true, "inspect_component did not find ThemePreview.");
    assert((inspectComponent.component?.contexts.length ?? 0) >= 1, "ThemePreview contexts were not surfaced.");
    checks.push("inspect_component:ok");

    const componentState = expectToolSuccess(
      await callTool(client, "get_component_state", {
        url: demoUrl,
        componentName: "ThemeContextScenario",
        responseMode: "compact",
      }),
      "get_component_state"
    ) as { found: boolean; state: { hooks: unknown[] } | null };
    assert(componentState.found === true, "get_component_state did not find ThemeContextScenario.");
    assert((componentState.state?.hooks.length ?? 0) >= 2, "ThemeContextScenario hooks were not extracted.");
    checks.push("get_component_state:ok");

    const simulateInteraction = expectToolSuccess(
      await callTool(client, "simulate_interaction", {
        url: demoUrl,
        action: "click",
        selector: "#counter-button",
      }),
      "simulate_interaction"
    ) as { success: boolean };
    assert(simulateInteraction.success === true, "simulate_interaction failed.");
    checks.push("simulate_interaction:ok");

    const validateAfterAction = expectToolSuccess(
      await callTool(client, "validate_after_action", {
        url: demoUrl,
        interaction: {
          action: "click",
          selector: "#theme-accent-button",
        },
        assertion: {
          type: "text_present",
          expected: "#0f766e",
        },
        waitMs: 200,
      }),
      "validate_after_action"
    ) as { validation: { pass: boolean } };
    assert(validateAfterAction.validation.pass === true, "validate_after_action did not validate the accent toggle.");
    checks.push("validate_after_action:ok");

    const replayInteractions = expectToolSuccess(
      await callTool(client, "replay_interactions", {
        url: demoUrl,
        resetSession: true,
        steps: [
          { action: "click", selector: "#mock-success-button" },
          { action: "wait", durationMs: 300 },
        ],
      }),
      "replay_interactions"
    ) as { success: boolean };
    assert(replayInteractions.success === true, "replay_interactions failed on the mock success flow.");
    checks.push("replay_interactions:ok");

    const networkEvents = expectToolSuccess(
      await callTool(client, "get_network_events", { url: demoUrl, limit: 20 }),
      "get_network_events"
    ) as { summary: { total: number; urls: string[] } };
    assert(networkEvents.summary.total >= 1, "get_network_events captured no requests.");
    assert(
      networkEvents.summary.urls.some((entry) => entry.includes("/api/mock/success")),
      "get_network_events did not capture the mock success request."
    );
    checks.push("get_network_events:ok");

    const consoleEvents = expectToolSuccess(await callTool(client, "get_console_events", { url: demoUrl }), "get_console_events") as {
      events: { type: string }[];
    };
    assert(
      consoleEvents.events.every((event) => event.type !== "error" && event.type !== "exception"),
      "get_console_events captured an unexpected error or exception."
    );
    checks.push("get_console_events:ok");

    const runtimeTimeline = expectToolSuccess(
      await callTool(client, "get_runtime_timeline", { url: demoUrl }),
      "get_runtime_timeline"
    ) as { summary: { bySource: Record<string, number> } };
    assert((runtimeTimeline.summary.bySource.network ?? 0) >= 1, "get_runtime_timeline did not include network events.");
    checks.push("get_runtime_timeline:ok");

    const validateScenario = expectToolSuccess(
      await callTool(client, "validate_scenario", {
        url: demoUrl,
        resetSession: true,
        steps: [
          { action: "click", selector: "#mock-success-button" },
          { action: "wait", durationMs: 300 },
        ],
        assertions: [
          { type: "text_present", expected: "Success: 200 — Mock success response" },
          { type: "selector_visible", selector: "#mock-success-result" },
          { type: "no_http_5xx" },
        ],
      }),
      "validate_scenario"
    ) as { report: { success: boolean } };
    assert(validateScenario.report.success === true, "validate_scenario did not pass on the mock success scenario.");
    checks.push("validate_scenario:ok");

    const runtimePatch = {
      type: "script",
      target: "page",
      source: `
        const originalFetch = window.fetch.bind(window);
        if (!window.__RS_E2E_FETCH_PATCH__) {
          window.__RS_E2E_FETCH_PATCH__ = true;
          window.fetch = async (input, init) => {
            const requestUrl = typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url;
            if (requestUrl.includes("/api/mock/error")) {
              return new Response(
                JSON.stringify({ scenario: "patched", message: "Patched success response" }),
                {
                  status: 200,
                  headers: { "content-type": "application/json" },
                }
              );
            }
            return originalFetch(input, init);
          };
        }
        return { patched: true };
      `,
      metadata: {
        id: "e2e-mock-error-fix",
        label: "e2e-mock-error-fix",
        source: "test",
        expiresWithSession: true,
      },
    };

    const applyRuntimePatch = expectToolSuccess(
      await callTool(client, "apply_runtime_patch", {
        url: demoUrl,
        resetSession: true,
        patch: runtimePatch,
      }),
      "apply_runtime_patch"
    ) as { currentDocument: { status: string } };
    assert(
      applyRuntimePatch.currentDocument.status === "applied" ||
        applyRuntimePatch.currentDocument.status === "already_applied",
      "apply_runtime_patch did not report an applied patch."
    );
    checks.push("apply_runtime_patch:ok");

    const patchedSession = expectToolSuccess(await callTool(client, "get_session_status"), "get_session_status") as {
      replay: { patches: { activeCount: number } };
    };
    assert(patchedSession.replay.patches.activeCount >= 1, "get_session_status did not expose the active runtime patch.");
    checks.push("get_session_status:patched-ok");

    const resetRuntimePatches = expectToolSuccess(
      await callTool(client, "reset_runtime_patches", {
        strategy: "reset_session",
        reopenUrl: demoUrl,
      }),
      "reset_runtime_patches"
    ) as { removedCount: number; session: { replay: { patches: { activeCount: number } } } };
    assert(resetRuntimePatches.removedCount >= 1, "reset_runtime_patches removed no patches.");
    assert(
      resetRuntimePatches.session.replay.patches.activeCount === 0,
      "reset_runtime_patches left runtime patches active."
    );
    checks.push("reset_runtime_patches:ok");

    const patchedReplay = expectToolSuccess(
      await callTool(client, "apply_patch_then_replay", {
        url: demoUrl,
        resetSession: true,
        patch: runtimePatch,
        steps: [
          { action: "click", selector: "#mock-error-button" },
          { action: "wait", durationMs: 300 },
        ],
        assertions: [
          { type: "text_present", expected: "Error: 200 — Patched success response" },
          { type: "no_http_5xx" },
        ],
        cleanup: "reset_session",
      }),
      "apply_patch_then_replay"
    ) as { verdict: string; cleanup?: { strategy: string } };
    assert(patchedReplay.verdict === "patch_validated", "apply_patch_then_replay did not return patch_validated.");
    assert(patchedReplay.cleanup?.strategy === "reset_session", "apply_patch_then_replay cleanup strategy mismatch.");
    checks.push("apply_patch_then_replay:ok");

    console.log(
      JSON.stringify(
        {
          ok: true,
          demoUrl,
          toolCount: expectedTools.length,
          checks,
        },
        null,
        2
      )
    );

    await transport.close();
  } catch (error) {
    console.error("E2E smoke test failed.");
    console.error(stringifyError(error));
    for (const processHandle of managedProcesses) {
      if (processHandle.logs.length > 0) {
        console.error(`--- ${processHandle.name} logs ---`);
        for (const line of processHandle.logs.slice(-40)) {
          console.error(line);
        }
      }
    }
    if (serverLogs.length > 0) {
      console.error("--- MCP server logs ---");
      for (const line of serverLogs.slice(-40)) {
        console.error(line);
      }
    }
    process.exitCode = 1;
  } finally {
    if (transport) {
      await transport.close().catch(() => undefined);
    }
    await Promise.all(managedProcesses.map((processHandle) => stopProcess(processHandle)));
  }
}

void main();
