import { useEffect, useMemo, useState } from "react";

const maxLoopSteps = 8;

export function InfiniteLoopScenario(): JSX.Element {
  const [armed, setArmed] = useState(false);
  const [loopStep, setLoopStep] = useState(0);
  const unstableDependency = useMemo(
    () => ({
      label: `loop-${loopStep}`,
      step: loopStep,
    }),
    [loopStep]
  );

  useEffect(() => {
    if (!armed) return;
    if (loopStep >= maxLoopSteps) {
      setArmed(false);
      return;
    }

    setLoopStep((current) => current + 1);
  }, [armed, loopStep, unstableDependency]);

  const status =
    armed ? "running" : loopStep >= maxLoopSteps ? "stabilized" : loopStep > 0 ? "paused" : "idle";

  const handleStart = (): void => {
    setLoopStep(0);
    setArmed(true);
  };

  const handleReset = (): void => {
    setArmed(false);
    setLoopStep(0);
  };

  return (
    <div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid #b91c1c" }}>
      <h3>Render Loop Benchmark</h3>
      <p>
        This fixture intentionally creates a short render explosion: an effect depends on a memoized value
        that changes on every step, which keeps scheduling updates until the safety cap is reached.
      </p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button id="render-loop-start-button" onClick={handleStart} disabled={armed}>
          Start controlled render loop
        </button>
        <button id="render-loop-reset-button" onClick={handleReset}>
          Reset loop fixture
        </button>
      </div>
      <div id="render-loop-status" style={{ marginTop: "0.75rem" }}>
        Status: {status}
      </div>
      <div id="render-loop-step" style={{ marginTop: "0.25rem" }}>
        Render step: {loopStep}
      </div>
      <div id="render-loop-token" style={{ marginTop: "0.25rem" }}>
        Dependency token: {unstableDependency.label}
      </div>
      <div id="render-loop-hint" style={{ marginTop: "0.5rem", color: "#6b7280", fontSize: "0.9rem" }}>
        Expected diagnosis: repeated effect + unstable hook value in this component.
      </div>
    </div>
  );
}
