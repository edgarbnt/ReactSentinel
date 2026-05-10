import { hydrateRoot } from "react-dom/client";

function HydrationMismatchPage(): JSX.Element {
  return (
    <section
      id="hydration-demo-card"
      data-render-origin="client"
      style={{
        marginTop: "1rem",
        padding: "1rem",
        border: "1px solid #2563eb",
        borderRadius: "12px",
        background: "white",
      }}
    >
      <h2 id="hydration-demo-title">Client shell</h2>
      <p id="hydration-demo-message">Welcome from the client runtime.</p>
      <ul style={{ paddingLeft: "1.25rem" }}>
        <li id="hydration-demo-locale">Locale: en-US</li>
        <li id="hydration-demo-mode">Mode: client</li>
        <li id="hydration-demo-build">Build: browser-hydrate</li>
      </ul>
    </section>
  );
}

const root = document.getElementById("hydration-root");
if (!root) {
  throw new Error("Hydration root element not found");
}

hydrateRoot(root, <HydrationMismatchPage />);
