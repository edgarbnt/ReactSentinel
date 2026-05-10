import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type AgentPackFileKind = "readme" | "command" | "skill" | "doc" | "profile";

export type AgentPackTemplateDefinition = {
  relativePath: string;
  description: string;
  kind: AgentPackFileKind;
};

export type AgentPackTemplate = AgentPackTemplateDefinition & {
  content: string;
  contentHash: string;
};

export const AGENT_PACK_ROOT = path.join(".react-sentinel", "agent-pack");
export const AGENT_PACK_MANIFEST_FILENAME = "manifest.json";
export const AGENT_PACK_PRIMARY_PROFILE = "claude-code";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = path.join(packageRoot, "assets", "agent-pack");

const templateDefinitions: AgentPackTemplateDefinition[] = [
  {
    relativePath: "README.md",
    description: "Local overview of the installed React-Sentinel agent pack.",
    kind: "readme",
  },
  {
    relativePath: "commands/debug-react.md",
    description: "Primary React runtime debugging routine for agents.",
    kind: "command",
  },
  {
    relativePath: "commands/reproduce-bug.md",
    description: "Reproduction-first routine for replay or attach investigations.",
    kind: "command",
  },
  {
    relativePath: "commands/validate-fix.md",
    description: "Validation routine for assertions and sandbox hypothesis checks.",
    kind: "command",
  },
  {
    relativePath: "skills/react-sentinel-debug.md",
    description: "Reusable skill text describing when and how to call React-Sentinel.",
    kind: "skill",
  },
  {
    relativePath: "docs/heuristics.md",
    description: "Trigger and non-trigger heuristics for runtime debugging.",
    kind: "doc",
  },
  {
    relativePath: "docs/compatibility.md",
    description: "Compatibility matrix and support notes for agent environments.",
    kind: "doc",
  },
  {
    relativePath: "profiles/claude-code.md",
    description: "Primary Claude Code integration profile.",
    kind: "profile",
  },
  {
    relativePath: "profiles/generic-mcp.md",
    description: "Portable MCP stdio integration profile.",
    kind: "profile",
  },
  {
    relativePath: "profiles/gemini-cli.md",
    description: "Gemini CLI adaptation notes.",
    kind: "profile",
  },
  {
    relativePath: "profiles/copilot-cli.md",
    description: "Copilot adaptation notes.",
    kind: "profile",
  },
];

export function getAgentPackTemplateDefinitions(): AgentPackTemplateDefinition[] {
  return templateDefinitions.map((definition) => ({ ...definition }));
}

export function getAgentPackTemplateAbsolutePath(relativePath: string): string {
  return path.join(assetRoot, relativePath);
}

export function computeAgentPackContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function readAgentPackTemplate(relativePath: string): Promise<AgentPackTemplate> {
  const definition = templateDefinitions.find((entry) => entry.relativePath === relativePath);
  if (!definition) {
    throw new Error(`Unknown agent pack template: ${relativePath}`);
  }

  const content = await readFile(getAgentPackTemplateAbsolutePath(relativePath), "utf8");
  return {
    ...definition,
    content,
    contentHash: computeAgentPackContentHash(content),
  };
}

export async function readAgentPackTemplates(): Promise<AgentPackTemplate[]> {
  const templates = await Promise.all(templateDefinitions.map((definition) => readAgentPackTemplate(definition.relativePath)));
  return templates.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}
