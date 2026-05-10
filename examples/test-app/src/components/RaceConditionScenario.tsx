import { useState } from "react";
import { runAsyncTraceRequest } from "../lib/asyncTraceRequest";

export function RaceConditionScenario(): JSX.Element {
  const [status, setStatus] = useState("idle");
  const [latestIntent, setLatestIntent] = useState("idle");
  const [visibleResult, setVisibleResult] = useState("idle");
  const [completionOrder, setCompletionOrder] = useState<string[]>([]);

  const handleRun = async (): Promise<void> => {
    setStatus("running");
    setLatestIntent("slow");
    setVisibleResult("loading");
    setCompletionOrder([]);

    const slowRequest = runAsyncTraceRequest("slow", 700).then((result) => {
      setCompletionOrder((current) => [...current, result.query]);
      setVisibleResult(result.query);
      return result;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    setLatestIntent("fast");

    const fastRequest = runAsyncTraceRequest("fast", 120).then((result) => {
      setCompletionOrder((current) => [...current, result.query]);
      setVisibleResult(result.query);
      return result;
    });

    await Promise.all([slowRequest, fastRequest]);
    setStatus("completed");
  };

  return (
    <div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid #9333ea" }}>
      <h3>Race Condition Benchmark</h3>
      <p>
        This fixture reproduces a stale response overwrite: the user intent switches to <code>fast</code>,
        but the older <code>slow</code> response arrives later and becomes the visible state.
      </p>
      <button id="race-condition-run-button" onClick={() => void handleRun()}>
        Run race condition scenario
      </button>
      <div id="race-condition-status" style={{ marginTop: "0.75rem" }}>
        Status: {status}
      </div>
      <div id="race-condition-latest-intent" style={{ marginTop: "0.25rem" }}>
        Latest intent: {latestIntent}
      </div>
      <div id="race-condition-visible-result" style={{ marginTop: "0.25rem" }}>
        Visible result: {visibleResult}
      </div>
      <div id="race-condition-order" style={{ marginTop: "0.25rem" }}>
        Completion order: {completionOrder.length > 0 ? completionOrder.join(" -> ") : "idle"}
      </div>
    </div>
  );
}
