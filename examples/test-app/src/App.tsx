import { useState } from "react";
import { TodoList } from "./components/TodoList";

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
      <button onClick={() => setCount((c) => c + 1)}>
        Count: {count}
      </button>

      <TodoList />
    </div>
  );
}
