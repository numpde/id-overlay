import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { repoPath } from "../helpers/paths.js";

const MACHINE_DIR = repoPath("src/core/machine");

const FORBIDDEN_IMPORTS = Object.freeze([
  "../state.js",
  "../interactions.js",
  "../presentation.js",
  "../panel-state.js",
  "../ui-effect-model.js",
  "../ui-event-model.js",
  "../ui-history-transition.js",
  "../ui-live-effect-runner.js",
  "../ui-live-state.js",
  "../ui-live-transition.js",
  "../ui-main-action-transition.js",
  "../ui-mode-transition.js",
  "../ui-registration-semantics.js",
  "../ui-registration-transition.js",
  "../ui-state-model.js",
  "../ui-status-model.js",
  "../ui-transition-result.js",
  "../ui-transition.js",
  "../ui-view-model.js",
  "../../content/",
]);

test("clean-room machine does not import legacy semantic ownership modules", () => {
  const violations = [];
  for (const filePath of listJavaScriptFiles(MACHINE_DIR)) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const importPath of parseStaticImports(source)) {
      if (FORBIDDEN_IMPORTS.some((forbidden) => importPath.startsWith(forbidden))) {
        violations.push(`${path.relative(repoPath(), filePath)} -> ${importPath}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("content bootstrap uses the machine host instead of the legacy state store", () => {
  const source = fs.readFileSync(repoPath("src/content/main.js"), "utf8");

  assert.match(source, /createMachineHost/);
  assert.doesNotMatch(source, /createStateStore/);
  assert.doesNotMatch(source, /"\.\.\/core\/state\.js"/);
});

function listJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listJavaScriptFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
  });
}

function parseStaticImports(source) {
  const imports = [];
  const importRegex = /import\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g;
  for (const match of source.matchAll(importRegex)) {
    imports.push(match[1]);
  }
  return imports;
}
