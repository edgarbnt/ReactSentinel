/**
 * browser/index.ts — SCRUM-23 + SCRUM-20
 *
 * BrowserManager: wraps Playwright to provide isolated browser contexts
 * for each MCP tool call. Auto-launches on first use.
 *
 * Rules enforced:
 *   - Each ping() creates a new isolated BrowserContext, closed in finally.
 *   - Navigation errors (ECONNREFUSED, timeout) return structured BrowserError.
 *   - Never throws — all errors are returned as BrowserResult.
 */

import { chromium } from "playwright";
import type { Browser, BrowserContext } from "playwright";
import type { BrowserResult, PingData } from "./protocol.js";

export class BrowserManager {
  private browser: Browser | null = null;

  /** Launch a headless Chromium instance (idempotent). */
  async launch(): Promise<void> {
    if (this.browser) return;
    this.browser = await chromium.launch({ headless: true });
    console.error("[react-sentinel] Browser launched (headless chromium)");
  }

  /** Close browser and release all resources. */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.error("[react-sentinel] Browser closed");
    }
  }

  /**
   * Ping a URL — opens an isolated context, navigates, extracts metadata.
   * Handles SCRUM-20: returns structured error when app is unreachable.
   */
  async ping(url: string): Promise<BrowserResult> {
    const start = Date.now();
    const type = "ping" as const;

    // Auto-launch on first use
    if (!this.browser) {
      try {
        await this.launch();
      } catch (e) {
        return {
          success: false,
          type,
          error: `Failed to launch browser: ${String(e)}`,
          durationMs: Date.now() - start,
        };
      }
    }

    // Rule: one isolated context per tool call, closed in finally
    let context: BrowserContext | null = null;
    try {
      context = await this.browser!.newContext();
      const page = await context.newPage();

      const response = await page.goto(url, {
        timeout: 10_000,
        waitUntil: "domcontentloaded",
      });

      if (!response) {
        return {
          success: false,
          type,
          error: `Navigation to ${url} returned no response.`,
          durationMs: Date.now() - start,
        };
      }

      if (!response.ok()) {
        return {
          success: false,
          type,
          error: `Navigation to ${url} returned HTTP ${response.status()}.`,
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
    } catch (e) {
      // SCRUM-20: friendly error for connection refused / timeout
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
    } finally {
      // Rule: always close browser contexts in a finally block
      if (context) await context.close();
    }
  }
}

/** Singleton shared across all MCP tool calls. */
export const browserManager = new BrowserManager();
