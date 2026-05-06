/**
 * diagnostics/protocol.ts — SCRUM-24
 *
 * Type definitions for all runtime diagnostic responses.
 * Designed to be extensible for future inspection commands (fiber, network…).
 */

// ---------------------------------------------------------------------------
// React detection (SCRUM-26)
// ---------------------------------------------------------------------------

/** Result of React presence detection in a page. */
export interface ReactInfo {
  /** Whether a React app was detected on this page. */
  detected: boolean;
  /** React version string, if detectable (e.g. "18.3.1"). Null otherwise. */
  version: string | null;
  /** Whether the __REACT_DEVTOOLS_GLOBAL_HOOK__ is present (React's extension bridge). */
  devtoolsHookPresent: boolean;
}

// ---------------------------------------------------------------------------
// Runtime status (get_runtime_status)
// ---------------------------------------------------------------------------

/** Full runtime status of a connected page. */
export interface RuntimeStatus {
  /** Current page URL as seen by the browser. */
  url: string;
  /** Page <title> content. */
  title: string;
  /** ISO 8601 timestamp of when the snapshot was taken. */
  timestamp: string;
  /** Viewport dimensions in logical pixels. */
  viewport: {
    width: number;
    height: number;
  };
  /** React presence and version information. */
  react: ReactInfo;
  /** How long the full operation took (ms). */
  durationMs: number;
}
