// The legacy tree is reference material only. These tests prevent the clean
// implementation from quietly depending on quarantined source or tests.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";
import {
  HEX_ROOT,
  extractImportSpecifiers,
  hexPath,
  isInsidePath,
  listJavaScriptFiles,
  readSource,
  relativeToRepo,
  resolveRelativeImport,
  repoPath,
} from "./source-files.js";

test("legacy implementation remains quarantined outside the hex tree", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "legacy implementation remains quarantined outside the hex tree",
  });
  assert.equal(fs.existsSync(repoPath("legacy/src")), true);
  assert.equal(fs.existsSync(repoPath("legacy/test")), true);
  assert.equal(fs.existsSync(hexPath("legacy")), false);
  assert.deepEqual(traceArchitectureCheck({
    trace,
    check: "check.legacy-quarantine",
  }), [
    flowEdge("check.legacy-quarantine", "sink.architecture-legacy-boundary", {
      terminal: "architecture-check",
    }),
  ]);
});

test("hex JavaScript files do not import legacy code", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "hex JavaScript files do not import legacy code",
  });
  const violations = [];
  for (const filePath of listJavaScriptFiles(HEX_ROOT, { includeTests: true })) {
    for (const specifier of extractImportSpecifiers(readSource(filePath))) {
      const targetPath = resolveRelativeImport(filePath, specifier);
      if (specifier.includes("legacy") || (
        targetPath && isInsidePath(targetPath, repoPath("legacy"))
      )) {
        violations.push(`${relativeToRepo(filePath)} imports ${specifier}`);
      }
    }
  }

  assert.deepEqual(violations, []);
  assert.deepEqual(traceArchitectureCheck({
    trace,
    check: "check.hex-legacy-imports",
  }), [
    flowEdge("check.hex-legacy-imports", "sink.architecture-legacy-boundary", {
      terminal: "architecture-check",
    }),
  ]);
});

// Class-a: legacy is reference material, not a dependency tier. The future
// browser shell and build scripts are outside ./hex, so the quarantine must
// cover them too; otherwise a "clean" core could still ship through legacy
// content or packaging code.
test("browser shell and build path do not reference legacy", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser shell and build path do not reference legacy",
  });
  const violations = [];
  for (const filePath of [
    ...listJavaScriptFiles(repoPath("src")),
    ...listJavaScriptFiles(repoPath("scripts")),
    repoPath("manifest.chrome.json"),
  ]) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    if (/\blegacy\b|legacy\//.test(readSource(filePath))) {
      violations.push(relativeToRepo(filePath));
    }
  }

  assert.deepEqual(violations, []);
  assert.deepEqual(traceArchitectureCheck({
    trace,
    check: "check.browser-legacy-imports",
  }), [
    flowEdge("check.browser-legacy-imports", "sink.architecture-legacy-boundary", {
      terminal: "architecture-check",
    }),
  ]);
});

function traceArchitectureCheck({ trace, check }) {
  const edges = [
    flowEdge(check, "sink.architecture-legacy-boundary", {
      terminal: "architecture-check",
    }),
  ];
  for (const edge of edges) {
    trace.edge(edge);
  }
  assert.deepEqual(trace.edges, edges);
  return edges;
}
