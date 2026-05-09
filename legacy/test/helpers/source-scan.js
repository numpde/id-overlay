import fs from "node:fs";
import path from "node:path";

import { repoPath } from "./paths.js";

export function readSource(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function sourceFileExists(filePath) {
  return fs.existsSync(filePath);
}

export function formatViolation(filePath, name) {
  return `${path.relative(repoPath(), filePath)}: ${name}`;
}

export function listJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listJavaScriptFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
  });
}

export function parseStaticImports(source) {
  const imports = [];
  const importRegex = /import\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g;
  for (const match of source.matchAll(importRegex)) {
    imports.push(match[1]);
  }
  return imports;
}

export function listTestNames(source) {
  return [...source.matchAll(/\btest\(\s*(["'`])([^"'`]+)\1/g)].map((match) => match[2]);
}
