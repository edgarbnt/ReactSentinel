import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ManagedProcess } from "./mcp-e2e-utils.js";
import {
  assert,
  callTool,
  connectMcpClient,
  demoUrl,
  ensureDemoApp,
  expectToolSuccess,
  stopProcess,
  stringifyError,
} from "./mcp-e2e-utils.js";

async function main(): Promise<void> {
  const managedProcesses: ManagedProcess[] = [];
  const serverLogs: string[] = [];
  let transport: StdioClientTransport | null = null;

  try {
    await ensureDemoApp(managedProcesses);

    const { client, transport: connectedTransport } = await connectMcpClient(serverLogs, {
      name: "react-sentinel-e2e-diagnose",
      version: "0.1.0",
    });
    transport = connectedTransport;

    const runtimeStatus = expectToolSuccess(
      await callTool(client, "get_runtime_status", { url: demoUrl }),
      "get_runtime_status"
    ) as { react: { detected: boolean } };
    assert(runtimeStatus.react.detected === true, "React was not detected before diagnosis.");

    const scenario = expectToolSuccess(
      await callTool(client, "validate_scenario", {
        url: demoUrl,
        resetSession: true,
        steps: [
          { action: "fill", selector: "#diagnosis-query-input", value: "broken" },
          { action: "click", selector: "#diagnosis-run-button" },
          { action: "wait", durationMs: 400 },
        ],
        assertions: [
          { type: "text_present", expected: "Status: error" },
          { type: "text_present", expected: "Search temporarily unavailable." },
        ],
      }),
      "validate_scenario"
    ) as {
      report: {
        success: boolean;
        summary: { actionFailures: number; assertionFailures: number };
      };
    };
    assert(scenario.report.success === true, "The diagnosis scenario was not reproduced successfully.");
    assert(scenario.report.summary.actionFailures === 0, "Replay actions failed during diagnosis.");
    assert(scenario.report.summary.assertionFailures === 0, "Diagnosis assertions failed.");

    const networkEvents = expectToolSuccess(
      await callTool(client, "get_network_events", {
        url: demoUrl,
        onlyErrors: true,
        limit: 20,
      }),
      "get_network_events"
    ) as {
      events: Array<{ url: string; status: number | null; method: string; error?: string }>;
    };
    const failingRequest =
      networkEvents.events.find((event) => event.url.includes("/api/mock/diagnosis") && event.status === 503) ?? null;
    assert(failingRequest !== null, "No failing /api/mock/diagnosis request with HTTP 503 was captured.");

    const consoleEvents = expectToolSuccess(
      await callTool(client, "get_console_events", { url: demoUrl }),
      "get_console_events"
    ) as { events: Array<{ type: string; text: string }> };
    const clientExceptions = consoleEvents.events.filter((event) => event.type === "exception");
    const browserConsoleErrors = consoleEvents.events.filter((event) => event.type === "error");
    assert(clientExceptions.length === 0, "A client-side exception was captured during diagnosis.");

    const runtimeTimeline = expectToolSuccess(
      await callTool(client, "get_runtime_timeline", { url: demoUrl }),
      "get_runtime_timeline"
    ) as {
      summary: { errorCount: number };
      events: Array<{ source: string; message: string }>;
    };
    assert(runtimeTimeline.summary.errorCount >= 1, "Runtime timeline did not capture the failing network signal.");

    const diagnosis = {
      ok: true,
      benchmark: "diagnosis-api-outage",
      reproduction: {
        query: "broken",
        userVisibleState: "Status: error / Search temporarily unavailable.",
      },
      evidence: {
        failingRequest: {
          method: failingRequest.method,
          url: failingRequest.url,
          status: failingRequest.status,
        },
        consoleErrorCount: browserConsoleErrors.length,
        clientExceptionCount: clientExceptions.length,
        timelineErrorCount: runtimeTimeline.summary.errorCount,
      },
      diagnosis: {
        category: "upstream_api_failure",
        rootCause:
          "The failure is caused by the replayed request to /api/mock/diagnosis?query=broken returning HTTP 503. React stays healthy and there are no client exceptions, so the problem is an upstream API outage rather than a frontend rendering crash.",
      },
    };

    console.log(JSON.stringify(diagnosis, null, 2));
  } catch (error) {
    console.error("Diagnosis benchmark failed.");
    console.error(stringifyError(error));
    for (const processHandle of managedProcesses) {
      if (processHandle.logs.length === 0) continue;
      console.error(`--- ${processHandle.name} logs ---`);
      for (const line of processHandle.logs.slice(-40)) {
        console.error(line);
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
