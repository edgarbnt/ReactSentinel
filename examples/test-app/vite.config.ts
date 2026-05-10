import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function mockApiPlugin() {
  const handler = (request: string | undefined, response: import("node:http").ServerResponse, next: () => void): void => {
    const url = request ? new URL(request, "http://react-sentinel.local") : null;
    const pathname = url?.pathname;

    if (pathname === "/api/mock/success") {
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ scenario: "success", message: "Mock success response" }));
      return;
    }

    if (pathname === "/api/mock/error") {
      response.statusCode = 500;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ scenario: "error", message: "Mock error response" }));
      return;
    }

    if (pathname === "/api/mock/diagnosis") {
      const query = (url?.searchParams.get("query") ?? "").trim().toLowerCase();
      if (query === "broken") {
        response.statusCode = 503;
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            scenario: "diagnosis-outage",
            message: "Search index is unavailable",
          })
        );
        return;
      }

      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          scenario: "diagnosis-success",
          result: `Search results ready for query "${query || "healthy"}"`,
        })
      );
      return;
    }

    if (pathname === "/api/mock/async-trace") {
      const query = (url?.searchParams.get("query") ?? "unknown").trim() || "unknown";
      const requestedDelay = Number(url?.searchParams.get("delay") ?? "0");
      const delayMs = Number.isFinite(requestedDelay) ? Math.max(0, Math.min(requestedDelay, 2_000)) : 0;

      setTimeout(() => {
        response.statusCode = 200;
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            scenario: "async-trace",
            query,
            delayMs,
            message: `Async trace response for ${query}`,
          })
        );
      }, delayMs);
      return;
    }

    next();
  };

  return {
    name: "mock-api-plugin",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use((req, res, next) => handler(req.url, res, next));
    },
    configurePreviewServer(server: import("vite").PreviewServer) {
      server.middlewares.use((req, res, next) => handler(req.url, res, next));
    },
  };
}

export default defineConfig({
  plugins: [react(), mockApiPlugin()],
  server: { port: 5173 },
});
