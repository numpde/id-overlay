import test from "node:test";
import assert from "node:assert/strict";

import {
  hexPath,
  listJavaScriptFiles,
  readSource,
  relativeToRepo,
} from "../../class-a/architecture/source-files.js";

const PAGE_OSM_ADAPTER_DIR = hexPath("adapters/page-osm-id");

// Class-c: OSM/iD integration has three different reasons to change.
// Observation tracks page/map facts, projection maps explicit geometry, and
// gesture forwarding talks to the native map. Current code still keeps all
// three factories in `page-adapter.js`, so this remains an unsatisfied
// structural candidate.
//
// Decision: keep quarantined. Promote only when the adapter is actually split;
// until then this test is useful pressure but not stable architecture.
test("page OSM adapter files do not mix observation, projection, and gesture forwarding roles", () => {
  const violations = [];

  for (const filePath of listJavaScriptFiles(PAGE_OSM_ADAPTER_DIR)) {
    const source = stripComments(readSource(filePath));
    const roles = PAGE_OSM_BOUNDARY_ROLES
      .filter(({ patterns }) => patterns.some((pattern) => pattern.test(source)))
      .map(({ label }) => label);

    if (roles.length > 1) {
      violations.push(`${relativeToRepo(filePath)} mixes ${roles.join(", ")}`);
    }
  }

  assert.deepEqual(violations, []);
});

const PAGE_OSM_BOUNDARY_ROLES = Object.freeze([
  {
    label: "observation",
    patterns: [
      /\bcreateActiveMapContextAdapter\b/,
      /\bcreatePageSnapshotAdapter\b/,
      /\breadActiveMapContext\b/,
      /\breadSnapshot\b/,
      /\bparseMapHash\b/,
    ],
  },
  {
    label: "projection",
    patterns: [
      /\bcreateProjectionAdapter\b/,
      /\breadProjectionContext\b/,
      /\bprojectScreenPoint\b/,
    ],
  },
  {
    label: "gesture forwarding",
    patterns: [
      /\bcreateGestureForwardingAdapter\b/,
      /\bforwardGesture\b/,
      /\bgestureFact\b/,
    ],
  },
]);

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
