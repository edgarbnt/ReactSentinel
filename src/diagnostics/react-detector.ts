/**
 * diagnostics/react-detector.ts — SCRUM-26
 *
 * Browser-side script that detects whether a React application is running
 * on the current page, and attempts to extract its version.
 *
 * Strategies (applied in order):
 *   1. DOM fiber keys — React 17+ attaches __reactFiber$ keys to DOM nodes.
 *   2. DevTools hook renderers — React registers itself when the hook is present.
 *   3. Legacy __reactInternalInstance$ — React 16.
 */

import type { ReactInfo } from "./protocol.js";

/**
 * This function is serialised and evaluated inside the browser via
 * page.evaluate(). It must be self-contained (no external imports).
 */
export function detectReact(): ReactInfo {
  // Strategy 1 — fiber keys on candidate DOM elements (React 17+)
  const root = document.getElementById("root");
  const candidates = [
    root,
    root?.firstElementChild,
    document.querySelector("[data-reactroot]"),
    document.body?.firstElementChild,
    document.body,
  ].filter((el): el is Element => el !== null && el !== undefined);

  let fiberDetected = false;
  for (const el of candidates) {
    const keys = Object.keys(el);
    if (
      keys.some(
        (k) =>
          k.startsWith("__reactFiber") ||
          k.startsWith("__reactInternalInstance") ||
          k.startsWith("__reactEvents")
      )
    ) {
      fiberDetected = true;
      break;
    }
  }

  // Strategy 2 — DevTools hook with registered renderers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hook = (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  const renderers: Map<unknown, { version?: string }> | undefined =
    hook?.renderers instanceof Map ? hook.renderers : undefined;
  const hasRenderers = (renderers?.size ?? 0) > 0;

  let version: string | null = null;
  if (hasRenderers && renderers) {
    const first = [...renderers.values()][0];
    version = first?.version ?? null;
  }

  return {
    detected: fiberDetected || hasRenderers,
    version,
    devtoolsHookPresent: !!hook,
  };
}
