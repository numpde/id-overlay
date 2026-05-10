import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTENT_LOADER = repoPath("src/content/content-loader.js");
const MAIN_ENTRY = repoPath("src/content/main.js");
const EXTENSION_CONTENT_MODULE = "hex/bootstrap/extension-content.js";
const CONTENT_LOADER_MODULE = "./content-loader.js";

// Unclassified: this intentionally freezes an entrypoint shape before we have
// enough implementation pressure to call it class-b. The point is narrow:
// Chrome starts this classic content script, and this file crosses exactly once
// into the hex-owned bootstrap module.
test("content-loader is a minimal chrome bridge into hex bootstrap", () => {
  assert.equal(fs.existsSync(CONTENT_LOADER), true, "missing src/content/content-loader.js");
  const source = fs.readFileSync(CONTENT_LOADER, "utf8");

  assert.deepEqual(collectImportSources(source), []);
  assert.equal(countMatches(source, /\bimport\s*\(/g), 1);
  assert.match(source, /const EXTENSION_CONTENT_MODULE\s*=\s*"hex\/bootstrap\/extension-content\.js";/);
  assert.match(source, /void\s+import\(chrome\.runtime\.getURL\(EXTENSION_CONTENT_MODULE\)\)/);
  assert.match(source, /module\.startExtensionContent\(\{/);
  assert.match(source, /location:\s*window\.location/);

  assert.deepEqual(collectPatternViolations(source, [
    {
      label: "business logic",
      pattern: /new\s+Image\b|FileReader|storage|chrome\.storage|querySelector|addEventListener/i,
    },
  ]), []);
});

// Unclassified: src/content/main.js is not present yet. This test exists to
// make the next step explicit: either keep it absent, or introduce it as a
// wiring-only file and promote this contract with the actual allowed imports.
test("content/main.js has no hidden contract until it exists", () => {
  assert.equal(fs.existsSync(MAIN_ENTRY), false, [
    "src/content/main.js now exists.",
    "Replace this absence guard with a wiring-only contract before proceeding.",
  ].join(" "));
});

// Unclassified: this helper is deliberately unused until main.js exists. It
// records the intended contract without pretending to validate absent code.
function assertMainEntryIsWiringOnly(source) {
  assert.deepEqual(collectMainEntryWiringViolations(source), []);
}

test("future content/main.js wiring contract allows only hex bootstrap composition", () => {
  assertMainEntryIsWiringOnly(`
    import { startExtensionContent } from "hex/bootstrap/extension-content.js";
    import { createBrowserAdapters } from "hex/adapters/browser.js";

    startExtensionContent(createBrowserAdapters());
  `);
});

test("future content/main.js wiring contract rejects hidden browser and product ownership", () => {
  assert.deepEqual(collectMainEntryWiringViolations(`
    import { createElement } from "./panel.js";
    import { applyPlacement } from "hex/domain/placement.js";

    chrome.runtime.getURL("hex/bootstrap/extension-content.js");
    document.addEventListener("click", () => {});
  `), [
    "forbidden import in wiring entry: ./panel.js",
    "product stepping logic",
    "DOM ownership",
    "manual side-effect bootstrap call",
  ]);
});

function collectMainEntryWiringViolations(source) {
  return [
    ...collectForbiddenImports(collectImportSources(source)),
    ...collectPatternViolations(source, [
    {
      label: "product stepping logic",
      pattern: /createApplication|applyApplication|dismantle|overlay|placement|session|registration|history|mode|state-machine/i,
    },
    {
      label: "DOM ownership",
      pattern: /querySelector|createElement|addEventListener|removeEventListener/i,
    },
    {
      label: "durable-work side effects",
      pattern: /storage\.local|chrome\.storage|FileReader|new\s+Image|clipboard/i,
    },
    {
      label: "manual side-effect bootstrap call",
      pattern: /chrome\.runtime\.getURL\(|chrome\.scripting|chrome\.tabs|chrome\.storage/,
    },
    {
      label: "unsafe dynamic import",
      pattern: /import\s*\(/,
    },
  ])];
}

function collectImportSources(source) {
  const imports = [];
  const importRegex = /import\s+[^;]*?from\s+["']([^"']+)["']/g;
  let match;
  while ((match = importRegex.exec(source)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

function collectForbiddenImports(imports) {
  return imports.filter((specifier) => {
    if (specifier === CONTENT_LOADER_MODULE || specifier === "./content-loader") {
      return false;
    }
    return !specifier.startsWith("hex/");
  }).map((specifier) => `forbidden import in wiring entry: ${specifier}`);
}

function collectPatternViolations(source, forbiddenPatterns) {
  const violations = [];
  for (const { label, pattern } of forbiddenPatterns) {
    if (pattern.test(source)) {
      violations.push(label);
    }
  }
  return violations;
}

function countMatches(source, pattern) {
  return Array.from(source.matchAll(pattern)).length;
}

function repoPath(...segments) {
  return path.join(REPO_ROOT, ...segments);
}
