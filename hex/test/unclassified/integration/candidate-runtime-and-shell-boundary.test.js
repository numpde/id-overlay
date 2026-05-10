import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Candidate: real shell integration should be composition, not product logic.
// This source-level tripwire is intentionally broad: when the shell appears, it
// should wire adapters/runtime/view-model and avoid reintroducing direct session
// mutations like the deleted fake scaffold.
test("browser shell composes adapters runtime and view model without owning product transitions", () => {
  const source = fs.readFileSync(repoPath("hex/bootstrap/index.js"), "utf8");

  assert.match(source, /\bcreateRuntimeDriver\b|\bwireRuntime\b/);
  assert.match(source, /\bcreatePanelAdapter\b/);
  assert.match(source, /\bcreateOverlayAdapter\b/);
  assert.match(source, /\bselectApplicationView\b/);
  assert.doesNotMatch(source, /\bsession\s*:\s*\{/);
  assert.doesNotMatch(source, /\bhistory\s*:\s*\{\s*past\s*:/);
});

async function loadCandidateExport(modulePath, exportName) {
  let module;
  try {
    module = await import(modulePath);
  } catch (error) {
    assert.fail(
      `candidate expects ${modulePath} to exist and export ${exportName}: ${error.message}`,
    );
  }
  assert.equal(
    typeof module[exportName],
    "function",
    `candidate expects ${modulePath} to export function ${exportName}`,
  );
  return module[exportName];
}

function createBrowserHostHarness({ pageContext }) {
  const ownedRoots = new Map();
  return {
    pageContext,
    startedRuntimeCount: 0,
    mountOwnedRoot(ownerId, root) {
      ownedRoots.set(ownerId, root);
    },
    countOwnedRoots(ownerId) {
      return ownedRoots.has(ownerId) ? 1 : 0;
    },
    startRuntime(runtime) {
      this.startedRuntimeCount += 1;
      return runtime;
    },
  };
}

function repoPath(...segments) {
  return path.resolve(process.cwd(), ...segments);
}
