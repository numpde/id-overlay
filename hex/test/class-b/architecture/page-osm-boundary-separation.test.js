import test from "node:test";
import assert from "node:assert/strict";

import {
  hexPath,
  listJavaScriptFiles,
  readSource,
  relativeToRepo,
} from "../../class-a/architecture/source-files.js";

const PAGE_OSM_ADAPTER_DIR = hexPath("adapters/page-osm-id");

// Class-b: the exact OSM/iD adapter file layout may evolve, but legacy and the
// current hex tests both treat page observation, projection, and native-map
// gesture forwarding as different adapter roles. Keeping those roles separated
// makes the page boundary reviewable without promoting file names to class-a
// product law.
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
