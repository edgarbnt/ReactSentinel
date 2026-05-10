import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type DetectedFramework = "next" | "vite-react" | "react";

export type RelevantScript = {
  name: string;
  command: string;
  recommendation: "recommended" | "supported";
};

export type DevServerDetection = {
  activeUrl: string | null;
  suggestedUrl: string | null;
  suggestions: string[];
  source: string | null;
};

export type ProjectCandidate = {
  root: string;
  packageJsonPath: string;
  packageName: string | null;
  framework: DetectedFramework;
  score: number;
  evidence: string[];
  scripts: RelevantScript[];
  devServer: DevServerDetection;
};

type PackageJson = {
  name?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

async function findPackageJsonFiles(baseDir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
        continue;
      }

      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name === "package.json") {
        results.push(entryPath);
      }
    }
  }

  await walk(baseDir);
  return results;
}

function readPackageName(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function detectFramework(packageJsonPath: string, manifest: PackageJson): ProjectCandidate | null {
  const dependencies = manifest.dependencies ?? {};
  const devDependencies = manifest.devDependencies ?? {};
  const evidence: string[] = [];
  let framework: DetectedFramework | null = null;
  let score = 0;

  if (typeof dependencies.next === "string") {
    framework = "next";
    score += 6;
    evidence.push("dependencies.next");
  }

  if (typeof devDependencies.vite === "string" || typeof dependencies.vite === "string") {
    framework = "vite-react";
    score += 4;
    evidence.push(typeof devDependencies.vite === "string" ? "devDependencies.vite" : "dependencies.vite");
  }

  if (typeof devDependencies["@vitejs/plugin-react"] === "string") {
    framework = "vite-react";
    score += 4;
    evidence.push("devDependencies.@vitejs/plugin-react");
  }

  if (typeof dependencies.react === "string") {
    framework ??= "react";
    score += 2;
    evidence.push("dependencies.react");
  }

  if (typeof dependencies["react-dom"] === "string") {
    framework ??= "react";
    score += 2;
    evidence.push("dependencies.react-dom");
  }

  if (!framework) {
    return null;
  }

  const scripts = collectRelevantScripts(manifest.scripts ?? {});
  return {
    root: path.dirname(packageJsonPath),
    packageJsonPath,
    packageName: readPackageName(manifest.name),
    framework,
    score,
    evidence,
    scripts,
    devServer: {
      activeUrl: null,
      suggestedUrl: null,
      suggestions: [],
      source: null,
    },
  };
}

function collectRelevantScripts(scripts: Record<string, string>): RelevantScript[] {
  const preferredOrder = ["dev", "start", "preview", "serve"];
  const relevantNames = preferredOrder.filter((name) => typeof scripts[name] === "string" && scripts[name].trim());
  const extras = Object.keys(scripts)
    .filter((name) => /dev|start|preview|serve/i.test(name) && !relevantNames.includes(name))
    .sort((left, right) => left.localeCompare(right));

  const orderedNames = [...relevantNames, ...extras];
  return orderedNames.map((name, index) => ({
    name,
    command: scripts[name],
    recommendation: index === 0 ? "recommended" : "supported",
  }));
}

export async function detectProjectCandidates(baseDir: string): Promise<ProjectCandidate[]> {
  const packageJsonFiles = await findPackageJsonFiles(baseDir);
  const candidates: ProjectCandidate[] = [];

  for (const packageJsonPath of packageJsonFiles) {
    const manifest = JSON.parse(await readFile(packageJsonPath, "utf8")) as PackageJson;
    const candidate = detectFramework(packageJsonPath, manifest);
    if (candidate) {
      candidate.devServer = await detectDevServer(candidate);
      candidates.push(candidate);
    }
  }

  candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.root.localeCompare(right.root);
  });

  return candidates;
}

function detectPortFromCommand(command: string): number | null {
  const patterns = [
    /--port(?:=|\s+)(\d{2,5})/,
    /-p\s+(\d{2,5})/,
    /\bPORT=(\d{2,5})\b/,
  ];

  for (const pattern of patterns) {
    const match = command.match(pattern);
    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

function buildUrlSuggestions(candidate: ProjectCandidate): { suggestions: string[]; source: string | null } {
  const suggestions = new Set<string>();
  let source: string | null = null;

  for (const script of candidate.scripts) {
    const detectedPort = detectPortFromCommand(script.command);
    if (detectedPort) {
      suggestions.add(`http://127.0.0.1:${detectedPort}`);
      source ??= `script:${script.name}`;
    }
  }

  if (suggestions.size === 0) {
    const defaultPort = candidate.framework === "vite-react" ? 5173 : 3000;
    suggestions.add(`http://127.0.0.1:${defaultPort}`);
    source = `${candidate.framework}:default-port`;
  }

  return {
    suggestions: Array.from(suggestions),
    source,
  };
}

async function probeReachableUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(1000),
    });
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  }
}

async function detectDevServer(candidate: ProjectCandidate): Promise<DevServerDetection> {
  const { suggestions, source } = buildUrlSuggestions(candidate);
  for (const url of suggestions) {
    if (await probeReachableUrl(url)) {
      return {
        activeUrl: url,
        suggestedUrl: suggestions[0] ?? null,
        suggestions,
        source,
      };
    }
  }

  return {
    activeUrl: null,
    suggestedUrl: suggestions[0] ?? null,
    suggestions,
    source,
  };
}
