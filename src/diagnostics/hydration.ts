import type {
  ConsoleEvent,
  HydrationIssueEntry,
  HydrationIssueFramework,
  HydrationIssueKind,
  HydrationIssuesSummary,
} from "./protocol.js";

const hydrationMatchPattern =
  /hydration|server html|server-rendered html|did not match|expected server html|while hydrating/i;

function normalizeMessage(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function detectFramework(message: string): HydrationIssueFramework {
  if (/next\.?js|next\/dist/i.test(message)) {
    return "nextjs";
  }

  if (/react/i.test(message) || hydrationMatchPattern.test(message)) {
    return "react";
  }

  return "unknown";
}

function detectKind(message: string): HydrationIssueKind {
  if (/expected server html|did not match|server-rendered html/i.test(message)) {
    return "mismatch";
  }

  if (/replaced with client content/i.test(message)) {
    return "replacement";
  }

  if (/switch to client rendering|recover from concurrent error/i.test(message)) {
    return "client_render_fallback";
  }

  if (/hydration failed|while hydrating/i.test(message)) {
    return "hydration_failure";
  }

  return "warning";
}

function toHydrationIssue(event: ConsoleEvent): HydrationIssueEntry | null {
  if (!hydrationMatchPattern.test(event.text)) {
    return null;
  }

  const message = normalizeMessage(event.text);
  return {
    tag: "hydration",
    kind: detectKind(message),
    framework: detectFramework(message),
    level: event.type,
    message,
    location: event.location,
    timestamp: event.timestamp,
  };
}

function createEmptySummary(): HydrationIssuesSummary {
  return {
    total: 0,
    byKind: {
      mismatch: 0,
      replacement: 0,
      client_render_fallback: 0,
      hydration_failure: 0,
      warning: 0,
    },
    byLevel: {
      log: 0,
      warn: 0,
      error: 0,
      exception: 0,
    },
    byFramework: {
      react: 0,
      nextjs: 0,
      unknown: 0,
    },
  };
}

export function readHydrationIssuesFromConsoleEvents(
  events: ConsoleEvent[],
  options?: { limit?: number }
): { issues: HydrationIssueEntry[]; summary: HydrationIssuesSummary } {
  const limit = options?.limit ?? 50;
  const issues = events.map(toHydrationIssue).filter((issue): issue is HydrationIssueEntry => issue !== null).slice(-limit);
  const summary = createEmptySummary();

  for (const issue of issues) {
    summary.total += 1;
    summary.byKind[issue.kind] += 1;
    summary.byLevel[issue.level] += 1;
    summary.byFramework[issue.framework] += 1;
  }

  return {
    issues,
    summary,
  };
}
