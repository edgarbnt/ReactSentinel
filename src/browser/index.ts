/**
 * browser/index.ts
 *
 * Browser session manager — wraps Playwright to provide:
 *   - Isolated browser contexts for shadow sandboxing
 *   - CDP (Chrome DevTools Protocol) session access for runtime inspection
 *   - Automatic cleanup on session end
 *
 * Usage:
 *   import { BrowserManager } from './browser/index.js'
 *   const manager = new BrowserManager()
 *   const ctx = await manager.newContext()
 *   // ... use ctx ...
 *   await manager.close()
 */

export {};
