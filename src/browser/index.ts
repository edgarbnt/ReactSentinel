/**
 * browser/index.ts — SCRUM-23 + SCRUM-20 + SCRUM-28
 *
 * BrowserManager: wraps Playwright to provide isolated browser contexts
 * for each MCP tool call. Auto-launches on first use.
 */

import { chromium } from "playwright";
import type { Browser, BrowserContext } from "playwright";
import type { BrowserResult, PingData } from "./protocol.js";
import type { RuntimeStatus } from "../diagnostics/protocol.js";
import { detectReact } from "../diagnostics/react-detector.js";

export class BrowserManager {
  private browser: Browser | null = null;

  async launch(): Promise<void> {
    if (this.browser) return;
    this.browser = await chromium.launch({ headless: true });
    console.error("[react-sentinel] Browser launched (headless chromium)");
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.error("[react-sentinel] Browser closed");
    }
  }

  // ---------------------------------------------------------------------------
  // Shared: navigate to URL in an isolated context
  // ---------------------------------------------------------------------------

  private async withPage<T>(
    url: string,
    fn: (ctx: BrowserContext) => Promise<T>
  ): Promise<T> {
    if (!this.browser) await this.launch();

    let context: BrowserContext | null = null;
    try {
      context = await this.browser!.newContext();
      return await fn(context);
    } finally {
      // Rule: always close browser contexts in a finally block
      if (context) await context.close();
    }
  }

  // ---------------------------------------------------------------------------
  // ping() — SCRUM-23
  // ---------------------------------------------------------------------------

  async ping(url: string): Promise<BrowserResult> {
    const start = Date.now();
    const type = "ping" as const;

    try {
      return await this.withPage(url, async (context) => {
        const page = await context.newPage();
        const response = await page.goto(url, {
          timeout: 10_000,
          waitUntil: "domcontentloaded",
        });

        if (!response || !response.ok()) {
          return {
            success: false,
            type,
            error: `Navigation to ${url} returned HTTP ${response?.status() ?? "no response"}.`,
            durationMs: Date.now() - start,
          };
        }

        const data = await page.evaluate<PingData>(() => ({
          pong: true,
          url: document.URL,
          title: document.title,
          timestamp: new Date().toISOString(),
        }));

        return { success: true, type, data, durationMs: Date.now() - start };
      });
    } catch (e) {
      const msg = String(e);
      const isConnRefused =
        msg.includes("ECONNREFUSED") || msg.includes("ERR_CONNECTION_REFUSED");
      return {
        success: false,
        type,
        error: isConnRefused
          ? `Cannot connect to ${url} — is the app running?`
          : msg,
        durationMs: Date.now() - start,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // getRuntimeStatus() — SCRUM-28
  // ---------------------------------------------------------------------------

  async getRuntimeStatus(url: string): Promise<RuntimeStatus | { error: string }> {
    const start = Date.now();

    try {
      return await this.withPage(url, async (context) => {
        const page = await context.newPage();

        const response = await page.goto(url, {
          timeout: 10_000,
          waitUntil: "domcontentloaded",
        });

        if (!response || !response.ok()) {
          return {
            error: `Cannot reach ${url} — HTTP ${response?.status() ?? "no response"}.`,
          };
        }

        // Collect page metadata + React detection in a single evaluate call
        const [pageUrl, title, viewport, react] = await Promise.all([
          page.evaluate<string>(() => document.URL),
          page.evaluate<string>(() => document.title),
          page.evaluate<{ width: number; height: number }>(() => ({
            width: window.innerWidth,
            height: window.innerHeight,
          })),
          // Inject and run the self-contained react detector
          page.evaluate(detectReact),
        ]);

        return {
          url: pageUrl,
          title,
          timestamp: new Date().toISOString(),
          viewport,
          react,
          durationMs: Date.now() - start,
        };
      });
    } catch (e) {
      const msg = String(e);
      const isConnRefused =
        msg.includes("ECONNREFUSED") || msg.includes("ERR_CONNECTION_REFUSED");
      return {
        error: isConnRefused
          ? `Cannot connect to ${url} — is the app running?`
          : msg,
      };
    }
  }
}

/** Singleton shared across all MCP tool calls. */
export const browserManager = new BrowserManager();
