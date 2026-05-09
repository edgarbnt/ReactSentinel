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
import type {
  BrowserResult,
  PingData,
  AttachStatus,
  CdpVersionInfo,
  CdpTargetInfo,
  AttachTabInfo,
  AttachTabSelector,
  AttachTabsResponse,
  AttachTabSelectionResponse,
  NetworkEvent,
  NetworkEventsResponse,
} from "./protocol.js";
import type {
  RuntimeStatus,
  ConsoleEvent,
  ConsoleEventsResponse,
  RuntimeTimelineEvent,
  RuntimeTimelineLevel,
  RuntimeTimelineResponse,
  RuntimeTimelineSource,
  RuntimeTimelineSummary,
} from "../diagnostics/protocol.js";
import { detectReact } from "../diagnostics/react-detector.js";

export const DEFAULT_CDP_ENDPOINT = "http://127.0.0.1:9222";

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private attachSelection: { endpoint: string; tab: AttachTabInfo; selectedAt: string } | null = null;

  private consoleEvents: ConsoleEvent[] = [];
  private static readonly networkBufferGlobalKey = "__RS_NETWORK_EVENTS__";
  private static readonly networkBufferLimit = 200;
  private static readonly timelineSourceOrder: Record<RuntimeTimelineSource, number> = {
    console: 0,
    exception: 1,
    network: 2,
  };
  private static readonly cdpHelpMessage =
    "Launch Chrome with remote debugging, for example: google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/react-sentinel-cdp";

  private static normalizeText(value: string): string {
    return value.trim().toLowerCase();
  }

  private static matchesText(value: string, query: string): boolean {
    return BrowserManager.normalizeText(value).includes(BrowserManager.normalizeText(query));
  }

  private static normalizeAttachTabs(tabs: CdpTargetInfo[]): AttachTabInfo[] {
    return tabs
      .filter((tab) => tab.type === "page")
      .map((tab, index) => ({
        ...tab,
        index,
      }));
  }

  private async readCdpJson<T>(endpoint: string, path: string, timeoutMs: number = 2000): Promise<T | { error: string }> {
    let targetUrl: string;

    try {
      targetUrl = new URL(path, endpoint).toString();
    } catch {
      return {
        error: `Invalid CDP endpoint URL: ${endpoint}`,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(targetUrl, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          error: `CDP endpoint responded with HTTP ${response.status}`,
        };
      }

      try {
        return (await response.json()) as T;
      } catch {
        return {
          error: `CDP endpoint returned an invalid ${path} payload`,
        };
      }
    } catch (error) {
      return {
        error:
          error instanceof Error && error.name === "AbortError"
            ? `Timed out after ${timeoutMs}ms while checking the CDP endpoint`
            : error instanceof Error
              ? error.message
              : String(error),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Launch a headless Chromium instance (idempotent). */
  async launch(): Promise<void> {
    if (this.browser) return;
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext();
    await this.context.addInitScript(
      ({
        networkBufferGlobalKey,
        networkBufferLimit,
      }: {
        networkBufferGlobalKey: string;
        networkBufferLimit: number;
      }) => {
        type NetworkEventSeed = Omit<NetworkEvent, "isHttpError">;

        const windowWithNetwork = window as typeof window & {
          fetch: typeof fetch;
        };
        const getBuffer = (): NetworkEventSeed[] => {
          const current = Reflect.get(windowWithNetwork, networkBufferGlobalKey);
          if (Array.isArray(current)) {
            return current as NetworkEventSeed[];
          }
          const emptyBuffer: NetworkEventSeed[] = [];
          Reflect.set(windowWithNetwork, networkBufferGlobalKey, emptyBuffer);
          return emptyBuffer;
        };
        const pushEvent = (event: NetworkEventSeed): void => {
          const buffer = getBuffer();
          buffer.push(event);
          if (buffer.length > networkBufferLimit) {
            buffer.splice(0, buffer.length - networkBufferLimit);
          }
        };

        const originalFetch = windowWithNetwork.fetch.bind(windowWithNetwork);
        const originalXhrOpen = XMLHttpRequest.prototype.open;
        const originalXhrSend = XMLHttpRequest.prototype.send;

        windowWithNetwork.fetch = async (
          input: RequestInfo | URL,
          init?: RequestInit
        ): Promise<Response> => {
          const startedAt = Date.now();
          const requestUrl =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url;

          const requestMethod = init?.method ?? "GET";
          const normalizedMethod = requestMethod.toUpperCase();

          try {
            const response = await originalFetch(input, init);
            pushEvent({
              type: "fetch",
              url: requestUrl,
              method: normalizedMethod,
              status: response.status,
              durationMs: Date.now() - startedAt,
              timestamp: new Date().toISOString(),
            });
            return response;
          } catch (error) {
            pushEvent({
              type: "fetch",
              url: requestUrl,
              method: normalizedMethod,
              status: null,
              durationMs: Date.now() - startedAt,
              timestamp: new Date().toISOString(),
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        };

        XMLHttpRequest.prototype.open = function (
          this: XMLHttpRequest,
          method: string,
          url: string | URL,
          async?: boolean,
          username?: string | null,
          password?: string | null
        ): void {
          Reflect.set(this, "__rsMethod", method.toUpperCase());
          Reflect.set(this, "__rsUrl", typeof url === "string" ? url : url.toString());

          originalXhrOpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
        };

        XMLHttpRequest.prototype.send = function (
          this: XMLHttpRequest,
          body?: XMLHttpRequestBodyInit | Document | null
        ): void {
          this.addEventListener(
            "loadend",
            () => {
              const method = Reflect.get(this, "__rsMethod");
              const url = Reflect.get(this, "__rsUrl");
              const startedAt = Reflect.get(this, "__rsStartedAt");
              const isStartedAtNumber = typeof startedAt === "number";
              const durationMs = isStartedAtNumber ? Date.now() - startedAt : 0;

              if (typeof method === "string" && typeof url === "string") {
                const status = Number.isFinite(this.status) ? this.status : null;
                const hasNetworkFailure = status === 0;
                pushEvent({
                  type: "xhr",
                  method,
                  url,
                  status,
                  durationMs,
                  timestamp: new Date().toISOString(),
                  ...(hasNetworkFailure ? { error: "XMLHttpRequest failed" } : {}),
                });
              }
            },
            { once: true }
          );

          Reflect.set(this, "__rsStartedAt", Date.now());
          originalXhrSend.call(this, body);
        };
      },
      {
        networkBufferGlobalKey: BrowserManager.networkBufferGlobalKey,
        networkBufferLimit: BrowserManager.networkBufferLimit,
      }
    );
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

  private static buildAttachHelpMessage(): string {
    return BrowserManager.cdpHelpMessage;
  }

  async getAttachStatus(
    endpoint: string = DEFAULT_CDP_ENDPOINT
  ): Promise<AttachStatus> {
    const checkedAt = new Date().toISOString();
    const help = BrowserManager.buildAttachHelpMessage();
    const timeoutMs = 2000;

    let versionUrl: string;
    try {
      versionUrl = new URL("/json/version", endpoint).toString();
    } catch {
      return {
        endpoint,
        checkedAt,
        status: "attach_unavailable",
        ready: false,
        reachable: false,
        help,
        error: `Invalid CDP endpoint URL: ${endpoint}`,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(versionUrl, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          endpoint,
          checkedAt,
          status: "attach_unavailable",
          ready: false,
          reachable: true,
          help,
          error: `CDP endpoint responded with HTTP ${response.status}`,
        };
      }

      let version: CdpVersionInfo;
      try {
        version = (await response.json()) as CdpVersionInfo;
      } catch {
        return {
          endpoint,
          checkedAt,
          status: "attach_unavailable",
          ready: false,
          reachable: true,
          help,
          error: "CDP endpoint returned an invalid /json/version payload",
        };
      }

      if (!version.webSocketDebuggerUrl) {
        return {
          endpoint,
          checkedAt,
          status: "attach_unavailable",
          ready: false,
          reachable: true,
          help,
          error: "CDP endpoint is reachable but does not expose webSocketDebuggerUrl",
        };
      }

      return {
        endpoint,
        checkedAt,
        status: "attach_ready",
        ready: true,
        reachable: true,
        help,
        browser: version.Browser,
        protocolVersion: version["Protocol-Version"],
        userAgent: version["User-Agent"],
        webSocketDebuggerUrl: version.webSocketDebuggerUrl,
      };
    } catch (error) {
      return {
        endpoint,
        checkedAt,
        status: "attach_unavailable",
        ready: false,
        reachable: false,
        help,
        error:
          error instanceof Error && error.name === "AbortError"
            ? `Timed out after ${timeoutMs}ms while checking the CDP endpoint`
            : error instanceof Error
              ? error.message
              : String(error),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async getAttachTabs(
    endpoint: string = DEFAULT_CDP_ENDPOINT,
    urlFilter?: string,
    titleFilter?: string
  ): Promise<AttachTabsResponse | { error: string }> {
    const checkedAt = new Date().toISOString();
    const listOrError = await this.readCdpJson<CdpTargetInfo[]>(endpoint, "/json/list");

    if ("error" in listOrError) {
      return listOrError;
    }

    if (!Array.isArray(listOrError)) {
      return {
        error: "CDP endpoint returned an invalid /json/list payload",
      };
    }

    const tabs = BrowserManager.normalizeAttachTabs(listOrError);
    const filteredTabs = tabs.filter((tab) => {
      const urlMatches =
        !urlFilter || BrowserManager.matchesText(tab.url, urlFilter);
      const titleMatches =
        !titleFilter || BrowserManager.matchesText(tab.title, titleFilter);
      return urlMatches && titleMatches;
    });

    const selectedTab =
      this.attachSelection?.endpoint === endpoint
        ? tabs.find((tab) => tab.id === this.attachSelection?.tab.id) ?? null
        : null;

    return {
      endpoint,
      checkedAt,
      total: filteredTabs.length,
      filters: {
        url: urlFilter,
        title: titleFilter,
      },
      tabs: filteredTabs,
      selectedTab,
    };
  }

  async selectAttachTab(
    endpoint: string = DEFAULT_CDP_ENDPOINT,
    selector: AttachTabSelector
  ): Promise<AttachTabSelectionResponse | { error: string }> {
    const checkedAt = new Date().toISOString();
    const listOrError = await this.readCdpJson<CdpTargetInfo[]>(endpoint, "/json/list");

    if ("error" in listOrError) {
      return listOrError;
    }

    if (!Array.isArray(listOrError)) {
      return {
        error: "CDP endpoint returned an invalid /json/list payload",
      };
    }

    const tabs = BrowserManager.normalizeAttachTabs(listOrError);
    const matches = tabs.filter((tab) => {
      if (selector.kind === "index") {
        return tab.index === selector.index;
      }

      if (selector.kind === "url") {
        return BrowserManager.matchesText(tab.url, selector.url);
      }

      return BrowserManager.matchesText(tab.title, selector.title);
    });

    const selectedTab = matches[0] ?? null;

    if (selectedTab) {
      this.attachSelection = {
        endpoint,
        tab: selectedTab,
        selectedAt: checkedAt,
      };
    }

    return {
      endpoint,
      checkedAt,
      selection: selector,
      matchedCount: matches.length,
      found: selectedTab !== null,
      selectedTab,
      tabs,
      message:
        selectedTab !== null
          ? `Selected tab #${selectedTab.index}: ${selectedTab.title || selectedTab.url}`
          : selector.kind === "index"
            ? `No CDP tab found at index ${selector.index}.`
            : selector.kind === "url"
              ? `No CDP tab matched URL "${selector.url}".`
              : `No CDP tab matched title "${selector.title}".`,
    };
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

  private async readNetworkEvents(url: string): Promise<NetworkEvent[] | { error: string }> {
    const page = await this.getPage(url);

    const rawEvents = await page.evaluate((globalKey) => {
      const windowWithNetwork = window as typeof window & {
        [key: string]: unknown;
      };
      const current = Reflect.get(windowWithNetwork, globalKey);
      return Array.isArray(current) ? current : [];
    }, BrowserManager.networkBufferGlobalKey);

    return rawEvents.map((event) => {
      const seed = event as Omit<NetworkEvent, "isHttpError">;
      const isHttpError = typeof seed.status === "number" && seed.status >= 400;
      return {
        ...seed,
        isHttpError,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // getNetworkEvents() — SCRUM-102
  // ---------------------------------------------------------------------------
  async getNetworkEvents(
    url: string,
    onlyErrors: boolean = false,
    limit: number = 100
  ): Promise<NetworkEventsResponse | { error: string }> {
    const start = Date.now();

    try {
      const page = await this.getPage(url);
      const eventsOrError = await this.readNetworkEvents(url);
      if ("error" in eventsOrError) return eventsOrError;

      const events = eventsOrError
        .filter((event) => (onlyErrors ? event.isHttpError || Boolean(event.error) : true))
        .slice(-limit);

      const statusCounts = events.reduce<Record<string, number>>((acc, event) => {
        const statusKey = event.status === null ? "no-status" : String(event.status);
        acc[statusKey] = (acc[statusKey] ?? 0) + 1;
        return acc;
      }, {});

      const summary = {
        total: events.length,
        httpErrorCount: events.filter((event) => event.isHttpError || Boolean(event.error)).length,
        statusCounts,
        urls: [...new Set(events.map((event) => event.url))],
      };

      return {
        url: await page.evaluate(() => document.URL),
        events,
        summary,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return this.handleError(e, url);
    }
  }

  // ---------------------------------------------------------------------------
  // getRuntimeTimeline() — SCRUM-97
  // ---------------------------------------------------------------------------
  async getRuntimeTimeline(url: string): Promise<RuntimeTimelineResponse | { error: string }> {
    const start = Date.now();

    try {
      const page = await this.getPage(url);
      const networkOrError = await this.readNetworkEvents(url);
      if ("error" in networkOrError) return networkOrError;

      const consoleTimeline = this.consoleEvents.map((event, index): RuntimeTimelineEvent => {
        const source: RuntimeTimelineSource = event.type === "exception" ? "exception" : "console";
        const level: RuntimeTimelineLevel =
          event.type === "warn"
            ? "warn"
            : event.type === "error"
              ? "error"
              : event.type === "exception"
                ? "exception"
                : "log";

        return {
          source,
          level,
          message: event.text,
          timestamp: event.timestamp,
          sequence: index,
          payload: event.location ? { location: event.location } : undefined,
        };
      });

      const networkTimeline = networkOrError.map((event, index): RuntimeTimelineEvent => ({
        source: "network",
        level: event.isHttpError || Boolean(event.error) ? "error" : "info",
        message: `${event.method} ${event.url}${event.status === null ? "" : ` -> ${event.status}`}`,
        timestamp: event.timestamp,
        sequence: index,
        payload: {
          type: event.type,
          url: event.url,
          method: event.method,
          status: event.status,
          durationMs: event.durationMs,
          error: event.error ?? null,
          isHttpError: event.isHttpError,
        },
      }));

      const events = [...consoleTimeline, ...networkTimeline].sort((a, b) => {
        const byTimestamp = a.timestamp.localeCompare(b.timestamp);
        if (byTimestamp !== 0) return byTimestamp;
        const bySource = BrowserManager.timelineSourceOrder[a.source] - BrowserManager.timelineSourceOrder[b.source];
        if (bySource !== 0) return bySource;
        return a.sequence - b.sequence;
      });

      const summary = events.reduce<RuntimeTimelineSummary>(
        (acc, event) => {
          acc.total += 1;
          acc.bySource[event.source] += 1;
          acc.byLevel[event.level] += 1;
          if (event.level === "error" || event.level === "exception") {
            acc.errorCount += 1;
          }
          return acc;
        },
        {
          total: 0,
          bySource: { console: 0, exception: 0, network: 0 },
          byLevel: { log: 0, warn: 0, error: 0, exception: 0, info: 0 },
          errorCount: 0,
        }
      );

      return {
        url: await page.evaluate(() => document.URL),
        events,
        summary,
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
