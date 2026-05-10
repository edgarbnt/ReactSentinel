import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type DetectedFramework = "next" | "vite-react" | "react";

export type RelevantScript = {
  name: string;
  command: string;
  recommendation: "recommended" | "supported";
};

export type ProjectCandidate = {
  root: string;
  packageJsonPath: string;
  packageName: string | null;
  framework: DetectedFramework;
  score: number;
  evidence: string[];
  scripts: RelevantScript[];
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
