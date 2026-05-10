import { useState } from "react";

type AsyncTraceResult = {
  query: string;
  delayMs: number;
  message: string;
};

async function runAsyncTraceRequest(query: string, delayMs: number): Promise<AsyncTraceResult> {
  const response = await fetch(`/api/mock/async-trace?query=${encodeURIComponent(query)}&delay=${delayMs}`);
  const payload = (await response.json()) as { query?: string; delayMs?: number; message?: string };

  return {
    query: payload.query ?? query,
    delayMs: payload.delayMs ?? delayMs,
    message: payload.message ?? "Async trace response ready",
  };
}

export function AsyncTraceScenario(): JSX.Element {
  const [status, setStatus] = useState("idle");
  const [completionOrder, setCompletionOrder] = useState<string[]>([]);

  const handleRun = async (): Promise<void> => {
    setStatus("running");
    setCompletionOrder([]);

    const slowRequest = runAsyncTraceRequest("slow", 700).then((result) => {
      setCompletionOrder((current) => [...current, `${result.query}:${result.delayMs}`]);
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const fastRequest = runAsyncTraceRequest("fast", 120).then((result) => {
      setCompletionOrder((current) => [...current, `${result.query}:${result.delayMs}`]);
      return result;
    });

    await Promise.all([slowRequest, fastRequest]);
    setStatus("completed");
  };

  return (
    <div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid #0f766e" }}>
      <h3>Async Trace Benchmark</h3>
      <p>
        This fixture launches two concurrent requests against the same endpoint. The faster request resolves
        first even though the slower one starts at the same time.
      </p>
      <button id="async-trace-run-button" onClick={() => void handleRun()}>
        Run concurrent async trace
      </button>
      <div id="async-trace-status" style={{ marginTop: "0.75rem" }}>
        Status: {status}
      </div>
      <div id="async-trace-order" style={{ marginTop: "0.25rem" }}>
        Completion order: {completionOrder.length > 0 ? completionOrder.join(" -> ") : "idle"}
      </div>
    </div>
  );
}
