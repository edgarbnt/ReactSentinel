import { createContext, useContext, useMemo, useState } from "react";

type ThemeContextValue = {
  mode: "dark";
  accent: string;
  density: "compact";
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

ThemeContext.displayName = "ThemeContext";

function ThemePreview(): JSX.Element {
  const theme = useContext(ThemeContext);

  return (
    <div id="theme-preview" style={{ marginTop: "0.75rem" }}>
      Active theme: {theme?.mode ?? "none"} / {theme?.accent ?? "none"} / {theme?.density ?? "none"}
    </div>
  );
}

export function ThemeContextScenario(): JSX.Element {
  const [accent, setAccent] = useState("#663399");
  const theme = useMemo<ThemeContextValue>(
    () => ({
      mode: "dark",
      accent,
      density: "compact",
    }),
    [accent]
  );

  return (
    <ThemeContext.Provider value={theme}>
      <div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid #7c3aed" }}>
        <h3>Theme Context (Context Demo)</h3>
        <p>Used to validate Sprint 6 context and hook extraction.</p>
        <button
          id="theme-accent-button"
          onClick={() => setAccent((current) => (current === "#663399" ? "#0f766e" : "#663399"))}
        >
          Toggle accent
        </button>
        <ThemePreview />
      </div>
    </ThemeContext.Provider>
  );
}
