import { useState } from "react";

type StatusBadgeProps = {
  label: string;
  tone: "idle" | "active";
};

function StatusBadge({ label, tone }: StatusBadgeProps): JSX.Element {
  return (
    <span
      id="simple-react-badge"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.25rem 0.5rem",
        borderRadius: "999px",
        background: tone === "active" ? "#dcfce7" : "#e5e7eb",
        color: tone === "active" ? "#166534" : "#374151",
        fontSize: "0.85rem",
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

export function SimpleReactScenario(): JSX.Element {
  const [count, setCount] = useState(0);
  const [mode, setMode] = useState<"idle" | "active">("idle");

  return (
    <div id="simple-react-scenario" style={{ marginTop: "1rem", padding: "1rem", border: "1px solid #2563eb" }}>
      <h3>Simple React Example</h3>
      <p>
        A small stateful fixture for basic runtime inspection: a child component receives props, the parent keeps
        local state, and both update through visible interactions.
      </p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <button id="counter-button" onClick={() => setCount((current) => current + 1)}>
          Count: {count}
        </button>
        <button id="simple-react-toggle-button" onClick={() => setMode((current) => (current === "idle" ? "active" : "idle"))}>
          Toggle mode
        </button>
        <StatusBadge label={mode === "active" ? "active" : "idle"} tone={mode} />
      </div>
      <div id="simple-react-summary" style={{ marginTop: "0.75rem" }}>
        State summary: count={count}, mode={mode}
      </div>
    </div>
  );
}
