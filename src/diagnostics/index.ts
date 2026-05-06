/**
 * diagnostics/index.ts
 *
 * Diagnostics layer — collects and structures runtime signals from the browser:
 *   - Console logs / errors / warnings
 *   - Network requests and failures (4xx, 5xx)
 *   - React Fiber tree snapshots
 *   - Hydration mismatch detection (Next.js)
 *   - Render-count tracking (infinite loop detection)
 *
 * Each diagnostic category will live in its own module:
 *   - console.ts   → console event capture
 *   - network.ts   → request/response interception
 *   - fiber.ts     → React Fiber tree extraction via CDP
 */

export {};
