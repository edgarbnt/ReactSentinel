import { TodoList } from "./components/TodoList";
import { BuggySearch } from "./components/BuggySearch";
import { DiagnosisApiScenario } from "./components/DiagnosisApiScenario";
import { InfiniteLoopScenario } from "./components/InfiniteLoopScenario";
import { MockApiScenario } from "./components/MockApiScenario";
import { AsyncTraceScenario } from "./components/AsyncTraceScenario";
import { RaceConditionScenario } from "./components/RaceConditionScenario";
import { ThemeContextScenario } from "./components/ThemeContextScenario";
import { SimpleReactScenario } from "./components/SimpleReactScenario";

export default function App(): JSX.Element {
  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 600 }}>
      <h1>React-Sentinel Test App</h1>
      <p>
        This page is a connectable fixture for testing the MCP ↔ browser
        bridge. The <code>browser_ping</code> tool should be able to reach this
        page and read its title.
      </p>
      <div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid #d1d5db", background: "#f8fafc" }}>
        <h2>MVP example catalog</h2>
        <ul style={{ marginBottom: 0 }}>
          <li>Simple React state + props + interaction</li>
          <li>Console and network diagnostics</li>
          <li>Infinite render loop benchmark</li>
          <li>Async race condition benchmark</li>
          <li>Hydration mismatch fixture on a dedicated page</li>
        </ul>
      </div>
      <hr />
      <SimpleReactScenario />
      <div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid red" }}>
        <h3>Console Error Example</h3>
        <p>Trigger a deterministic console error and exception from the live component tree.</p>
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
      <div style={{ marginTop: "1rem", color: "#4b5563", fontSize: "0.95rem" }}>
        The network example lives in the API mock scenario below. Use it together with the crash button for a
        combined console + network walkthrough.
      </div>
      <MockApiScenario />
      <DiagnosisApiScenario />
      <AsyncTraceScenario />
      <RaceConditionScenario />
      <InfiniteLoopScenario />
      <BuggySearch />
      <ThemeContextScenario />
      <TodoList />
    </div>
  );
}
