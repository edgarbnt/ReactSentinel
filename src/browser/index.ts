/**
 * browser/index.ts — SCRUM-23 + SCRUM-20 + SCRUM-28 + SCRUM-8
 *
 * BrowserManager: wraps Playwright to provide a persistent browser context
 * for MCP tool calls. Auto-launches on first use.
 *
 * Rules enforced:
 *   - A single persistent Page is kept alive to allow interactions.
 *   - Console events and exceptions are captured continuously.
 *   - Navigation errors (ECONNREFUSED, timeout) return structured errors.
 */

import { chromium } from "playwright";
import type { Browser, BrowserContext, Page, ConsoleMessage } from "playwright";
import type { BrowserResult, PingData } from "./protocol.js";
import type { RuntimeStatus, ConsoleEvent, ConsoleEventsResponse } from "../diagnostics/protocol.js";
import { detectReact } from "../diagnostics/react-detector.js";

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  private consoleEvents: ConsoleEvent[] = [];

  /** Launch a headless Chromium instance (idempotent). */
  async launch(): Promise<void> {
    if (this.browser) return;
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();

    this.setupListeners();
    console.error("[react-sentinel] Browser launched (headless chromium, persistent session)");
  }

  private setupListeners(): void {
    if (!this.page) return;

    this.page.on("console", (msg: ConsoleMessage) => {
      // Map playwright console types to our types where possible
      let type: "log" | "warn" | "error" | "exception" = "log";
      const msgType = msg.type();
      if (msgType === "warning") type = "warn";
      if (msgType === "error") type = "error";

      this.consoleEvents.push({
        type,
        text: msg.text(),
        location: msg.location().url,
        timestamp: new Date().toISOString(),
      });
    });

    this.page.on("pageerror", (err: Error) => {
      this.consoleEvents.push({
        type: "exception",
        text: err.stack || err.message,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /** Close browser and release all resources. */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
      this.consoleEvents = [];
      console.error("[react-sentinel] Browser closed");
    }
  }

  /** Gets the persistent page, navigating if the URL is different. */
  public async getPage(url: string): Promise<Page> {
    if (!this.page) await this.launch();

    const currentUrl = this.page!.url();
    // Normalize urls to ignore trailing slashes
    const normalizedCurrent = currentUrl.replace(/\/$/, "");
    const normalizedTarget = url.replace(/\/$/, "");

    if (normalizedCurrent !== normalizedTarget || currentUrl === "about:blank") {
      this.consoleEvents = []; // Clear events on new navigation
      const response = await this.page!.goto(url, {
        timeout: 10_000,
        waitUntil: "domcontentloaded",
      });

      if (!response || !response.ok()) {
        throw new Error(`Cannot reach ${url} — HTTP ${response?.status() ?? "no response"}.`);
      }
    }

    return this.page!;
  }

  /** Evaluates a script in the context of the page. */
  async evaluate<T>(url: string, script: string | (() => T | Promise<T>)): Promise<T | { error: string }> {
    try {
      const page = await this.getPage(url);
      return await page.evaluate(script);
    } catch (e) {
      return this.handleError(e, url) as { error: string };
    }
  }

  private handleError(e: unknown, url: string) {
    const msg = String(e);
    const isConnRefused = msg.includes("ECONNREFUSED") || msg.includes("ERR_CONNECTION_REFUSED");
    return {
      error: isConnRefused ? `Cannot connect to ${url} — is the app running?` : msg,
    };
  }

  // ---------------------------------------------------------------------------
  // ping() — SCRUM-20
  // ---------------------------------------------------------------------------
  async ping(url: string): Promise<BrowserResult> {
    const start = Date.now();
    const type = "ping" as const;

    try {
      const page = await this.getPage(url);
      const data = await page.evaluate<PingData>(() => ({
        pong: true,
        url: document.URL,
        title: document.title,
        timestamp: new Date().toISOString(),
      }));

      return { success: true, type, data, durationMs: Date.now() - start };
    } catch (e) {
      return {
        success: false,
        type,
        error: this.handleError(e, url).error,
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
      const page = await this.getPage(url);

      const [pageUrl, title, viewport, react] = await Promise.all([
        page.evaluate<string>(() => document.URL),
        page.evaluate<string>(() => document.title),
        page.evaluate<{ width: number; height: number }>(() => ({
          width: window.innerWidth,
          height: window.innerHeight,
        })),
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
    } catch (e) {
      return this.handleError(e, url);
    }
  }

  // ---------------------------------------------------------------------------
  // getReactTree() — SCRUM-5
  // ---------------------------------------------------------------------------
  async getReactTree(
    url: string,
    maxDepth: number = 10,
    includeHostNodes: boolean = false
  ): Promise<import("../diagnostics/protocol.js").ReactTreeResponse | { error: string }> {
    const start = Date.now();

    try {
      const page = await this.getPage(url);

      const { extractReactTree } = await import("../diagnostics/react-tree.js");
      const tree = await page.evaluate(extractReactTree, { maxDepth, includeHostNodes });

      return {
        url: await page.evaluate(() => document.URL),
        tree,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return this.handleError(e, url);
    }
  }

  // ---------------------------------------------------------------------------
  // inspectComponent() — SCRUM-9
  // ---------------------------------------------------------------------------
  async inspectComponent(
    url: string,
    componentName: string
  ): Promise<import("../diagnostics/protocol.js").ComponentInspectionResponse | { error: string }> {
    const start = Date.now();

    try {
      const page = await this.getPage(url);

      const { inspectReactComponent } = await import("../diagnostics/react-inspector.js");
      const componentNode = await page.evaluate(inspectReactComponent, componentName);

      return {
        url: await page.evaluate(() => document.URL),
        componentName,
        found: componentNode !== null,
        component: componentNode,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return this.handleError(e, url);
    }
  }

  // ---------------------------------------------------------------------------
  // getConsoleEvents() — SCRUM-8
  // ---------------------------------------------------------------------------
  async getConsoleEvents(url: string): Promise<ConsoleEventsResponse | { error: string }> {
    const start = Date.now();
    try {
      const page = await this.getPage(url);
      
      // We return the collected events so far.
      // We clone the array so that we can return the current snapshot.
      const events = [...this.consoleEvents];

      return {
        url: await page.evaluate(() => document.URL),
        events,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return this.handleError(e, url);
    }
  }

  // ---------------------------------------------------------------------------
  // simulateInteraction() — SCRUM-13
  // ---------------------------------------------------------------------------
  async simulateInteraction(
    url: string,
    action: "click" | "type" | "fill",
    selector: string,
    value?: string
  ): Promise<import("./protocol.js").InteractionData> {
    const start = Date.now();
    try {
      const page = await this.getPage(url);

      // Wait for element to be present with a short timeout
      // This handles SCRUM-50: elements might not be immediately available
      try {
        await page.waitForSelector(selector, { state: "visible", timeout: 3000 });
      } catch (e) {
        return {
          success: false,
          action,
          selector,
          error: `Element not found or not visible: ${selector}`,
        };
      }

      const element = page.locator(selector);

      if (action === "click") {
        await element.click();
      } else if (action === "type") {
        await element.type(value || "");
      } else if (action === "fill") {
        await element.fill(value || "");
      }

      return {
        success: true,
        action,
        selector,
      };
    } catch (e) {
      return {
        success: false,
        action,
        selector,
        error: String(e),
      };
    }
  }

  /** Clears the accumulated console events. Useful before an interaction. */
  clearConsoleEvents(): void {
    this.consoleEvents = [];
  }

  /** Validates an assertion on the current page state. */
  async validate(url: string, assertion: import("./protocol.js").Assertion): Promise<import("./protocol.js").ValidationResult> {
    try {
      const page = await this.getPage(url);

      if (assertion.type === "text_present") {
        const text = assertion.expected || "";
        const found = await page.evaluate((t) => {
          return document.body.innerText.includes(t);
        }, text);

        return {
          pass: found,
          assertion,
          details: found ? `Text "${text}" found.` : `Text "${text}" not found in page body.`,
        };
      }

      if (assertion.type === "no_console_errors") {
        const errors = this.consoleEvents.filter(e => e.type === "error" || e.type === "exception");
        const pass = errors.length === 0;

        return {
          pass,
          assertion,
          details: pass ? "No console errors detected." : `Detected ${errors.length} console errors.`,
          actual: pass ? undefined : errors,
        };
      }

      return {
        pass: false,
        assertion,
        details: `Unknown assertion type: ${assertion.type}`,
      };
    } catch (e) {
      return {
        pass: false,
        assertion,
        details: `Validation failed: ${String(e)}`,
      };
    }
  }
}

/** Singleton shared across all MCP tool calls. */
export const browserManager = new BrowserManager();
