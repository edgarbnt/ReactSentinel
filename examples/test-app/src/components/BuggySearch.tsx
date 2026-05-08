import { useState } from "react";

export function BuggySearch() {
  const [query, setQuery] = useState("");

  if (query.toLowerCase() === "bug") {
    // throw new Error("I told you not to type 'bug'!");
    console.log("Bug search ignored (FIXED)");
  }

  return (
    <div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid orange" }}>
      <h3>SCRUM-54 Buggy Search</h3>
      <p>Typing 'bug' used to crash the component (now fixed).</p>
      <input
        id="buggy-input"
        type="text"
        placeholder="Search..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
    </div>
  );
}
