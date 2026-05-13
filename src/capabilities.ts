import { BROWSER_TOOL_NAMES } from "./tools/browser.js";
import { DIAGNOSTIC_TOOL_NAMES } from "./tools/diagnostics.js";
import { INTERACTION_TOOL_NAMES } from "./tools/interaction.js";
import { NETWORK_TOOL_NAMES } from "./tools/network.js";
import { PATCH_TOOL_NAMES } from "./tools/patch.js";

export type CapabilityStatus = "planned" | "partial" | "available";
export type CapabilityMode = "attach" | "replay" | "sandbox";

export type CapabilityDefinition = {
  status: CapabilityStatus;
  tools: readonly string[];
  modes: readonly CapabilityMode[];
  summary: string;
};

const CORE_TOOL_NAMES = ["ping", "get_server_info", "echo"] as const;

const capabilityCatalog = {
  browser_ping: {
    status: "available",
    tools: ["browser_ping"],
    modes: ["replay"],
    summary: "Reachability and bridge smoke test for the replay browser.",
  },
  get_session_status: {
    status: "available",
    tools: ["get_session_status"],
    modes: ["attach", "replay", "sandbox"],
    summary: "Report the active browser session mode and replay configuration.",
  },
  get_attach_status: {
    status: "available",
    tools: ["get_attach_status"],
    modes: ["attach"],
    summary: "Check whether a live Chrome CDP endpoint is ready.",
  },
  get_attach_tabs: {
    status: "available",
    tools: ["get_attach_tabs"],
    modes: ["attach"],
    summary: "List live Chrome tabs that can be selected for attach mode.",
  },
  select_attach_tab: {
    status: "available",
    tools: ["select_attach_tab"],
    modes: ["attach"],
    summary: "Preview or confirm the live tab reused in attach mode.",
  },
  navigate_replay: {
    status: "available",
    tools: ["navigate_replay"],
    modes: ["replay", "sandbox"],
    summary: "Open the isolated replay browser on a target application URL.",
  },
  get_runtime_status: {
    status: "available",
    tools: ["get_runtime_status"],
    modes: ["attach", "replay", "sandbox"],
    summary: "Inspect runtime metadata for one target page.",
  },
  get_component_state: {
    status: "available",
    tools: ["get_component_state"],
    modes: ["attach", "replay", "sandbox"],
    summary: "Extract serializable hook state for one React component.",
  },
  get_async_timeline: {
    status: "available",
    tools: ["get_async_timeline"],
    modes: ["attach", "replay", "sandbox"],
    summary: "Trace async request lifecycles to diagnose races and latency.",
  },
  get_race_condition_diagnosis: {
    status: "available",
    tools: ["get_race_condition_diagnosis"],
    modes: ["attach", "replay", "sandbox"],
    summary: "Summarize probable client-side race conditions from runtime signals.",
  },
  get_hydration_issues: {
    status: "available",
    tools: ["get_hydration_issues"],
    modes: ["attach", "replay", "sandbox"],
    summary: "Inspect likely hydration mismatches on SSR or Next.js pages.",
  },
  get_render_counts: {
    status: "available",
    tools: ["get_render_counts"],
    modes: ["replay"],
    summary: "Inspect render counters captured by the replay render monitor.",
  },
  get_render_hotspots: {
    status: "available",
    tools: ["get_render_hotspots"],
    modes: ["replay"],
    summary: "Flag render explosions in replay mode.",
  },
  diagnose_excess_renders: {
    status: "available",
    tools: ["diagnose_excess_renders"],
    modes: ["replay"],
    summary: "High-level replay investigation for excess renders, render loops, and context churn.",
  },
  find_memo_breaks: {
    status: "available",
    tools: ["find_memo_breaks"],
    modes: ["replay"],
    summary: "High-level replay investigation for memo breaks versus context cascades.",
  },
  diagnose_runtime_bug: {
    status: "available",
    tools: ["diagnose_runtime_bug"],
    modes: ["replay"],
    summary: "Verdict-first runtime bug triage for vague symptoms before drilling into atomic tools.",
  },
  get_hook_changes: {
    status: "available",
    tools: ["get_hook_changes"],
    modes: ["replay"],
    summary: "Show the hook history behind replay render instability.",
  },
  get_network_events: {
    status: "available",
    tools: ["get_network_events"],
    modes: ["attach", "replay", "sandbox"],
    summary: "Return recent runtime network events and HTTP errors.",
  },
  get_runtime_timeline: {
    status: "available",
    tools: ["get_runtime_timeline"],
    modes: ["attach", "replay", "sandbox"],
    summary: "Merge console, runtime, and network traces into one timeline.",
  },
  runtime_inspection: {
    status: "partial",
    tools: ["get_runtime_status", "get_react_tree", "inspect_component", "get_component_state"],
    modes: ["attach", "replay", "sandbox"],
    summary: "React inspection is available, but intentionally bounded to readable snapshots and selected hook types.",
  },
  render_monitor: {
    status: "available",
    tools: ["get_render_counts", "get_render_hotspots", "get_hook_changes"],
    modes: ["replay"],
    summary: "Replay-mode render monitor for loops and unstable hooks.",
  },
  investigation_tools: {
    status: "available",
    tools: ["diagnose_excess_renders", "find_memo_breaks", "diagnose_runtime_bug"],
    modes: ["replay"],
    summary: "Prefer these verdict-first investigations before chaining the lower-level atomic diagnostics yourself.",
  },
  replay_sandbox: {
    status: "available",
    tools: ["navigate_replay", "browser_ping", "replay_interactions"],
    modes: ["replay", "sandbox"],
    summary: "Isolated Playwright replay environment for deterministic reproduction.",
  },
  replay_interactions: {
    status: "available",
    tools: ["replay_interactions"],
    modes: ["replay", "sandbox"],
    summary: "Replay a scripted interaction sequence in the isolated browser.",
  },
  find_race_conditions: {
    status: "available",
    tools: ["find_race_conditions"],
    modes: ["replay", "sandbox"],
    summary: "Stress-test replay scenarios with adversarial timing to reproduce intermittent races and return minimal failing sequences.",
  },
  validate_scenario: {
    status: "available",
    tools: ["validate_scenario"],
    modes: ["replay", "sandbox"],
    summary: "Run multi-step validations and assertions against the replay sandbox.",
  },
  apply_runtime_patch: {
    status: "available",
    tools: ["apply_runtime_patch"],
    modes: ["sandbox"],
    summary: "Inject an ephemeral runtime patch into the replay sandbox.",
  },
  apply_patch_then_replay: {
    status: "available",
    tools: ["apply_patch_then_replay"],
    modes: ["sandbox"],
    summary: "Patch, replay, and validate in one sandbox flow.",
  },
  reset_runtime_patches: {
    status: "available",
    tools: ["reset_runtime_patches"],
    modes: ["sandbox"],
    summary: "Clean sandbox runtime patches by reloading or resetting the replay session.",
  },
  shadow_sandbox: {
    status: "partial",
    tools: ["apply_runtime_patch", "apply_patch_then_replay", "reset_runtime_patches"],
    modes: ["sandbox"],
    summary: "Shadow sandbox is available for script-on-page patches only; broader patch shapes are still planned.",
  },
  interaction_simulation: {
    status: "available",
    tools: ["simulate_interaction", "replay_interactions", "validate_after_action"],
    modes: ["attach", "replay", "sandbox"],
    summary: "Drive browser interactions in live attach or replay flows.",
  },
} as const satisfies Record<string, CapabilityDefinition>;

export function createServerInfoPayload(): {
  capabilities: Record<string, CapabilityStatus>;
  capabilityDetails: Record<string, CapabilityDefinition>;
  capabilitiesByMode: Record<CapabilityMode, Record<CapabilityStatus, string[]>>;
} {
  const capabilityDetails = Object.fromEntries(
    Object.entries(capabilityCatalog).map(([name, definition]) => [
      name,
      {
        status: definition.status,
        tools: [...definition.tools],
        modes: [...definition.modes],
        summary: definition.summary,
      },
    ])
  ) as Record<string, CapabilityDefinition>;

  const capabilities = Object.fromEntries(
    Object.entries(capabilityDetails).map(([name, definition]) => [name, definition.status])
  ) as Record<string, CapabilityStatus>;

  const capabilitiesByMode: Record<CapabilityMode, Record<CapabilityStatus, string[]>> = {
    attach: { planned: [], partial: [], available: [] },
    replay: { planned: [], partial: [], available: [] },
    sandbox: { planned: [], partial: [], available: [] },
  };

  for (const [name, definition] of Object.entries(capabilityDetails)) {
    for (const mode of definition.modes) {
      capabilitiesByMode[mode][definition.status].push(name);
    }
  }

  for (const groupedStatuses of Object.values(capabilitiesByMode)) {
    for (const names of Object.values(groupedStatuses)) {
      names.sort((left, right) => left.localeCompare(right));
    }
  }

  return {
    capabilities,
    capabilityDetails,
    capabilitiesByMode,
  };
}

export function summarizeCapabilities(capabilities: Record<string, CapabilityStatus>): Record<CapabilityStatus, string[]> {
  const summary: Record<CapabilityStatus, string[]> = {
    planned: [],
    partial: [],
    available: [],
  };

  for (const [name, status] of Object.entries(capabilities)) {
    summary[status].push(name);
  }

  for (const names of Object.values(summary)) {
    names.sort((left, right) => left.localeCompare(right));
  }

  return summary;
}

export function validateCapabilities(): {
  status: "pass" | "fail";
  issues: string[];
  registeredTools: string[];
} {
  const registeredTools = [
    ...CORE_TOOL_NAMES,
    ...BROWSER_TOOL_NAMES,
    ...DIAGNOSTIC_TOOL_NAMES,
    ...NETWORK_TOOL_NAMES,
    ...INTERACTION_TOOL_NAMES,
    ...PATCH_TOOL_NAMES,
  ];
  const registeredToolSet = new Set<string>(registeredTools);
  const issues: string[] = [];

  for (const [name, definition] of Object.entries(capabilityCatalog)) {
    if (definition.status !== "available") {
      continue;
    }

    if (definition.tools.length < 1) {
      issues.push(`Capability "${name}" is marked available but has no mapped MCP tools.`);
      continue;
    }

    const missingTools = definition.tools.filter((tool) => !registeredToolSet.has(tool));
    if (missingTools.length > 0) {
      issues.push(
        `Capability "${name}" is marked available but references missing MCP tools: ${missingTools.join(", ")}.`
      );
    }
  }

  return {
    status: issues.length === 0 ? "pass" : "fail",
    issues,
    registeredTools: [...registeredToolSet].sort((left, right) => left.localeCompare(right)),
  };
}
