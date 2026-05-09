import { useState } from "react";

type DiagnosisState =
  | { phase: "idle"; detail: string }
  | { phase: "loading"; detail: string }
  | { phase: "success"; detail: string }
  | { phase: "error"; detail: string };

async function runDiagnosisRequest(query: string): Promise<{ status: number; payload: { result?: string; message?: string } }> {
  const response = await fetch(`/api/mock/diagnosis?query=${encodeURIComponent(query)}`);
  const payload = (await response.json()) as { result?: string; message?: string };
  return {
    status: response.status,
    payload,
  };
}

export function DiagnosisApiScenario(): JSX.Element {
  const [query, setQuery] = useState("broken");
  const [state, setState] = useState<DiagnosisState>({
    phase: "idle",
    detail: "Enter a query and run the search diagnostic.",
  });

  const handleRun = async (): Promise<void> => {
    setState({
      phase: "loading",
      detail: "Running diagnostic search...",
    });

    try {
      const result = await runDiagnosisRequest(query.trim() || "healthy");
      if (result.status >= 400) {
        setState({
          phase: "error",
          detail: "Search temporarily unavailable.",
        });
        return;
      }

      setState({
        phase: "success",
        detail: result.payload.result ?? "Search completed successfully.",
      });
    } catch {
      setState({
        phase: "error",
        detail: "Search temporarily unavailable.",
      });
    }
  };

  return (
    <div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid #ca8a04" }}>
      <h3>Diagnosis Benchmark (API Failure)</h3>
      <p>
        This fixture is intentionally diagnosis-oriented: the UI hides the root cause behind a generic
        error, so the agent must use runtime tools to find the failing signal.
      </p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input
          id="diagnosis-query-input"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type broken or healthy"
        />
        <button id="diagnosis-run-button" onClick={() => void handleRun()}>
          Run diagnosis search
        </button>
      </div>
      <div id="diagnosis-status" style={{ marginTop: "0.75rem" }}>
        Status: {state.phase}
      </div>
      <div id="diagnosis-message" style={{ marginTop: "0.25rem" }}>
        {state.detail}
      </div>
      <div id="diagnosis-hint" style={{ marginTop: "0.5rem", color: "#6b7280", fontSize: "0.9rem" }}>
        Hint for benchmark authors: the right diagnosis should come from network/runtime evidence, not from guessing.
      </div>
    </div>
  );
}
