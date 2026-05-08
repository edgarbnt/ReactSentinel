import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function mockApiPlugin() {
  const handler = (request: string | undefined, response: import("node:http").ServerResponse, next: () => void): void => {
    if (request === "/api/mock/success") {
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ scenario: "success", message: "Mock success response" }));
      return;
    }

    if (request === "/api/mock/error") {
      response.statusCode = 500;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ scenario: "error", message: "Mock error response" }));
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
