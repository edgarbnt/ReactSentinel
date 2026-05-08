import { useState } from "react";

type RequestState = {
  status: string;
  detail: string;
};

async function runMockRequest(path: string): Promise<RequestState> {
  const response = await fetch(path);
  const payload = (await response.json()) as { scenario?: string; message?: string };
  return {
    status: String(response.status),
    detail: payload.message || payload.scenario || "No payload",
  };
}

export function MockApiScenario(): JSX.Element {
  const [successState, setSuccessState] = useState<RequestState | null>(null);
  const [errorState, setErrorState] = useState<RequestState | null>(null);
  const [busy, setBusy] = useState<"success" | "error" | null>(null);

  const handleRun = async (kind: "success" | "error"): Promise<void> => {
    setBusy(kind);
    try {
      const path = kind === "success" ? "/api/mock/success" : "/api/mock/error";
      const result = await runMockRequest(path);
      if (kind === "success") {
        setSuccessState(result);
      } else {
        setErrorState(result);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid #2b6cb0" }}>
      <h3>S4-04 API Mock Scenario</h3>
      <p>Two deterministic requests for network diagnostics: one 200, one 500.</p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          id="mock-success-button"
          onClick={() => void handleRun("success")}
          disabled={busy !== null}
        >
          Run success scenario
        </button>
        <button
          id="mock-error-button"
          onClick={() => void handleRun("error")}
          disabled={busy !== null}
        >
          Run error scenario
        </button>
      </div>
      <div style={{ marginTop: "0.75rem", fontSize: "0.9rem" }}>
        <div id="mock-success-result">
          Success: {successState ? `${successState.status} — ${successState.detail}` : "idle"}
        </div>
        <div id="mock-error-result">
          Error: {errorState ? `${errorState.status} — ${errorState.detail}` : "idle"}
        </div>
      </div>
    </div>
  );
}
