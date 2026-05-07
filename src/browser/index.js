/**
 * browser/index.ts — SCRUM-23 + SCRUM-20 + SCRUM-28
 *
 * BrowserManager: wraps Playwright to provide isolated browser contexts
 * for each MCP tool call. Auto-launches on first use.
 *
 * Rules enforced:
 *   - Each tool call creates a new isolated BrowserContext, closed in finally.
 *   - Navigation errors (ECONNREFUSED, timeout) return structured errors.
 */
import { chromium } from "playwright";
import { detectReact } from "../diagnostics/react-detector.js";
export class BrowserManager {
    browser = null;
    /** Launch a headless Chromium instance (idempotent). */
    async launch() {
        if (this.browser)
            return;
        this.browser = await chromium.launch({ headless: true });
        console.error("[react-sentinel] Browser launched (headless chromium)");
    }
    /** Close browser and release all resources. */
    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            console.error("[react-sentinel] Browser closed");
        }
    }
    async withContext(fn) {
        if (!this.browser)
            await this.launch();
        let context = null;
        try {
            context = await this.browser.newContext();
            return await fn(context);
        }
        finally {
            if (context)
                await context.close();
        }
    }
    /**
     * Ping a URL — opens an isolated context, navigates, extracts metadata.
     * Handles SCRUM-20: returns structured error when app is unreachable.
     */
    async ping(url) {
        const start = Date.now();
        const type = "ping";
        try {
            return await this.withContext(async (context) => {
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
                const data = await page.evaluate(() => ({
                    pong: true,
                    url: document.URL,
                    title: document.title,
                    timestamp: new Date().toISOString(),
                }));
                return { success: true, type, data, durationMs: Date.now() - start };
            });
        }
        catch (e) {
            const msg = String(e);
            const isConnRefused = msg.includes("ECONNREFUSED") || msg.includes("ERR_CONNECTION_REFUSED");
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
    async getRuntimeStatus(url) {
        const start = Date.now();
        try {
            return await this.withContext(async (context) => {
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
                const [pageUrl, title, viewport, react] = await Promise.all([
                    page.evaluate(() => document.URL),
                    page.evaluate(() => document.title),
                    page.evaluate(() => ({
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
            });
        }
        catch (e) {
            const msg = String(e);
            const isConnRefused = msg.includes("ECONNREFUSED") || msg.includes("ERR_CONNECTION_REFUSED");
            return {
                error: isConnRefused
                    ? `Cannot connect to ${url} — is the app running?`
                    : msg,
            };
        }
    }
    // ---------------------------------------------------------------------------
    // getReactTree() — SCRUM-5
    // ---------------------------------------------------------------------------
    async getReactTree(url, maxDepth = 10, includeHostNodes = false) {
        const start = Date.now();
        try {
            return await this.withContext(async (context) => {
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
                // Import the extractor dynamically or just rely on evaluate
                // Note: Playwright serializes the function, so it must not rely on external closure scope.
                const { extractReactTree } = await import("../diagnostics/react-tree.js");
                const tree = await page.evaluate(extractReactTree, {
                    maxDepth,
                    includeHostNodes,
                });
                return {
                    url: await page.evaluate(() => document.URL),
                    tree,
                    durationMs: Date.now() - start,
                };
            });
        }
        catch (e) {
            const msg = String(e);
            const isConnRefused = msg.includes("ECONNREFUSED") || msg.includes("ERR_CONNECTION_REFUSED");
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
