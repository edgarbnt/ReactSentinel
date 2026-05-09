import { useState } from "react";
import { TodoList } from "./components/TodoList";
import { BuggySearch } from "./components/BuggySearch";
import { DiagnosisApiScenario } from "./components/DiagnosisApiScenario";
import { InfiniteLoopScenario } from "./components/InfiniteLoopScenario";
import { MockApiScenario } from "./components/MockApiScenario";
import { ThemeContextScenario } from "./components/ThemeContextScenario";

export default function App(): JSX.Element {
  const [count, setCount] = useState(0);

  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 600 }}>
      <h1>React-Sentinel Test App</h1>
      <p>
        This page is a connectable fixture for testing the MCP ↔ browser
        bridge. The <code>browser_ping</code> tool should be able to reach this
        page and read its title.
      </p>
      <hr />
      <h2>Interactive fixture</h2>
      <p>Counter state (for future hook inspection tests):</p>
      <button id="counter-button" onClick={() => setCount((c) => c + 1)}>
        Count: {count}
      </button>
      <div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid red" }}>
        <h3>SCRUM-8 Crash Test</h3>
        <button
          id="crash-button"
          onClick={() => {
            console.error("This is a simulated console.error");
            throw new Error("This is a simulated crash!");
          }}
          style={{ backgroundColor: "darkred", color: "white" }}
        >
          Générer une erreur
        </button>
      </div>

      <MockApiScenario />
      <DiagnosisApiScenario />
      <InfiniteLoopScenario />
      <BuggySearch />
      <ThemeContextScenario />
      <TodoList />
    </div>
  );
}
