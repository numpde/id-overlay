import test from "node:test";
import assert from "node:assert/strict";

import {
  hexPath,
  listJavaScriptFiles,
  readSource,
  relativeToRepo,
} from "../../class-a/architecture/source-files.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

const PAGE_OSM_ADAPTER_DIR = hexPath("adapters/page-osm-id");

// Class-b, deliberately not class-a: the exact OSM/iD adapter file layout is
// allowed to change. The stable boundary is that page integration may know page
// mechanics, but it must not know product state, panel copy, history, or app
// command execution; those remain inside application/bootstrap contracts.
test("page OSM adapter source does not contain product vocabulary", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "page OSM adapter source does not contain product vocabulary",
  });
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
  trace.edge(flowEdge("check.page-osm-product-boundary", "sink.architecture-boundary", {
    terminal: "architecture-check",
  }));
});

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
