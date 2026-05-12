import test from "node:test";
import assert from "node:assert/strict";

import {
  hexPath,
  listJavaScriptFiles,
  readSource,
  relativeToRepo,
} from "../../class-a/architecture/source-files.js";

const PAGE_OSM_ADAPTER_DIR = hexPath("adapters/page-osm-id");

// Unclassified candidate: OSM/iD integration has three different reasons to
// change. Observation tracks page/map facts, projection maps explicit geometry,
// and gesture forwarding talks to the native map. A file that owns more than
// one role is likely to become a product-policy sink by accident.
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

// Unclassified candidate: the page adapter may know OSM/iD mechanics, but it
// must not know product state. If words like placement, mode, history, or
// application commands appear here, the boundary has started deciding app
// behavior instead of reporting page facts or transporting explicit gestures.
test("page OSM adapter source does not contain product vocabulary", () => {
  const violations = [];

  for (const filePath of listJavaScriptFiles(PAGE_OSM_ADAPTER_DIR)) {
    const source = stripComments(readSource(filePath));
    for (const { label, pattern } of FORBIDDEN_PRODUCT_PATTERNS) {
      if (pattern.test(source)) {
        violations.push(`${relativeToRepo(filePath)} contains ${label}`);
      }
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

const FORBIDDEN_PRODUCT_PATTERNS = Object.freeze([
  {
    label: "application command vocabulary",
    pattern: /\b(APPLICATION_COMMAND_KIND|createApplicationCommand|handleApplicationCommand|dispatchApplicationCommand)\b/,
  },
  {
    label: "product state vocabulary",
    pattern: /\b(session|referenceImage|registration|placement|panelIntent|notice|history|pins|opacity)\b|\bsession\s*[?.]\s*mode\b|\bmode\s*:\s*["'](?:align|trace)["']/,
  },
  {
    label: "application view vocabulary",
    pattern: /\b(selectApplicationView|primaryAction|status|toolbar|panel)\b/,
  },
]);

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
