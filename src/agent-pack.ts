import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile, rm, rmdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMcpServerConfig, resolveDefaultConfigPath, type McpInstallMode, type McpServerConfig } from "./mcp-config.js";

export type AgentPackFileKind = "readme" | "command" | "skill" | "doc" | "profile";
export type AgentPackProfileId = "claude-code" | "generic-mcp" | "gemini-cli" | "copilot-cli";

export type AgentPackTemplateDefinition = {
  relativePath: string;
  description: string;
  kind: AgentPackFileKind;
};

export type AgentPackTemplate = AgentPackTemplateDefinition & {
  content: string;
  contentHash: string;
};

export type AgentPackManifest = {
  formatVersion: 1;
  reactSentinelVersion: string;
  generatedAt: string;
  primaryProfile: AgentPackProfileId;
  targetDirectory: string;
  packRoot: string;
  managedFiles: Array<{
    relativePath: string;
    description: string;
    kind: AgentPackFileKind;
    contentHash: string;
  }>;
  mcpConfig: {
    client: "claude-code";
    path: string;
    serverName: string;
    mode: McpInstallMode;
    replayMode: "headless" | "headed";
    serverConfig: McpServerConfig;
  };
  profiles: Array<{
    id: AgentPackProfileId;
    support: "primary" | "supported" | "documented";
    summary: string;
  }>;
};

export const AGENT_PACK_ROOT = path.join(".react-sentinel", "agent-pack");
export const AGENT_PACK_MANIFEST_FILENAME = "manifest.json";
export const AGENT_PACK_PRIMARY_PROFILE = "claude-code";

const supportedProfiles: AgentPackManifest["profiles"] = [
  {
    id: "claude-code",
    support: "primary",
    summary: "Project-local installation target with a managed .mcp.json entry.",
  },
  {
    id: "generic-mcp",
    support: "supported",
    summary: "Portable stdio MCP profile with client-specific config path differences.",
  },
  {
    id: "gemini-cli",
    support: "documented",
    summary: "Manual adaptation profile that reuses the generic MCP transport and pack guidance.",
  },
  {
    id: "copilot-cli",
    support: "documented",
    summary: "Manual adaptation profile that reuses the generic MCP transport and pack guidance.",
  },
];

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

export function resolveAgentPackRoot(targetDirectory: string): string {
  return path.join(targetDirectory, AGENT_PACK_ROOT);
}

export function resolveAgentPackManifestPath(targetDirectory: string): string {
  return path.join(resolveAgentPackRoot(targetDirectory), AGENT_PACK_MANIFEST_FILENAME);
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

export async function buildAgentPackManifest(options: {
  targetDirectory: string;
  reactSentinelVersion: string;
  serverName: string;
  mode: McpInstallMode;
  replayHeadless: boolean;
  configPath?: string | null;
}): Promise<{ manifest: AgentPackManifest; templates: AgentPackTemplate[] }> {
  const targetDirectory = path.resolve(options.targetDirectory);
  const templates = await readAgentPackTemplates();
  const configPath = options.configPath
    ? path.isAbsolute(options.configPath)
      ? options.configPath
      : path.resolve(targetDirectory, options.configPath)
    : path.resolve(resolveDefaultConfigPath({ client: "claude-code", cwd: targetDirectory }));

  const manifest: AgentPackManifest = {
    formatVersion: 1,
    reactSentinelVersion: options.reactSentinelVersion,
    generatedAt: new Date().toISOString(),
    primaryProfile: AGENT_PACK_PRIMARY_PROFILE,
    targetDirectory,
    packRoot: resolveAgentPackRoot(targetDirectory),
    managedFiles: templates.map((template) => ({
      relativePath: template.relativePath,
      description: template.description,
      kind: template.kind,
      contentHash: template.contentHash,
    })),
    mcpConfig: {
      client: "claude-code",
      path: configPath,
      serverName: options.serverName,
      mode: options.mode,
      replayMode: options.replayHeadless ? "headless" : "headed",
      serverConfig: buildMcpServerConfig({
        mode: options.mode,
        replayHeadless: options.replayHeadless,
      }),
    },
    profiles: supportedProfiles.map((profile) => ({ ...profile })),
  };

  return { manifest, templates };
}

export function renderAgentPackManifest(manifest: AgentPackManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export async function readExistingAgentPackManifest(targetDirectory: string): Promise<AgentPackManifest | null> {
  const manifestPath = resolveAgentPackManifestPath(targetDirectory);
  try {
    const content = await readFile(manifestPath, "utf8");
    return JSON.parse(content) as AgentPackManifest;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function installAgentPack(options: {
  targetDirectory: string;
  manifest: AgentPackManifest;
  force?: boolean;
  templates?: AgentPackTemplate[];
}): Promise<void> {
  const existingManifest = await readExistingAgentPackManifest(options.targetDirectory);
  const packRoot = resolveAgentPackRoot(options.targetDirectory);

  if (existingManifest && !options.force) {
    throw new Error(
      `Agent pack already installed at ${packRoot}. Use --force to overwrite.`
    );
  }

  // Ensure directories exist
  await mkdir(packRoot, { recursive: true });
  const subDirs = new Set(
    options.manifest.managedFiles
      .map((f) => path.dirname(f.relativePath))
      .filter((d) => d !== ".")
  );
  for (const dir of subDirs) {
    await mkdir(path.join(packRoot, dir), { recursive: true });
  }

  // Write template files
  const templates = options.templates ?? await readAgentPackTemplates();
  for (const template of templates) {
    const targetPath = path.join(packRoot, template.relativePath);
    
    if (!options.force) {
      try {
        await stat(targetPath);
        // If file exists but wasn't in the manifest, it's a conflict
        if (!existingManifest || !existingManifest.managedFiles.find(f => f.relativePath === template.relativePath)) {
           throw new Error(`File already exists and is not managed by a previous agent pack: ${targetPath}`);
        }
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
          throw error;
        }
      }
    }

    await writeFile(targetPath, template.content, "utf8");
  }

  // Write manifest
  await writeFile(
    resolveAgentPackManifestPath(options.targetDirectory),
    renderAgentPackManifest(options.manifest),
    "utf8"
  );
}

export async function uninstallAgentPack(targetDirectory: string): Promise<string[]> {
  const manifest = await readExistingAgentPackManifest(targetDirectory);
  if (!manifest) {
    throw new Error("No agent pack installation found to uninstall.");
  }

  const removedFiles: string[] = [];
  const packRoot = resolveAgentPackRoot(targetDirectory);

  for (const managedFile of manifest.managedFiles) {
    const filePath = path.join(packRoot, managedFile.relativePath);
    try {
      const currentContent = await readFile(filePath, "utf8");
      const currentHash = computeAgentPackContentHash(currentContent);
      
      if (currentHash === managedFile.contentHash) {
        await rm(filePath);
        removedFiles.push(managedFile.relativePath);
      } else {
        // Skip modified files
        console.warn(`Skipping modified file during uninstall: ${managedFile.relativePath}`);
      }
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
  }

  // Remove manifest
  await rm(resolveAgentPackManifestPath(targetDirectory));
  removedFiles.push(AGENT_PACK_MANIFEST_FILENAME);

  // Try to remove empty directories
  const subDirs = [...new Set(
    manifest.managedFiles
      .map((f) => path.dirname(f.relativePath))
      .filter((d) => d !== ".")
  )].sort((a, b) => b.length - a.length); // Deepest first

  for (const dir of subDirs) {
    try {
      await rmdir(path.join(packRoot, dir));
    } catch {
      // Ignore non-empty dirs
    }
  }

  try {
    await rmdir(packRoot);
  } catch {
    // Ignore non-empty pack root
  }

  return removedFiles;
}
