import test from "node:test";
import assert from "node:assert/strict";
import {
  hexPath,
  listJavaScriptFiles,
  readSource,
  relativeToRepo,
} from "../../class-a/architecture/source-files.js";

const EXTENSION_CONTENT_SOURCE = hexPath("bootstrap/extension-content.js");

// Class-b: browser entrypoint lifecycle is shell behavior, not product law. The
// extension bootstrap should wait for DOM readiness before mounting visible UI
// when the content script evaluates while the document is still loading.
test("extension content queues bootstrap until DOMContentLoaded while the document is loading", () => {
  const source = readSource(EXTENSION_CONTENT_SOURCE);

  assert.match(source, /\bdocument\.readyState\b/);
  assert.match(source, /DOMContentLoaded/);
  assert.match(source, /\baddEventListener\s*\(\s*["']DOMContentLoaded["']/);
});

// Class-b: browser content scripts can be reinjected. The entrypoint should
// share one in-flight bootstrap per page context instead of starting duplicate
// runtimes or injecting duplicate owned roots.
test("extension content shares one in-flight bootstrap across repeated entrypoint evaluation", () => {
  const source = readSource(EXTENSION_CONTENT_SOURCE);

  assert.match(source, /inFlight|bootstrapped|bootstrapPromise|idOverlayBootstrap/i);
  assert.match(source, /ownerWindow|window|globalThis/);
});

// Class-b: a failed bootstrap should not poison the page for the rest of the
// tab lifetime. Once the failed in-flight state is cleared, a later content
// script evaluation can retry.
test("extension content clears failed bootstrap state so later evaluation can retry", () => {
  const source = readSource(EXTENSION_CONTENT_SOURCE);

  assert.match(source, /\.catch\s*\(/);
  assert.match(source, /inFlight\s*=\s*null|bootstrapPromise\s*=\s*null|delete\s+.*idOverlayBootstrap/i);
});

// Class-b, deliberately not class-a: this is a source-level anti-regression
// guard around a still-thin composition layer. The no-regret boundary is narrow:
// bootstrap may wire ports and application functions, but it must not recreate
// product state shape or own user-facing product copy.
test("bootstrap source does not define product state or product copy", () => {
  assert.deepEqual(collectPatternViolations([
    {
      label: "inline product state shape",
      pattern: /\b(session|referenceImage|registration|placement|history|notice|inputOverride|mode|pins)\s*:/,
    },
    {
      label: "product copy",
      pattern: /["'`][^"'`]*(?:Paste|Clear image|Clear pins|Trace|Align|Reload image|No image|Paste cancelled)[^"'`]*["'`]/i,
    },
  ]), []);
});

function collectPatternViolations(forbiddenPatterns) {
  const violations = [];
  for (const filePath of listJavaScriptFiles(hexPath("bootstrap"))) {
    const source = readSource(filePath);
    for (const { label, pattern } of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativeToRepo(filePath)} uses ${label}`);
      }
    }
  }
  return violations;
}
