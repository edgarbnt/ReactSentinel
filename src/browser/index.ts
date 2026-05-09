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
  ReplayNavigationResponse,
  ReplaySequenceResponse,
  ReplayStep,
  ReplayStepResult,
  ReplayWaitUntil,
  SessionInfo,
} from "./protocol.js";
import type {
  RuntimeStatus,
  ComponentInspectionResponse,
  ComponentStateResponse,
  ConsoleEvent,
  ConsoleEventsResponse,
  InspectionResponseMode,
  RuntimeTimelineEvent,
  RuntimeTimelineLevel,
  RuntimeTimelineResponse,
  RuntimeTimelineSource,
  RuntimeTimelineSummary,
} from "../diagnostics/protocol.js";
import type { ReactRuntimeInspectRequest } from "../diagnostics/react-runtime.js";
import { detectReact } from "../diagnostics/react-detector.js";

export const DEFAULT_CDP_ENDPOINT = "http://127.0.0.1:9222";

type RuntimeBridgeInitArgs = {
  networkBufferGlobalKey: string;
  networkBufferLimit: number;
  runtimeBridgeInstalledGlobalKey: string;
};

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private replayHeadless = true;
  private attachedBrowser: Browser | null = null;
  private attachedPage: Page | null = null;
  private attachedEndpoint: string | null = null;
  private attachedTargetId: string | null = null;
  private attachSelection: { endpoint: string; tab: AttachTabInfo; selectedAt: string } | null = null;

  private consoleEvents: ConsoleEvent[] = [];
  private runtimeEventPage: Page | null = null;
  private readonly observedPages = new WeakSet<Page>();
  private static readonly networkBufferGlobalKey = "__RS_NETWORK_EVENTS__";
  private static readonly networkBufferLimit = 200;
  private static readonly runtimeBridgeInstalledGlobalKey = "__RS_RUNTIME_BRIDGE_INSTALLED__";
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

  private static buildAttachConsentMessage(tab: AttachTabInfo): string {
    const tabLabel = tab.title || tab.url;
    return [
      `Live browser mode needs explicit confirmation before React-Sentinel reuses tab #${tab.index}: ${tabLabel}.`,
      "With consent, React-Sentinel can inspect that tab's DOM, React tree, console output, and network activity, and can run interaction tools in that same tab.",
      "Only the selected tab is reused, and the selection is cleared if the tab closes or you select another tab.",
      "Re-run select_attach_tab with confirm: true if you want to allow this tab.",
    ].join(" ");
  }

  private static getRuntimeBridgeArgs(): RuntimeBridgeInitArgs {
    return {
      networkBufferGlobalKey: BrowserManager.networkBufferGlobalKey,
      networkBufferLimit: BrowserManager.networkBufferLimit,
      runtimeBridgeInstalledGlobalKey: BrowserManager.runtimeBridgeInstalledGlobalKey,
    };
  }

  private static readonly installRuntimeBridgeScript = ({
    networkBufferGlobalKey,
    networkBufferLimit,
    runtimeBridgeInstalledGlobalKey,
  }: RuntimeBridgeInitArgs): void => {
    type NetworkEventSeed = Omit<NetworkEvent, "isHttpError">;

    const windowWithNetwork = window as typeof window & {
      fetch: typeof fetch;
      [key: string]: unknown;
    };

    if (Reflect.get(windowWithNetwork, runtimeBridgeInstalledGlobalKey) === true) {
      return;
    }

    Reflect.set(windowWithNetwork, runtimeBridgeInstalledGlobalKey, true);

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

      const requestMethod =
        init?.method ??
        (input instanceof Request ? input.method : undefined) ??
        "GET";
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
  };

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

  /** Launch a replay Chromium instance (idempotent). */
  async launch(headless: boolean = this.replayHeadless): Promise<void> {
    if (this.browser && this.replayHeadless !== headless) {
      await this.closeReplaySession();
    }

    this.replayHeadless = headless;
    if (this.browser) return;

    this.browser = await chromium.launch({ headless: this.replayHeadless });
    this.context = await this.browser.newContext();
    await this.context.addInitScript(
      BrowserManager.installRuntimeBridgeScript,
      BrowserManager.getRuntimeBridgeArgs()
    );
    this.page = await this.context.newPage();

    this.activateRuntimePage(this.page);
    console.error(
      `[react-sentinel] Replay browser launched (${this.replayHeadless ? "headless" : "headed"} chromium, persistent session)`
    );
  }

  private setupListeners(page: Page): void {
    if (this.observedPages.has(page)) return;
    this.observedPages.add(page);

    page.on("console", (msg: ConsoleMessage) => {
      if (this.runtimeEventPage !== page) return;
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

    page.on("pageerror", (err: Error) => {
      if (this.runtimeEventPage !== page) return;
      this.consoleEvents.push({
        type: "exception",
        text: err.stack || err.message,
        timestamp: new Date().toISOString(),
      });
    });
  }

  private activateRuntimePage(page: Page): void {
    if (this.runtimeEventPage !== page) {
      this.consoleEvents = [];
      this.runtimeEventPage = page;
    }

    this.setupListeners(page);
  }

  private async installRuntimeBridge(page: Page): Promise<void> {
    const args = BrowserManager.getRuntimeBridgeArgs();
    await page.addInitScript(BrowserManager.installRuntimeBridgeScript, args);
    await page.evaluate(BrowserManager.installRuntimeBridgeScript, args);
  }

  private async readPageTitle(page: Page | null): Promise<string | null> {
    if (!page || page.isClosed()) return null;
    try {
      return await page.title();
    } catch {
      return null;
    }
  }

  async getSessionInfo(): Promise<SessionInfo> {
    const attachPageUrl =
      this.attachedPage && !this.attachedPage.isClosed()
        ? this.attachedPage.url()
        : this.attachSelection?.tab.url ?? null;
    const replayPageUrl =
      this.page && !this.page.isClosed()
        ? this.page.url()
        : null;
    const mode: SessionInfo["mode"] = this.attachSelection ? "attach" : "replay";
    const pageUrl = mode === "attach" ? attachPageUrl : replayPageUrl;
    const title =
      mode === "attach"
        ? (await this.readPageTitle(this.attachedPage)) ?? this.attachSelection?.tab.title ?? null
        : await this.readPageTitle(this.page);

    return {
      mode,
      connected: pageUrl !== null,
      pageUrl,
      title,
      replay: {
        active: this.page !== null && !this.page.isClosed(),
        config: {
          headless: this.replayHeadless,
        },
      },
      attach: {
        active: this.attachSelection !== null,
        endpoint: this.attachSelection?.endpoint ?? null,
        selectedTab: this.attachSelection?.tab ?? null,
      },
    };
  }

  private async closeReplaySession(): Promise<void> {
    const replayPage = this.page;
    if (!this.browser) return;

    try {
      await this.browser.close();
    } finally {
      this.browser = null;
      this.context = null;
      this.page = null;

      if (this.runtimeEventPage === replayPage) {
        this.runtimeEventPage = null;
        this.consoleEvents = [];
      }

      console.error("[react-sentinel] Replay browser closed");
    }
  }

  private formatNavigationError(error: unknown, url: string, timeoutMs: number): string {
    const raw = error instanceof Error ? error.message : String(error);
    if (raw.includes("ERR_CONNECTION_REFUSED") || raw.includes("ECONNREFUSED")) {
      return `Cannot connect to ${url} — is the app running?`;
    }

    if (raw.includes("ERR_NAME_NOT_RESOLVED")) {
      return `Cannot resolve ${url} — check the hostname.`;
    }

    if (raw.includes("Timeout") || raw.includes("timed out")) {
      return `Navigation to ${url} timed out after ${timeoutMs}ms.`;
    }

    const netError = raw.match(/net::ERR_[A-Z_]+/);
    if (netError) {
      return `Navigation to ${url} failed: ${netError[0]}.`;
    }

    return `Navigation to ${url} failed: ${raw}`;
  }

  private async clearAttachConnection(): Promise<void> {
    const attachedPage = this.attachedPage;

    try {
      if (this.attachedBrowser) {
        await this.attachedBrowser.close();
      }
    } finally {
      this.attachedBrowser = null;
      this.attachedPage = null;
      this.attachedEndpoint = null;
      this.attachedTargetId = null;

      if (this.runtimeEventPage === attachedPage) {
        this.runtimeEventPage = null;
        this.consoleEvents = [];
      }
    }
  }

  private async findAttachedPage(
    browser: Browser,
    targetId: string
  ): Promise<Page | null> {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        if (page.isClosed()) continue;

        const session = await context.newCDPSession(page);
        try {
          const targetInfo = (await session.send("Target.getTargetInfo")) as {
            targetInfo?: { targetId?: string };
          };

          if (targetInfo.targetInfo?.targetId === targetId) {
            return page;
          }
        } finally {
          await session.detach().catch(() => undefined);
        }
      }
    }

    return null;
  }

  private async getAttachedPage(): Promise<Page> {
    const selection = this.attachSelection;
    if (!selection) {
      throw new Error("No CDP tab is currently selected. Run select_attach_tab with confirm: true first.");
    }

    if (
      this.attachedBrowser &&
      this.attachedPage &&
      !this.attachedPage.isClosed() &&
      this.attachedEndpoint === selection.endpoint &&
      this.attachedTargetId === selection.tab.id
    ) {
      this.activateRuntimePage(this.attachedPage);
      return this.attachedPage;
    }

    await this.clearAttachConnection();

    const browser = await chromium.connectOverCDP(selection.endpoint);

    try {
      const attachedPage = await this.findAttachedPage(browser, selection.tab.id);
      if (!attachedPage) {
        this.attachSelection = null;
        throw new Error(
          "The selected CDP tab is no longer available. Run get_attach_tabs and select_attach_tab again."
        );
      }

      await this.installRuntimeBridge(attachedPage);

      this.attachedBrowser = browser;
      this.attachedPage = attachedPage;
      this.attachedEndpoint = selection.endpoint;
      this.attachedTargetId = selection.tab.id;
      this.activateRuntimePage(attachedPage);

      return attachedPage;
    } catch (error) {
      await browser.close().catch(() => undefined);
      throw error;
    }
  }

  /** Close browser and release all resources. */
  async close(): Promise<void> {
    await this.clearAttachConnection();
    await this.closeReplaySession();
  }

  /** Gets the persistent replay page, navigating if the URL is different. */
  public async getSandboxPage(
    url: string,
    options?: {
      headless?: boolean;
      waitUntil?: ReplayWaitUntil;
      timeoutMs?: number;
      resetSession?: boolean;
    }
  ): Promise<Page> {
    const {
      headless,
      waitUntil = "domcontentloaded",
      timeoutMs = 10_000,
      resetSession = false,
    } = options ?? {};
    if (resetSession) {
      await this.closeReplaySession();
    }

    await this.launch(headless);

    const currentUrl = this.page!.url();
    // Normalize urls to ignore trailing slashes
    const normalizedCurrent = currentUrl.replace(/\/$/, "");
    const normalizedTarget = url.replace(/\/$/, "");

    if (normalizedCurrent !== normalizedTarget || currentUrl === "about:blank") {
      this.consoleEvents = []; // Clear events on new navigation
      let response;

      try {
        response = await this.page!.goto(url, {
          timeout: timeoutMs,
          waitUntil,
        });
      } catch (error) {
        throw new Error(this.formatNavigationError(error, url, timeoutMs));
      }

      if (!response || !response.ok()) {
        throw new Error(`Navigation to ${url} failed with HTTP ${response?.status() ?? "no response"}.`);
      }

      await this.installRuntimeBridge(this.page!);
    }

    this.activateRuntimePage(this.page!);
    return this.page!;
  }

  private async getRuntimePage(url: string): Promise<Page> {
    if (this.attachSelection) {
      return this.getAttachedPage();
    }

    const page = await this.getSandboxPage(url);
    this.activateRuntimePage(page);
    return page;
  }

  private async getReplayPageForSequence(
    url?: string,
    options?: {
      headless?: boolean;
      timeoutMs?: number;
      waitUntil?: ReplayWaitUntil;
      resetSession?: boolean;
    }
  ): Promise<Page> {
    if (url) {
      return this.getSandboxPage(url, options);
    }

    if (!this.page || this.page.isClosed() || this.page.url() === "about:blank") {
      throw new Error("No replay session is active. Call navigate_replay first or provide a URL.");
    }

    this.activateRuntimePage(this.page);
    return this.page;
  }

  private static buildAttachHelpMessage(): string {
    return BrowserManager.cdpHelpMessage;
  }

  async navigateReplay(
    url: string,
    options?: {
      headless?: boolean;
      waitUntil?: ReplayWaitUntil;
      timeoutMs?: number;
      resetSession?: boolean;
    }
  ): Promise<ReplayNavigationResponse | { error: string }> {
    const waitUntil = options?.waitUntil ?? "domcontentloaded";
    const timeoutMs = options?.timeoutMs ?? 10_000;

    try {
      const page = await this.getSandboxPage(url, {
        headless: options?.headless,
        waitUntil,
        timeoutMs,
        resetSession: options?.resetSession,
      });

      return {
        session: await this.getSessionInfo(),
        url: await page.evaluate(() => document.URL),
        title: await page.title(),
        navigatedAt: new Date().toISOString(),
        waitUntil,
        timeoutMs,
      };
    } catch (error) {
      return this.handleError(error, url);
    }
  }

  async getAttachStatus(
    endpoint: string = DEFAULT_CDP_ENDPOINT
  ): Promise<AttachStatus> {
    const checkedAt = new Date().toISOString();
    const help = BrowserManager.buildAttachHelpMessage();
    const timeoutMs = 2000;

    const versionOrError = await this.readCdpJson<CdpVersionInfo>(endpoint, "/json/version", timeoutMs);

    if ("error" in versionOrError) {
      const { error } = versionOrError;
      // Errors that indicate the server was reachable but returned an invalid response
      const reachable =
        error.startsWith("CDP endpoint responded with HTTP") ||
        error.startsWith("CDP endpoint returned an invalid");
      return {
        endpoint,
        checkedAt,
        status: "attach_unavailable",
        ready: false,
        reachable,
        help,
        error,
      };
    }

    const version = versionOrError;

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

    const hasCurrentSelection =
      this.attachSelection?.endpoint === endpoint &&
      tabs.some((tab) => tab.id === this.attachSelection?.tab.id);

    if (this.attachSelection?.endpoint === endpoint && !hasCurrentSelection) {
      this.attachSelection = null;
      await this.clearAttachConnection();
    }

    const selectedTab = hasCurrentSelection
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
    selector: AttachTabSelector,
    confirm: boolean = false
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
      if (!confirm) {
        await this.clearAttachConnection();
        this.attachSelection = null;

        return {
          endpoint,
          checkedAt,
          selection: selector,
          matchedCount: matches.length,
          found: true,
          confirmed: false,
          requiresConfirmation: true,
          selectedTab: null,
          candidateTab: selectedTab,
          tabs,
          message: BrowserManager.buildAttachConsentMessage(selectedTab),
        };
      }

      await this.clearAttachConnection();
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
      confirmed: selectedTab !== null,
      requiresConfirmation: false,
      selectedTab,
      candidateTab: selectedTab,
      tabs,
      message:
        selectedTab !== null
          ? `Selected tab #${selectedTab.index}: ${selectedTab.title || selectedTab.url}. Live browser mode is now enabled for this tab.`
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
      const page = await this.getRuntimePage(url);
      return await page.evaluate(script);
    } catch (e) {
      return this.handleError(e, url) as { error: string };
    }
  }

  private handleError(e: unknown, url: string) {
    const msg = e instanceof Error ? e.message : String(e);
    const isConnRefused = msg.includes("ECONNREFUSED") || msg.includes("ERR_CONNECTION_REFUSED");
    return {
      error: isConnRefused ? `Cannot connect to ${url} — is the app running?` : msg,
    };
  }

  private handleInspectionError(
    e: unknown,
    url: string,
    operation: "get_react_tree" | "inspect_component" | "get_component_state"
  ) {
    const raw = this.handleError(e, url).error;
    const code =
      raw.includes("Cannot connect to")
        ? "runtime_unreachable"
        : raw.includes("Execution context was destroyed")
          ? "page_reloaded"
          : "inspection_failed";

    return {
      error: `[${operation}:${code}] ${raw}`,
    };
  }

  // ---------------------------------------------------------------------------
  // ping() — SCRUM-20
  // ---------------------------------------------------------------------------
  async ping(url: string): Promise<BrowserResult> {
    const start = Date.now();
    const type = "ping" as const;

    try {
      const page = await this.getSandboxPage(url);
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
      const page = await this.getRuntimePage(url);

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
      const page = await this.getRuntimePage(url);

      const { inspectReactRuntime } = await import("../diagnostics/react-runtime.js");
      const request: ReactRuntimeInspectRequest = {
        mode: "tree",
        maxDepth,
        includeHostNodes,
      };
      const result = await page.evaluate(inspectReactRuntime, request);

      return {
        url: await page.evaluate(() => document.URL),
        tree: result.tree ?? null,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return this.handleInspectionError(e, url, "get_react_tree");
    }
  }

  // ---------------------------------------------------------------------------
  // inspectComponent() — SCRUM-9
  // ---------------------------------------------------------------------------
  async inspectComponent(
    url: string,
    componentName: string,
    responseMode: InspectionResponseMode = "full"
  ): Promise<ComponentInspectionResponse | { error: string }> {
    const start = Date.now();

    try {
      const page = await this.getRuntimePage(url);

      const { inspectReactRuntime } = await import("../diagnostics/react-runtime.js");
      const request: ReactRuntimeInspectRequest = {
        mode: "component",
        componentName,
        compact: responseMode === "compact",
      };
      const result = await page.evaluate(inspectReactRuntime, request);
      const componentNode = result.component ?? null;

      return {
        url: await page.evaluate(() => document.URL),
        componentName,
        responseMode,
        found: componentNode !== null,
        component: componentNode,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return this.handleInspectionError(e, url, "inspect_component");
    }
  }

  // ---------------------------------------------------------------------------
  // getComponentState() — SCRUM-110
  // ---------------------------------------------------------------------------
  async getComponentState(
    url: string,
    componentName: string,
    responseMode: InspectionResponseMode = "full"
  ): Promise<ComponentStateResponse | { error: string }> {
    const start = Date.now();

    try {
      const page = await this.getRuntimePage(url);

      const { inspectReactRuntime } = await import("../diagnostics/react-runtime.js");
      const request: ReactRuntimeInspectRequest = {
        mode: "component-state",
        componentName,
        compact: responseMode === "compact",
      };
      const result = await page.evaluate(inspectReactRuntime, request);
      const state = result.state ?? null;

      return {
        url: await page.evaluate(() => document.URL),
        componentName,
        responseMode,
        found: state !== null,
        state,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return this.handleInspectionError(e, url, "get_component_state");
    }
  }

  // ---------------------------------------------------------------------------
  // getConsoleEvents() — SCRUM-8
  // ---------------------------------------------------------------------------
  async getConsoleEvents(url: string): Promise<ConsoleEventsResponse | { error: string }> {
    const start = Date.now();
    try {
      const page = await this.getRuntimePage(url);

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

  private async readNetworkEvents(page: Page): Promise<NetworkEvent[]> {
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
      const page = await this.getRuntimePage(url);
      const events = await this.readNetworkEvents(page);

      const filteredEvents = events
        .filter((event) => (onlyErrors ? event.isHttpError || Boolean(event.error) : true))
        .slice(-limit);

      const statusCounts = filteredEvents.reduce<Record<string, number>>((acc, event) => {
        const statusKey = event.status === null ? "no-status" : String(event.status);
        acc[statusKey] = (acc[statusKey] ?? 0) + 1;
        return acc;
      }, {});

      const summary = {
        total: filteredEvents.length,
        httpErrorCount: filteredEvents.filter((event) => event.isHttpError || Boolean(event.error)).length,
        statusCounts,
        urls: [...new Set(filteredEvents.map((event) => event.url))],
      };

      return {
        url: await page.evaluate(() => document.URL),
        events: filteredEvents,
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
      const page = await this.getRuntimePage(url);
      const networkEvents = await this.readNetworkEvents(page);

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

      const networkTimeline = networkEvents.map((event, index): RuntimeTimelineEvent => ({
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

  private async runReplayStep(page: Page, step: ReplayStep): Promise<Omit<ReplayStepResult, "index" | "url">> {
    const start = Date.now();

    try {
      if (step.action === "wait") {
        await page.waitForTimeout(step.durationMs);
        return {
          step,
          success: true,
          durationMs: Date.now() - start,
        };
      }

      if (step.action === "press") {
        if (step.selector) {
          await page.waitForSelector(step.selector, {
            state: "visible",
            timeout: step.timeoutMs ?? 3_000,
          });
          await page.locator(step.selector).press(step.key);
        } else {
          await page.keyboard.press(step.key);
        }

        return {
          step,
          success: true,
          durationMs: Date.now() - start,
        };
      }

      await page.waitForSelector(step.selector, {
        state: "visible",
        timeout: step.timeoutMs ?? 3_000,
      });

      const element = page.locator(step.selector);
      if (step.action === "click") {
        await element.click();
      } else {
        await element.fill(step.value);
      }

      return {
        step,
        success: true,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        step,
        success: false,
        durationMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async replayInteractions(
    steps: ReplayStep[],
    options?: {
      url?: string;
      headless?: boolean;
      timeoutMs?: number;
      waitUntil?: ReplayWaitUntil;
      resetSession?: boolean;
      continueOnError?: boolean;
    }
  ): Promise<ReplaySequenceResponse | { error: string }> {
    const startedAt = new Date().toISOString();
    const start = Date.now();

    try {
      const page = await this.getReplayPageForSequence(options?.url, {
        headless: options?.headless,
        timeoutMs: options?.timeoutMs,
        waitUntil: options?.waitUntil,
        resetSession: options?.resetSession,
      });
      const results: ReplayStepResult[] = [];

      for (const [index, step] of steps.entries()) {
        const result = await this.runReplayStep(page, step);
        results.push({
          index,
          url: await page.evaluate(() => document.URL),
          ...result,
        });

        if (!result.success && !options?.continueOnError) {
          break;
        }
      }

      return {
        session: await this.getSessionInfo(),
        url: await page.evaluate(() => document.URL),
        startedAt,
        durationMs: Date.now() - start,
        success: results.every((result) => result.success),
        steps: results,
      };
    } catch (error) {
      return options?.url ? this.handleError(error, options.url) : { error: String(error) };
    }
  }

  // ---------------------------------------------------------------------------
  // simulateInteraction() — SCRUM-13
  // ---------------------------------------------------------------------------
  async simulateInteraction(
    url: string,
    action: "click" | "type" | "fill" | "press",
    selector: string,
    value?: string,
    key?: string
  ): Promise<import("./protocol.js").InteractionData> {
    const start = Date.now();
    try {
      const page = await this.getRuntimePage(url);

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
      } else if (action === "press") {
        await element.press(key || "Enter");
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
      const page = await this.getRuntimePage(url);

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
