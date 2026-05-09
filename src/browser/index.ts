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
import type { Browser, BrowserContext, CDPSession, Page, ConsoleMessage } from "playwright";
import type {
  Assertion,
  AssertionPrimitive,
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
  RuntimePatch,
  RuntimePatchApplyResponse,
  RuntimePatchExecutionResult,
  RuntimePatchInfo,
  RuntimePatchResetResponse,
  RuntimePatchResetStrategy,
  RuntimePatchTransport,
  SessionInfo,
  ValidationResult,
  ValidationScenarioResponse,
} from "./protocol.js";
import type {
  RuntimeStatus,
  ComponentInspectionResponse,
  ComponentStateResponse,
  ConsoleEvent,
  ConsoleEventsResponse,
  HookChangesResponse,
  InspectionResponseMode,
  RenderCountsResponse,
  RenderHotspotsResponse,
  RuntimeTimelineEvent,
  RuntimeTimelineLevel,
  RuntimeTimelineResponse,
  RuntimeTimelineSource,
  RuntimeTimelineSummary,
} from "../diagnostics/protocol.js";
import type { ReactRuntimeInspectRequest } from "../diagnostics/react-runtime.js";
import { detectReact } from "../diagnostics/react-detector.js";
import {
  buildRenderMonitorSource,
  readHookChangesState,
  readRenderCountsState,
  readRenderHotspotsState,
  type RenderMonitorInitArgs,
} from "../diagnostics/render-monitor.js";

export const DEFAULT_CDP_ENDPOINT = "http://127.0.0.1:9222";

type RuntimeBridgeInitArgs = {
  networkBufferGlobalKey: string;
  networkBufferLimit: number;
  runtimeBridgeInstalledGlobalKey: string;
};

type NormalizedRuntimePatch = Omit<RuntimePatch, "metadata"> & {
  metadata: RuntimePatch["metadata"] & {
    id: string;
  };
};

type RuntimePatchRecord = RuntimePatchInfo & {
  initScriptIdentifier: string | null;
  removable: boolean;
  transport: RuntimePatchTransport;
};

function buildRuntimeBridgeSource(args: RuntimeBridgeInitArgs): string {
  return `(() => {
    const { networkBufferGlobalKey, networkBufferLimit, runtimeBridgeInstalledGlobalKey } = ${JSON.stringify(args)};
    const windowWithNetwork = window;
    if (Reflect.get(windowWithNetwork, runtimeBridgeInstalledGlobalKey) === true) {
      return;
    }

    const getBuffer = () => {
      const current = Reflect.get(windowWithNetwork, networkBufferGlobalKey);
      if (Array.isArray(current)) {
        return current;
      }
      const emptyBuffer = [];
      Reflect.set(windowWithNetwork, networkBufferGlobalKey, emptyBuffer);
      return emptyBuffer;
    };

    const pushEvent = (event) => {
      const buffer = getBuffer();
      buffer.push(event);
      if (buffer.length > networkBufferLimit) {
        buffer.splice(0, buffer.length - networkBufferLimit);
      }
    };

    const originalFetch = windowWithNetwork.fetch.bind(windowWithNetwork);
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    const originalXhrSend = XMLHttpRequest.prototype.send;

    windowWithNetwork.fetch = async (input, init) => {
      const startedAt = Date.now();
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const requestMethod =
        (init && init.method) ||
        (input instanceof Request ? input.method : undefined) ||
        "GET";

      try {
        const response = await originalFetch(input, init);
        pushEvent({
          type: "fetch",
          url: requestUrl,
          method: String(requestMethod).toUpperCase(),
          status: response.status,
          durationMs: Date.now() - startedAt,
          timestamp: new Date().toISOString(),
        });
        return response;
      } catch (error) {
        pushEvent({
          type: "fetch",
          url: requestUrl,
          method: String(requestMethod).toUpperCase(),
          status: null,
          durationMs: Date.now() - startedAt,
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    };

    XMLHttpRequest.prototype.open = function(method, url, async, username, password) {
      Reflect.set(this, "__rsMethod", String(method).toUpperCase());
      Reflect.set(this, "__rsUrl", typeof url === "string" ? url : url.toString());
      originalXhrOpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
    };

    XMLHttpRequest.prototype.send = function(body) {
      this.addEventListener("loadend", () => {
        const method = Reflect.get(this, "__rsMethod");
        const url = Reflect.get(this, "__rsUrl");
        const startedAt = Reflect.get(this, "__rsStartedAt");
        const durationMs = typeof startedAt === "number" ? Date.now() - startedAt : 0;

        if (typeof method === "string" && typeof url === "string") {
          const status = Number.isFinite(this.status) ? this.status : null;
          pushEvent({
            type: "xhr",
            method,
            url,
            status,
            durationMs,
            timestamp: new Date().toISOString(),
            ...(status === 0 ? { error: "XMLHttpRequest failed" } : {}),
          });
        }
      }, { once: true });

      Reflect.set(this, "__rsStartedAt", Date.now());
      originalXhrSend.call(this, body);
    };

    getBuffer();
    Reflect.set(windowWithNetwork, runtimeBridgeInstalledGlobalKey, true);
  })();`;
}

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private replayHeadless = true;
  private replaySessionId: number | null = null;
  private nextReplaySessionId = 1;
  private attachedBrowser: Browser | null = null;
  private attachedPage: Page | null = null;
  private attachedEndpoint: string | null = null;
  private attachedTargetId: string | null = null;
  private attachSelection: { endpoint: string; tab: AttachTabInfo; selectedAt: string } | null = null;
  private activeRuntimePatches: RuntimePatchRecord[] = [];

  private consoleEvents: ConsoleEvent[] = [];
  private runtimeEventPage: Page | null = null;
  private readonly observedPages = new WeakSet<Page>();
  private static readonly networkBufferGlobalKey = "__RS_NETWORK_EVENTS__";
  private static readonly networkBufferLimit = 200;
  private static readonly runtimeBridgeInstalledGlobalKey = "__RS_RUNTIME_BRIDGE_INSTALLED__";
  private static readonly renderMonitorGlobalKey = "__RS_RENDER_MONITOR__";
  private static readonly renderMonitorInstalledGlobalKey = "__RS_RENDER_MONITOR_INSTALLED__";
  private static readonly renderMonitorMaxEntries = 200;
  private static readonly renderMonitorSamplesPerComponent = 25;
  private static readonly runtimePatchStateGlobalKey = "__RS_RUNTIME_PATCH_STATE__";
  private static readonly maxRuntimePatchSourceLength = 20_000;
  private static readonly reservedRuntimePatchIds = new Set(["__proto__", "prototype", "constructor"]);
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

  private static getRenderMonitorArgs(): RenderMonitorInitArgs {
    return {
      globalKey: BrowserManager.renderMonitorGlobalKey,
      installedGlobalKey: BrowserManager.renderMonitorInstalledGlobalKey,
      maxEntries: BrowserManager.renderMonitorMaxEntries,
      maxSamplesPerComponent: BrowserManager.renderMonitorSamplesPerComponent,
    };
  }

  private static getPathSegments(path?: string): string[] {
    return typeof path === "string"
      ? path
          .split(".")
          .map((segment) => segment.trim())
          .filter((segment) => segment.length > 0)
      : [];
  }

  private static readValueAtPath(value: unknown, path?: string): unknown {
    const segments = BrowserManager.getPathSegments(path);
    let current = value;

    for (const segment of segments) {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (Array.isArray(current)) {
        const index = Number(segment);
        if (!Number.isInteger(index)) {
          return undefined;
        }
        current = current[index];
        continue;
      }

      if (typeof current !== "object") {
        return undefined;
      }

      current = Reflect.get(current, segment);
    }

    return current;
  }

  private static isAssertionPrimitive(value: unknown): value is AssertionPrimitive {
    return value === null || ["string", "number", "boolean"].includes(typeof value);
  }

  private static formatPathLabel(path?: string): string {
    return path && path.trim().length > 0 ? path : "(root)";
  }

  private static normalizeRuntimePatch(patch: RuntimePatch): NormalizedRuntimePatch | { error: string } {
    const source = patch.source.trim();
    if (patch.type !== "script") {
      return {
        error: `Unsupported runtime patch type "${patch.type}". Sprint 9 only supports "script".`,
      };
    }

    if (patch.target !== "page") {
      return {
        error: `Unsupported runtime patch target "${patch.target}". Sprint 9 only supports "page".`,
      };
    }

    if (!patch.metadata.expiresWithSession) {
      return {
        error: "Runtime patches must declare metadata.expiresWithSession = true.",
      };
    }

    if (source.length === 0) {
      return {
        error: "Runtime patch source cannot be empty.",
      };
    }

    if (source.length > BrowserManager.maxRuntimePatchSourceLength) {
      return {
        error: `Runtime patch source exceeds ${BrowserManager.maxRuntimePatchSourceLength} characters.`,
      };
    }

    const rawId = patch.metadata.id?.trim();
    const id =
      rawId && rawId.length > 0
        ? rawId
        : `patch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    if (BrowserManager.reservedRuntimePatchIds.has(id)) {
      return {
        error: `Runtime patch id "${id}" is reserved. Please use a different metadata.id value.`,
      };
    }
    const label = patch.metadata.label?.trim();

    return {
      ...patch,
      source,
      metadata: {
        ...patch.metadata,
        id,
        ...(label ? { label } : {}),
      },
    };
  }

  private static buildRuntimePatchExecutionSource(patch: NormalizedRuntimePatch): string {
    return `(() => {
      const patch = ${JSON.stringify(patch)};
      const globalKey = ${JSON.stringify(BrowserManager.runtimePatchStateGlobalKey)};
      const windowWithState = window;
      const createActiveRegistry = (value) => {
        const registry = Object.create(null);
        if (value && typeof value === "object" && !Array.isArray(value)) {
          for (const key of Object.keys(value)) {
            registry[key] = value[key];
          }
        }
        return registry;
      };
      const ensureState = () => {
        const existing = Reflect.get(windowWithState, globalKey);
        if (existing && typeof existing === "object" && !Array.isArray(existing)) {
          const activeValue = existing.active;
          const activePrototype =
            activeValue && typeof activeValue === "object" ? Object.getPrototypeOf(activeValue) : null;
          if (
            !activeValue ||
            typeof activeValue !== "object" ||
            Array.isArray(activeValue) ||
            (activePrototype !== null && activePrototype !== Object.prototype)
          ) {
            existing.active = createActiveRegistry(activeValue);
          } else if (activePrototype === Object.prototype) {
            existing.active = createActiveRegistry(activeValue);
          }
          if (!Array.isArray(existing.errors)) {
            existing.errors = [];
          }
          return existing;
        }
        const initialState = { active: createActiveRegistry(null), errors: [] };
        Reflect.set(windowWithState, globalKey, initialState);
        return initialState;
      };
      const toPreview = (value) => {
        if (value === undefined || value === null) {
          return null;
        }
        const valueType = typeof value;
        if (valueType === "string" || valueType === "number" || valueType === "boolean") {
          return value;
        }
        try {
          return JSON.parse(JSON.stringify(value));
        } catch {
          return Object.prototype.toString.call(value);
        }
      };
      const state = ensureState();
      if (Object.prototype.hasOwnProperty.call(state.active, patch.metadata.id)) {
        return {
          status: "already_applied",
          result: state.active[patch.metadata.id].result ?? null,
        };
      }
      try {
        const executor = new Function("window", "globalThis", "patch", patch.source);
        const rawResult = executor(windowWithState, globalThis, patch);
        const result = toPreview(rawResult);
        state.active[patch.metadata.id] = {
          appliedAt: new Date().toISOString(),
          label: patch.metadata.label ?? null,
          result,
        };
        return {
          status: "applied",
          result,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        state.errors.push({
          patchId: patch.metadata.id,
          message,
          stack: error instanceof Error ? error.stack ?? null : null,
          timestamp: new Date().toISOString(),
        });
        throw new Error("[runtime_patch:" + patch.metadata.id + "] " + message);
      }
    })();`;
  }

  private static buildRuntimePatchInfo(record: RuntimePatchRecord): RuntimePatchInfo {
    return {
      id: record.id,
      type: record.type,
      target: record.target,
      label: record.label,
      source: record.source,
      appliedAt: record.appliedAt,
      sessionId: record.sessionId,
      scope: "replay_session",
    };
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

  /** Launch a replay Chromium instance (idempotent). */
  async launch(headless: boolean = this.replayHeadless): Promise<void> {
    if (this.browser && this.replayHeadless !== headless) {
      await this.closeReplaySession();
    }

    this.replayHeadless = headless;
    if (this.browser) return;

    this.browser = await chromium.launch({ headless: this.replayHeadless });
    this.context = await this.browser.newContext();
    this.replaySessionId = this.nextReplaySessionId++;
    this.activeRuntimePatches = [];

    // Install runtime observers before the first page load.
    const installerSource = buildRuntimeBridgeSource(BrowserManager.getRuntimeBridgeArgs());
    await this.context.addInitScript({ content: installerSource });
    const renderMonitorSource = buildRenderMonitorSource(BrowserManager.getRenderMonitorArgs());
    await this.context.addInitScript({ content: renderMonitorSource });

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
    const installerSource = buildRuntimeBridgeSource(BrowserManager.getRuntimeBridgeArgs());
    await page.addInitScript({ content: installerSource });
    await page.evaluate(installerSource);
    const renderMonitorSource = buildRenderMonitorSource(BrowserManager.getRenderMonitorArgs());
    await page.addInitScript({ content: renderMonitorSource });
    await page.evaluate(renderMonitorSource);
  }

  private async ensureRuntimeBridgeOnPage(page: Page): Promise<void> {
    // For pages from our replay context, the init script is already registered.
    // We just need to evaluate it to ensure it's active on the current page state.
    const installerSource = buildRuntimeBridgeSource(BrowserManager.getRuntimeBridgeArgs());
    await page.evaluate(installerSource);
    const renderMonitorSource = buildRenderMonitorSource(BrowserManager.getRenderMonitorArgs());
    await page.evaluate(renderMonitorSource);
  }

  private async readPageTitle(page: Page | null): Promise<string | null> {
    if (!page || page.isClosed()) return null;
    try {
      return await page.title();
    } catch {
      return null;
    }
  }

  private async ensureReplaySession(options?: {
    headless?: boolean;
    resetSession?: boolean;
  }): Promise<Page> {
    if (options?.resetSession) {
      await this.closeReplaySession();
    }

    await this.launch(options?.headless);
    this.activateRuntimePage(this.page!);
    return this.page!;
  }

  private async navigatePage(
    page: Page,
    url: string,
    waitUntil: ReplayWaitUntil,
    timeoutMs: number
  ): Promise<void> {
    const currentUrl = page.url();
    const normalizedCurrent = currentUrl.replace(/\/$/, "");
    const normalizedTarget = url.replace(/\/$/, "");

    if (normalizedCurrent === normalizedTarget && currentUrl !== "about:blank") {
      await this.ensureRuntimeBridgeOnPage(page);
      return;
    }

    this.consoleEvents = [];
    let response;

    try {
      response = await page.goto(url, {
        timeout: timeoutMs,
        waitUntil,
      });
    } catch (error) {
      throw new Error(this.formatNavigationError(error, url, timeoutMs));
    }

    if (!response || !response.ok()) {
      throw new Error(`Navigation to ${url} failed with HTTP ${response?.status() ?? "no response"}.`);
    }

    await this.ensureRuntimeBridgeOnPage(page);
  }

  private async openPatchCdpSession(page: Page): Promise<CDPSession | null> {
    try {
      return await page.context().newCDPSession(page);
    } catch {
      return null;
    }
  }

  private async removeRuntimePatchInitScripts(page: Page, patches: RuntimePatchRecord[]): Promise<void> {
    const removablePatches = patches.filter((patch) => typeof patch.initScriptIdentifier === "string");
    if (removablePatches.length === 0) {
      return;
    }

    const cdpSession = await this.openPatchCdpSession(page);
    if (!cdpSession) {
      throw new Error("CDP removal is unavailable for the active replay page. Use strategy \"reset_session\" instead.");
    }

    try {
      for (const patch of removablePatches) {
        const identifier = patch.initScriptIdentifier;
        if (!identifier) continue;
        await cdpSession.send("Page.removeScriptToEvaluateOnNewDocument", {
          identifier,
        });
      }
    } finally {
      await cdpSession.detach().catch(() => undefined);
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
    const connected =
      mode === "attach"
        ? this.attachedPage !== null && !this.attachedPage.isClosed()
        : this.page !== null && !this.page.isClosed();
    const title =
      mode === "attach"
        ? (await this.readPageTitle(this.attachedPage)) ?? this.attachSelection?.tab.title ?? null
        : await this.readPageTitle(this.page);

    return {
      mode,
      connected,
      pageUrl,
      title,
      replay: {
        active: this.page !== null && !this.page.isClosed(),
        sessionId: this.replaySessionId,
        config: {
          headless: this.replayHeadless,
        },
        patches: {
          activeCount: this.activeRuntimePatches.length,
          patchIds: [...new Set(this.activeRuntimePatches.map((patch) => patch.id))],
          sessionScoped: true,
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
      this.replaySessionId = null;
      this.activeRuntimePatches = [];

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
    const page = await this.ensureReplaySession({
      headless,
      resetSession,
    });

    await this.navigatePage(page, url, waitUntil, timeoutMs);
    this.activateRuntimePage(page);
    return page;
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
    operation:
      | "get_react_tree"
      | "inspect_component"
      | "get_component_state"
      | "get_render_counts"
      | "get_render_hotspots"
      | "get_hook_changes"
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
  // getRenderCounts() — Sprint 10
  // ---------------------------------------------------------------------------
  async getRenderCounts(url: string, limit: number = 50): Promise<RenderCountsResponse | { error: string }> {
    const start = Date.now();

    try {
      const page = await this.getRuntimePage(url);
      const state = await page.evaluate((globalKey) => {
        const current = Reflect.get(window as typeof window & Record<string, unknown>, globalKey);
        return current && typeof current === "object" ? current : null;
      }, BrowserManager.renderMonitorGlobalKey);
      const result = readRenderCountsState(state, { limit });

      return {
        url: await page.evaluate(() => document.URL),
        counts: result.counts.map((entry) => ({
          componentName: entry.componentName,
          pathText: entry.pathText,
          count: entry.count,
          firstSeen: entry.firstSeen,
          lastSeen: entry.lastSeen,
        })),
        summary: result.summary,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return this.handleInspectionError(e, url, "get_render_counts");
    }
  }

  // ---------------------------------------------------------------------------
  // getRenderHotspots() — Sprint 10
  // ---------------------------------------------------------------------------
  async getRenderHotspots(
    url: string,
    threshold: number = 8,
    windowMs: number = 1000,
    limit: number = 20
  ): Promise<RenderHotspotsResponse | { error: string }> {
    const start = Date.now();

    try {
      const page = await this.getRuntimePage(url);
      const state = await page.evaluate((globalKey) => {
        const current = Reflect.get(window as typeof window & Record<string, unknown>, globalKey);
        return current && typeof current === "object" ? current : null;
      }, BrowserManager.renderMonitorGlobalKey);
      const result = readRenderHotspotsState(state, { threshold, windowMs, limit });

      return {
        url: await page.evaluate(() => document.URL),
        threshold: result.threshold,
        windowMs: result.windowMs,
        hotspots: result.hotspots,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return this.handleInspectionError(e, url, "get_render_hotspots");
    }
  }

  // ---------------------------------------------------------------------------
  // getHookChanges() — Sprint 10
  // ---------------------------------------------------------------------------
  async getHookChanges(
    url: string,
    componentName: string,
    pathText?: string,
    limit: number = 50
  ): Promise<HookChangesResponse | { error: string }> {
    const start = Date.now();

    try {
      const page = await this.getRuntimePage(url);
      const state = await page.evaluate((globalKey) => {
        const current = Reflect.get(window as typeof window & Record<string, unknown>, globalKey);
        return current && typeof current === "object" ? current : null;
      }, BrowserManager.renderMonitorGlobalKey);
      const result = readHookChangesState(state, {
        componentName,
        pathText,
        limit,
      });

      return {
        url: await page.evaluate(() => document.URL),
        componentName,
        pathText: result.pathText,
        found: result.found,
        changes: result.changes,
        summary: result.summary,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return this.handleInspectionError(e, url, "get_hook_changes");
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

  private async clearNetworkEventsBuffer(page: Page): Promise<number> {
    return page.evaluate((globalKey) => {
      const windowWithNetwork = window as typeof window & {
        [key: string]: unknown;
      };
      const current = Reflect.get(windowWithNetwork, globalKey);
      const cleared = Array.isArray(current) ? current.length : 0;
      Reflect.set(windowWithNetwork, globalKey, []);
      return cleared;
    }, BrowserManager.networkBufferGlobalKey);
  }

  async clearRuntimeSignals(url: string): Promise<{ consoleCleared: number; networkCleared: number } | { error: string }> {
    try {
      const page = await this.getRuntimePage(url);
      const consoleCleared = this.consoleEvents.length;
      this.consoleEvents = [];
      const networkCleared = await this.clearNetworkEventsBuffer(page);
      return {
        consoleCleared,
        networkCleared,
      };
    } catch (e) {
      return this.handleError(e, url);
    }
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

  async applyRuntimePatch(
    patch: RuntimePatch,
    options?: {
      url?: string;
      headless?: boolean;
      timeoutMs?: number;
      waitUntil?: ReplayWaitUntil;
      resetSession?: boolean;
    }
  ): Promise<RuntimePatchApplyResponse | { error: string }> {
    const normalizedPatchOrError = BrowserManager.normalizeRuntimePatch(patch);
    if ("error" in normalizedPatchOrError) {
      return normalizedPatchOrError;
    }

    const waitUntil = options?.waitUntil ?? "domcontentloaded";
    const timeoutMs = options?.timeoutMs ?? 10_000;
    const normalizedPatch = normalizedPatchOrError;

    try {
      const page = await this.ensureReplaySession({
        headless: options?.headless,
        resetSession: options?.resetSession,
      });

      const sessionId = this.replaySessionId;
      if (sessionId === null) {
        return {
          error: "No replay session is active for runtime patching.",
        };
      }

      const duplicatePatch = this.activeRuntimePatches.find(
        (candidate) => candidate.id === normalizedPatch.metadata.id && candidate.sessionId === sessionId
      );
      if (duplicatePatch) {
        return {
          error: `Runtime patch "${normalizedPatch.metadata.id}" is already active in replay session #${sessionId}. Reset patches first or choose a different patch id.`,
        };
      }

      const executionSource = BrowserManager.buildRuntimePatchExecutionSource(normalizedPatch);
      let transport: RuntimePatchTransport = "playwright";
      let initScriptIdentifier: string | null = null;
      const cdpSession = await this.openPatchCdpSession(page);

      if (cdpSession) {
        try {
          const registration = (await cdpSession.send("Page.addScriptToEvaluateOnNewDocument", {
            source: executionSource,
          })) as { identifier?: string };
          if (typeof registration.identifier === "string") {
            initScriptIdentifier = registration.identifier;
            transport = "cdp";
          }
        } finally {
          await cdpSession.detach().catch(() => undefined);
        }
      }

      if (initScriptIdentifier === null) {
        await page.addInitScript({ content: executionSource });
      }

      if (options?.url) {
        await this.navigatePage(page, options.url, waitUntil, timeoutMs);
      } else {
        await this.ensureRuntimeBridgeOnPage(page);
      }

      const currentDocument = await page.evaluate<RuntimePatchExecutionResult>(executionSource);
      const record: RuntimePatchRecord = {
        id: normalizedPatch.metadata.id,
        type: normalizedPatch.type,
        target: normalizedPatch.target,
        label: normalizedPatch.metadata.label ?? null,
        source: normalizedPatch.metadata.source,
        appliedAt: new Date().toISOString(),
        sessionId,
        scope: "replay_session",
        initScriptIdentifier,
        removable: initScriptIdentifier !== null,
        transport,
      };
      this.activeRuntimePatches.push(record);

      return {
        session: await this.getSessionInfo(),
        url: await page.evaluate(() => document.URL),
        patch: BrowserManager.buildRuntimePatchInfo(record),
        transport,
        initScriptRegistered: true,
        currentDocument,
        notes: [
          `Patch is limited to replay session #${sessionId}.`,
          transport === "cdp"
            ? "Patch init script registered through CDP for future replay navigations."
            : "Patch init script registered through Playwright. Use reset_session for the strongest cleanup guarantee.",
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.closeReplaySession().catch(() => undefined);
      return {
        error: `Runtime patch application failed: ${message}. Replay session was reset to discard any partial patch state.`,
      };
    }
  }

  async resetRuntimePatches(
    options?: {
      strategy?: RuntimePatchResetStrategy;
      waitUntil?: ReplayWaitUntil;
      timeoutMs?: number;
      headless?: boolean;
      reopenUrl?: string;
    }
  ): Promise<RuntimePatchResetResponse | { error: string }> {
    const strategy = options?.strategy ?? "reset_session";
    const waitUntil = options?.waitUntil ?? "domcontentloaded";
    const timeoutMs = options?.timeoutMs ?? 10_000;
    const removedPatchIds = [...new Set(this.activeRuntimePatches.map((patch) => patch.id))];
    const fallbackReopenUrl =
      options?.reopenUrl ??
      ((strategy === "reload" && this.page && !this.page.isClosed()) ? this.page.url() : null);

    try {
      if (strategy === "reload") {
        const page = this.page && !this.page.isClosed() ? this.page : null;
        const nonRemovablePatches = this.activeRuntimePatches.filter((patch) => !patch.removable);

        if (page && nonRemovablePatches.length === 0) {
          try {
            let reopenedUrl: string | null = null;
            await this.removeRuntimePatchInitScripts(page, this.activeRuntimePatches);
            this.activeRuntimePatches = [];

            const currentUrl = page.url();
            const targetUrl = options?.reopenUrl ?? currentUrl;
            if (targetUrl && targetUrl !== currentUrl) {
              await this.navigatePage(page, targetUrl, waitUntil, timeoutMs);
            } else if (targetUrl) {
              await page.reload({
                timeout: timeoutMs,
                waitUntil,
              });
              await this.ensureRuntimeBridgeOnPage(page);
            } else {
              await page.goto("about:blank", {
                timeout: timeoutMs,
                waitUntil,
              });
              await this.ensureRuntimeBridgeOnPage(page);
            }
            reopenedUrl = page.url();

            this.consoleEvents = [];
            await this.clearNetworkEventsBuffer(page).catch(() => 0);

            return {
              session: await this.getSessionInfo(),
              strategy,
              removedPatchIds,
              removedCount: removedPatchIds.length,
              reopenedUrl,
            };
          } catch {
            // Fall back to a full replay-session reset below.
          }
        }
      }

      await this.closeReplaySession();
      let reopenedUrl: string | null = null;

      const nextUrl = fallbackReopenUrl;
      if (nextUrl && nextUrl !== "about:blank") {
        const navigation = await this.navigateReplay(nextUrl, {
          headless: options?.headless,
          waitUntil,
          timeoutMs,
          resetSession: false,
        });
        if ("error" in navigation) {
          return navigation;
        }
        reopenedUrl = navigation.url;
      }

      return {
        session: await this.getSessionInfo(),
        strategy: "reset_session",
        removedPatchIds,
        removedCount: removedPatchIds.length,
        reopenedUrl,
      };
    } catch (error) {
      return {
        error: `Failed to reset runtime patches: ${error instanceof Error ? error.message : String(error)}`,
      };
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

      const stepTimeoutMs = step.timeoutMs ?? 3_000;

      if (step.action === "press") {
        if (step.selector) {
          await page.waitForSelector(step.selector, {
            state: "visible",
            timeout: stepTimeoutMs,
          });
          await page.locator(step.selector).press(step.key, {
            timeout: stepTimeoutMs,
          });
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
        timeout: stepTimeoutMs,
      });

      const element = page.locator(step.selector);
      if (step.action === "click") {
        await element.click({
          timeout: stepTimeoutMs,
        });
      } else if (step.action === "type") {
        await element.type(step.value, {
          timeout: stepTimeoutMs,
        });
      } else {
        await element.fill(step.value, {
          timeout: stepTimeoutMs,
        });
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

  private buildSkippedValidation(assertion: Assertion, details: string): ValidationResult {
    return {
      pass: false,
      assertion,
      details,
      actual: {
        skipped: true,
      },
      durationMs: 0,
    };
  }

  private async evaluateAssertion(page: Page, url: string, assertion: Assertion): Promise<ValidationResult> {
    const start = Date.now();

    try {
      if (assertion.type === "text_present" || assertion.type === "text_absent") {
        const found = await page.evaluate((text) => document.body.innerText.includes(text), assertion.expected);
        const pass = assertion.type === "text_present" ? found : !found;
        return {
          pass,
          assertion,
          expected: assertion.expected,
          actual: {
            found,
          },
          details: pass
            ? assertion.type === "text_present"
              ? `Text "${assertion.expected}" found.`
              : `Text "${assertion.expected}" is absent as expected.`
            : assertion.type === "text_present"
              ? `Text "${assertion.expected}" not found in page body.`
              : `Text "${assertion.expected}" is still present in page body.`,
          durationMs: Date.now() - start,
        };
      }

      if (assertion.type === "selector_visible" || assertion.type === "selector_hidden") {
        const selectorSnapshot = await page.evaluate((selector) => {
          const nodes = Array.from(document.querySelectorAll(selector));
          return {
            count: nodes.length,
            visibleCount: nodes.filter((node) => {
              if (!(node instanceof Element)) return false;
              const style = window.getComputedStyle(node);
              return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
            }).length,
          };
        }, assertion.selector);

        const pass =
          assertion.type === "selector_visible"
            ? selectorSnapshot.visibleCount > 0
            : selectorSnapshot.visibleCount === 0;

        return {
          pass,
          assertion,
          actual: selectorSnapshot,
          details: pass
            ? assertion.type === "selector_visible"
              ? `Selector "${assertion.selector}" is visible.`
              : `Selector "${assertion.selector}" is hidden or absent as expected.`
            : assertion.type === "selector_visible"
              ? `Selector "${assertion.selector}" is not visible.`
              : `Selector "${assertion.selector}" is still visible.`,
          durationMs: Date.now() - start,
        };
      }

      if (
        assertion.type === "component_present" ||
        assertion.type === "component_prop_value" ||
        assertion.type === "component_state_value"
      ) {
        const { inspectReactRuntime } = await import("../diagnostics/react-runtime.js");

        if (assertion.type === "component_present" || assertion.type === "component_prop_value") {
          const request: ReactRuntimeInspectRequest = {
            mode: "component",
            componentName: assertion.componentName,
            compact: false,
          };
          const result = await page.evaluate(inspectReactRuntime, request);
          const component = result.component ?? null;

          if (assertion.type === "component_present") {
            return {
              pass: component !== null,
              assertion,
              actual: {
                found: component !== null,
                path: component?.pathText ?? null,
              },
              details:
                component !== null
                  ? `Component "${assertion.componentName}" found at ${component.pathText}.`
                  : `Component "${assertion.componentName}" was not found in the React tree.`,
              durationMs: Date.now() - start,
            };
          }

          if (component === null) {
            return {
              pass: false,
              assertion,
              expected: assertion.expected,
              actual: {
                found: false,
              },
              details: `Component "${assertion.componentName}" was not found in the React tree.`,
              durationMs: Date.now() - start,
            };
          }

          const actualValue = BrowserManager.readValueAtPath(component.props, assertion.propPath);
          const pass =
            BrowserManager.isAssertionPrimitive(actualValue) && actualValue === assertion.expected;

          return {
            pass,
            assertion,
            expected: assertion.expected,
            actual: {
              componentPath: component.pathText,
              propPath: assertion.propPath,
              value: actualValue,
            },
            details: pass
              ? `Component "${assertion.componentName}" prop "${assertion.propPath}" matches the expected value.`
              : `Component "${assertion.componentName}" prop "${assertion.propPath}" was ${JSON.stringify(actualValue)} instead of ${JSON.stringify(assertion.expected)}.`,
            durationMs: Date.now() - start,
          };
        }

        const request: ReactRuntimeInspectRequest = {
          mode: "component-state",
          componentName: assertion.componentName,
          compact: false,
        };
        const result = await page.evaluate(inspectReactRuntime, request);
        const stateNode = result.state ?? null;

        if (stateNode === null) {
          return {
            pass: false,
            assertion,
            expected: assertion.expected,
            actual: {
              found: false,
            },
            details: `Component "${assertion.componentName}" was not found in the React tree.`,
            durationMs: Date.now() - start,
          };
        }

        const hook = stateNode.hooks.find((candidate) => candidate.index === assertion.hookIndex) ?? null;
        if (hook === null) {
          return {
            pass: false,
            assertion,
            expected: assertion.expected,
            actual: {
              hookIndexes: stateNode.hooks.map((candidate) => candidate.index),
            },
            details: `Hook index ${assertion.hookIndex} was not found on component "${assertion.componentName}".`,
            durationMs: Date.now() - start,
          };
        }

        const actualValue = BrowserManager.readValueAtPath(hook.value, assertion.valuePath);
        const pass =
          BrowserManager.isAssertionPrimitive(actualValue) && actualValue === assertion.expected;

        return {
          pass,
          assertion,
          expected: assertion.expected,
          actual: {
            componentPath: stateNode.pathText,
            hookIndex: hook.index,
            hookKind: hook.kind,
            valuePath: assertion.valuePath ?? null,
            value: actualValue,
          },
          details: pass
            ? `Component "${assertion.componentName}" hook #${assertion.hookIndex} at ${BrowserManager.formatPathLabel(assertion.valuePath)} matches the expected value.`
            : `Component "${assertion.componentName}" hook #${assertion.hookIndex} at ${BrowserManager.formatPathLabel(assertion.valuePath)} was ${JSON.stringify(actualValue)} instead of ${JSON.stringify(assertion.expected)}.`,
          durationMs: Date.now() - start,
        };
      }

      if (assertion.type === "no_console_errors" || assertion.type === "no_console_warnings") {
        const matchingEvents = this.consoleEvents.filter((event) =>
          assertion.type === "no_console_errors"
            ? event.type === "error" || event.type === "exception"
            : event.type === "warn"
        );
        const pass = matchingEvents.length === 0;

        return {
          pass,
          assertion,
          actual: pass ? { count: 0 } : matchingEvents,
          details: pass
            ? assertion.type === "no_console_errors"
              ? "No console errors detected."
              : "No console warnings detected."
            : assertion.type === "no_console_errors"
              ? `Detected ${matchingEvents.length} console errors.`
              : `Detected ${matchingEvents.length} console warnings.`,
          durationMs: Date.now() - start,
        };
      }

      if (assertion.type === "no_http_5xx" || assertion.type === "no_unexpected_http_requests") {
        const networkEvents = await this.readNetworkEvents(page);

        if (assertion.type === "no_http_5xx") {
          const failingEvents = networkEvents.filter(
            (event) => typeof event.status === "number" && event.status >= 500
          );
          const pass = failingEvents.length === 0;

          return {
            pass,
            assertion,
            actual: pass ? { count: 0 } : failingEvents,
            details: pass
              ? "No HTTP 5xx responses detected."
              : `Detected ${failingEvents.length} HTTP 5xx responses.`,
            durationMs: Date.now() - start,
          };
        }

        const unexpectedEvents = networkEvents.filter(
          (event) =>
            !assertion.allowedUrlSubstrings.some((allowed) => event.url.includes(allowed))
        );
        const pass = unexpectedEvents.length === 0;

        return {
          pass,
          assertion,
          expected: assertion.allowedUrlSubstrings,
          actual: pass ? { count: 0 } : unexpectedEvents,
          details: pass
            ? "No unexpected HTTP requests detected."
            : `Detected ${unexpectedEvents.length} unexpected HTTP requests.`,
          durationMs: Date.now() - start,
        };
      }

      return {
        pass: false,
        assertion,
        details: "Unknown assertion type.",
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return {
        pass: false,
        assertion,
        details: `Validation failed: ${String(e)}`,
        durationMs: Date.now() - start,
      };
    }
  }

  async runValidationScenario(
    steps: ReplayStep[],
    assertions: Assertion[],
    options?: {
      url?: string;
      headless?: boolean;
      timeoutMs?: number;
      waitUntil?: ReplayWaitUntil;
      resetSession?: boolean;
      continueOnError?: boolean;
      waitMs?: number;
    }
  ): Promise<ValidationScenarioResponse | { error: string }> {
    const startedAt = new Date().toISOString();
    const start = Date.now();

    try {
      const page = await this.getReplayPageForSequence(options?.url, {
        headless: options?.headless,
        timeoutMs: options?.timeoutMs,
        waitUntil: options?.waitUntil,
        resetSession: options?.resetSession,
      });
      this.consoleEvents = [];
      await this.clearNetworkEventsBuffer(page);

      const stepResults: ReplayStepResult[] = [];

      for (const [index, step] of steps.entries()) {
        const result = await this.runReplayStep(page, step);
        stepResults.push({
          index,
          url: await page.evaluate(() => document.URL),
          ...result,
        });

        if (!result.success && !options?.continueOnError) {
          break;
        }
      }

      let assertionResults: ValidationResult[];
      const firstFailedStep = stepResults.find((result) => !result.success);

      if (firstFailedStep && !options?.continueOnError) {
        assertionResults = assertions.map((assertion) =>
          this.buildSkippedValidation(assertion, `Assertion skipped because step #${firstFailedStep.index} failed.`)
        );
      } else {
        const waitMs = options?.waitMs ?? 500;
        if (waitMs > 0) {
          await page.waitForTimeout(waitMs);
        }
        const pageUrl = await page.evaluate(() => document.URL);
        assertionResults = [];
        for (const assertion of assertions) {
          assertionResults.push(await this.evaluateAssertion(page, pageUrl, assertion));
        }
      }

      const traces = {
        console: [...this.consoleEvents],
        network: await this.readNetworkEvents(page),
      };
      const summary = {
        actionCount: stepResults.length,
        actionFailures: stepResults.filter((step) => !step.success).length,
        assertionCount: assertionResults.length,
        assertionFailures: assertionResults.filter((result) => !result.pass).length,
        overallPass: stepResults.every((step) => step.success) && assertionResults.every((result) => result.pass),
      };

      return {
        session: await this.getSessionInfo(),
        url: await page.evaluate(() => document.URL),
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
        success: summary.overallPass,
        steps: stepResults,
        assertions: assertionResults,
        traces,
        summary,
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
  async validate(url: string, assertion: Assertion): Promise<ValidationResult> {
    try {
      const page = await this.getRuntimePage(url);
      return this.evaluateAssertion(page, url, assertion);
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
