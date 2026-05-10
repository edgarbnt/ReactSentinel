import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ManagedProcess } from "./mcp-e2e-utils.js";
import {
  assert,
  callTool,
  connectMcpClient,
  demoUrl,
  ensureDemoApp,
  expectToolFailure,
  expectToolSuccess,
  stopProcess,
  stringifyError,
} from "./mcp-e2e-utils.js";
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
  "get_async_timeline",
  "get_race_condition_diagnosis",
  "get_hydration_issues",
  "get_render_counts",
  "get_render_hotspots",
  "get_hook_changes",
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
];

async function main(): Promise<void> {
  const managedProcesses: ManagedProcess[] = [];
  const checks: string[] = [];
  let transport: StdioClientTransport | null = null;
  const serverLogs: string[] = [];
  const hydrationDemoUrl = new URL("/hydration-nextjs.html", demoUrl).toString();

  try {
    const demo = await ensureDemoApp(managedProcesses);
    checks.push(`demo-app:${demo.reused ? "reused" : "started"}`);

    const { client, transport: connectedTransport } = await connectMcpClient(serverLogs, {
      name: "react-sentinel-e2e-smoke",
      version: "0.1.0",
    });
    transport = connectedTransport;
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
    assert(serverInfo.capabilities.get_async_timeline === "available", "get_async_timeline capability missing.");
    assert(
      serverInfo.capabilities.get_race_condition_diagnosis === "available",
      "get_race_condition_diagnosis capability missing."
    );
    assert(serverInfo.capabilities.get_hydration_issues === "available", "get_hydration_issues capability missing.");
    assert(serverInfo.capabilities.get_render_counts === "available", "get_render_counts capability missing.");
    assert(serverInfo.capabilities.get_render_hotspots === "available", "get_render_hotspots capability missing.");
    assert(serverInfo.capabilities.get_hook_changes === "available", "get_hook_changes capability missing.");
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

    const renderLoopReplay = expectToolSuccess(
      await callTool(client, "replay_interactions", {
        url: demoUrl,
        steps: [
          { action: "click", selector: "#render-loop-start-button" },
          { action: "wait", durationMs: 400 },
        ],
      }),
      "replay_interactions(render-loop)"
    ) as { success: boolean };
    assert(renderLoopReplay.success === true, "render loop replay failed.");
    checks.push("render-loop:ok");

    const renderCounts = expectToolSuccess(
      await callTool(client, "get_render_counts", { url: demoUrl, limit: 20 }),
      "get_render_counts"
    ) as {
      counts: { componentName: string; count: number }[];
      summary: { totalComponents: number };
    };
    assert(renderCounts.summary.totalComponents >= 1, "get_render_counts reported no observed components.");
    assert(
      renderCounts.counts.some((entry) => entry.componentName === "InfiniteLoopScenario" && entry.count >= 4),
      "get_render_counts did not observe InfiniteLoopScenario renders."
    );
    checks.push("get_render_counts:ok");

    const renderHotspots = expectToolSuccess(
      await callTool(client, "get_render_hotspots", {
        url: demoUrl,
        threshold: 4,
        windowMs: 2000,
        limit: 10,
      }),
      "get_render_hotspots"
    ) as {
      hotspots: { componentName: string; probableCause: { type: string; summary: string } }[];
    };
    assert(
      renderHotspots.hotspots.some(
        (entry) =>
          entry.componentName === "InfiniteLoopScenario" &&
          ["unstable_state", "unstable_hook_value", "unstable_props", "repeated_effect"].includes(
            entry.probableCause.type
          )
      ),
      "get_render_hotspots did not flag InfiniteLoopScenario with a probable cause."
    );
    checks.push("get_render_hotspots:ok");

    const hookChanges = expectToolSuccess(
      await callTool(client, "get_hook_changes", {
        url: demoUrl,
        componentName: "InfiniteLoopScenario",
        limit: 20,
      }),
      "get_hook_changes"
    ) as {
      found: boolean;
      changes: { hookKind: string }[];
      summary: { suspiciousHooks: { suspected: boolean }[]; probableCause: string };
    };
    assert(hookChanges.found === true, "get_hook_changes did not find InfiniteLoopScenario.");
    assert(hookChanges.changes.length >= 1, "get_hook_changes returned no hook diffs.");
    assert(
      hookChanges.summary.suspiciousHooks.some((entry) => entry.suspected) ||
        hookChanges.summary.probableCause.toLowerCase().includes("hook") ||
        hookChanges.summary.probableCause.toLowerCase().includes("state"),
      "get_hook_changes did not surface a probable unstable hook value."
    );
    checks.push("get_hook_changes:ok");

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

    const asyncTraceReplay = expectToolSuccess(
      await callTool(client, "replay_interactions", {
        url: demoUrl,
        resetSession: true,
        steps: [
          { action: "click", selector: "#async-trace-run-button" },
          { action: "wait", durationMs: 900 },
        ],
      }),
      "replay_interactions(async-trace)"
    ) as { success: boolean };
    assert(asyncTraceReplay.success === true, "async trace replay failed.");

    const asyncTimeline = expectToolSuccess(
      await callTool(client, "get_async_timeline", { url: demoUrl, limit: 10 }),
      "get_async_timeline"
    ) as {
      events: { phase: string; groupKey: string }[];
      summary: { totalRequests: number; invertedGroups: { groupKey: string }[]; slowRequests: { durationMs: number }[] };
    };
    assert(asyncTimeline.summary.totalRequests >= 2, "get_async_timeline reported fewer than two requests.");
    assert(
      asyncTimeline.events.some((event) => event.phase === "request_start") &&
        asyncTimeline.events.some((event) => event.phase === "request_resolve"),
      "get_async_timeline did not include both start and resolve phases."
    );
    assert(
      asyncTimeline.summary.invertedGroups.some((group) => group.groupKey.includes("/api/mock/async-trace")),
      "get_async_timeline did not detect the inverted completion order for concurrent requests."
    );
    assert(
      asyncTimeline.summary.slowRequests.some((request) => request.durationMs >= 700),
      "get_async_timeline did not surface the slow request in its summary."
    );
    checks.push("get_async_timeline:ok");

    const raceConditionReplay = expectToolSuccess(
      await callTool(client, "replay_interactions", {
        url: demoUrl,
        resetSession: true,
        steps: [
          { action: "click", selector: "#race-condition-run-button" },
          { action: "wait", durationMs: 900 },
        ],
      }),
      "replay_interactions(race-condition)"
    ) as { success: boolean };
    assert(raceConditionReplay.success === true, "race condition replay failed.");

    const raceDiagnosis = expectToolSuccess(
      await callTool(client, "get_race_condition_diagnosis", {
        url: demoUrl,
        stateSelector: "#race-condition-visible-result",
        limit: 10,
      }),
      "get_race_condition_diagnosis"
    ) as {
      suspected: boolean;
      diagnosis: string;
      finalStateText: string | null;
      latestIntent: { query: string | null } | null;
      finalStateRequest: { query: string | null } | null;
    };
    assert(raceDiagnosis.suspected === true, "get_race_condition_diagnosis did not flag the stale overwrite.");
    assert(
      raceDiagnosis.finalStateText?.toLowerCase().includes("slow") === true,
      "Race condition final state did not expose the stale slow result."
    );
    assert(
      raceDiagnosis.latestIntent?.query === "fast" && raceDiagnosis.finalStateRequest?.query === "slow",
      "Race condition diagnosis did not relate the latest intent to the overwritten final state."
    );
    assert(
      /overwrote newer state|latest intent/i.test(raceDiagnosis.diagnosis),
      "Race condition diagnosis was not readable enough."
    );
    checks.push("get_race_condition_diagnosis:ok");

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

    expectToolSuccess(
      await callTool(client, "navigate_replay", {
        url: hydrationDemoUrl,
        resetSession: true,
      }),
      "navigate_replay(hydration)"
    );
    await new Promise((resolve) => setTimeout(resolve, 600));

    const hydrationIssues = expectToolSuccess(
      await callTool(client, "get_hydration_issues", { url: hydrationDemoUrl, limit: 20 }),
      "get_hydration_issues"
    ) as {
      issues: { tag: string; kind: string; framework: string; message: string }[];
      summary: { total: number };
    };
    assert(
      hydrationIssues.summary.total >= 1,
      "get_hydration_issues returned no hydration issue for the mismatch demo."
    );
    assert(
      hydrationIssues.issues.every((issue) => issue.tag === "hydration"),
      "get_hydration_issues returned an issue without the hydration tag."
    );
    assert(
      hydrationIssues.issues.some(
        (issue) =>
          issue.framework === "react" &&
          /hydration|server html|did not match/i.test(issue.message) &&
          ["mismatch", "replacement", "hydration_failure", "client_render_fallback", "warning"].includes(issue.kind)
      ),
      "get_hydration_issues did not classify the mismatch demo as a hydration issue."
    );
    checks.push("get_hydration_issues:ok");

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
