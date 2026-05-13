import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTENT_DIR = repoPath("src/content");
const CONTENT_LOADER = repoPath("src/content/content-loader.js");
const MAIN_ENTRY = repoPath("src/content/main.js");

// Class-b, deliberately not class-a: Chrome's classic content-script loader is
// browser packaging policy, not product law. The settled boundary is narrower:
// the manifest-loaded script performs one dynamic import into hex bootstrap and
// must not become a second home for product state, DOM ownership, image
// decoding, or durable host work.
test("content loader remains a dumb dynamic-import bridge", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "content loader remains a dumb dynamic-import bridge",
  });
  assert.equal(fs.existsSync(CONTENT_LOADER), true);
  const source = fs.readFileSync(CONTENT_LOADER, "utf8");

  assert.deepEqual(collectImportSources(source), []);
  assert.equal(countMatches(source, /\bimport\s*\(/g), 1);
  assert.match(source, /const EXTENSION_CONTENT_MODULE\s*=\s*"hex\/bootstrap\/extension-content\.js";/);
  assert.match(source, /void\s+import\(chrome\.runtime\.getURL\(EXTENSION_CONTENT_MODULE\)\)/);
  assert.match(source, /module\.startExtensionContent\(\{/);
  assert.match(source, /location:\s*window\.location/);
  assert.deepEqual(collectPatternViolations(CONTENT_LOADER, [
    {
      label: "product vocabulary",
      pattern: /\bsession\b|\breferenceImage\b|\bmode\b|\bpin\b|\bplacement\b/,
    },
    {
      label: "DOM ownership",
      pattern: /\bquerySelector\b|\bcreateElement\b|\baddEventListener\b/,
    },
    {
      label: "host work",
      pattern: /\bstorage\b|\bclipboard\b|\bFileReader\b|\bnew\s+Image\b/,
    },
  ]), []);
  assert.deepEqual(traceArchitectureCheck({
    trace,
    check: "check.content-loader-boundary",
  }), [
    flowEdge("check.content-loader-boundary", "sink.architecture-content-shell", {
      terminal: "architecture-check",
    }),
  ]);
});

// Class-b, deliberately not class-a: the file layout of the browser shell may
// change. The current contract is that there is no second content-script
// entrypoint with an implicit role; adding src/content/main.js must come with an
// explicit wiring-only test instead of inheriting product authority by accident.
test("content shell has no hidden main entrypoint", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "content shell has no hidden main entrypoint",
  });
  assert.equal(fs.existsSync(MAIN_ENTRY), false, [
    "src/content/main.js now exists.",
    "Replace this absence guard with a wiring-only contract before proceeding.",
  ].join(" "));
  assert.deepEqual(traceArchitectureCheck({
    trace,
    check: "check.content-entrypoint-boundary",
  }), [
    flowEdge("check.content-entrypoint-boundary", "sink.architecture-content-shell", {
      terminal: "architecture-check",
    }),
  ]);
});

// Class-b, deliberately not class-a: the browser-shell layout is still
// provisional. The boundary is stable: content code may pass ambient browser
// handles into bootstrap, but it must not step product state or select views.
test("content source does not own product stepping", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "content source does not own product stepping",
  });
  assert.deepEqual(collectContentVocabularyViolations([
    "APPLICATION_COMMAND_KIND",
    "createApplicationCommand",
    "handleApplicationCommand",
    "selectApplicationView",
    "createInitialApplicationState",
    "durable-state-changed",
  ]), []);
  assert.deepEqual(traceArchitectureCheck({
    trace,
    check: "check.content-product-stepping",
  }), [
    flowEdge("check.content-product-stepping", "sink.architecture-content-shell", {
      terminal: "architecture-check",
    }),
  ]);
});

// Class-b, deliberately not class-a: the exact browser-shell folder is still
// provisional. The stable boundary is that DOM ownership, image decoding, and
// storage execution stay in adapters, not the content composition edge.
test("content source does not own adapter mechanics", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "content source does not own adapter mechanics",
  });
  assert.deepEqual(collectContentPatternViolations([
    {
      label: "DOM construction",
      pattern: /\bcreateElement\b|\battachShadow\b|\breplaceChildren\b/,
    },
    {
      label: "DOM event ownership",
      pattern: /\baddEventListener\b|\bremoveEventListener\b/,
    },
    {
      label: "browser image decoding",
      pattern: /\bFileReader\b|\bnew\s+Image\b|\bcreateImageBitmap\b|\bcanvas\b/i,
    },
    {
      label: "extension storage execution",
      pattern: /\bchrome\s*\?\.\s*storage\b|\bchrome\.storage\b|\bstorage\.local\b/,
    },
  ]), []);
  assert.deepEqual(traceArchitectureCheck({
    trace,
    check: "check.content-adapter-mechanics",
  }), [
    flowEdge("check.content-adapter-mechanics", "sink.architecture-content-shell", {
      terminal: "architecture-check",
    }),
  ]);
});

// Class-b, deliberately not class-a: exact copy ownership may still move between
// application and UI view-model code. The stable boundary is that src/content is
// not where final labels or status prose accumulate.
test("content source does not own product copy", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "content source does not own product copy",
  });
  assert.deepEqual(collectContentPatternViolations([
    {
      label: "primary/status copy",
      pattern: /Confirm clear|Clear image|No image loaded|Paste cancelled|image loaded|No image found/i,
    },
  ]), []);
  assert.deepEqual(traceArchitectureCheck({
    trace,
    check: "check.content-product-copy",
  }), [
    flowEdge("check.content-product-copy", "sink.architecture-content-shell", {
      terminal: "architecture-check",
    }),
  ]);
});

// Class-b, deliberately not class-a: durable storage identity may ultimately be
// extension configuration, adapter-local identity, or bootstrap input. It should
// not be hard-coded in src/content, because that makes the shell a persistence
// owner.
test("content source does not define durable storage identity", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "content source does not define durable storage identity",
  });
  assert.deepEqual(collectContentPatternViolations([
    {
      label: "durable storage key",
      pattern: /STORAGE_KEY|id-overlay\.durable-state|id-overlay\/state/,
    },
  ]), []);
  assert.deepEqual(traceArchitectureCheck({
    trace,
    check: "check.content-storage-identity",
  }), [
    flowEdge("check.content-storage-identity", "sink.architecture-content-shell", {
      terminal: "architecture-check",
    }),
  ]);
});

function traceArchitectureCheck({ trace, check }) {
  const edges = [
    flowEdge(check, "sink.architecture-content-shell", {
      terminal: "architecture-check",
    }),
  ];
  for (const edge of edges) {
    trace.edge(edge);
  }
  assert.deepEqual(trace.edges, edges);
  return edges;
}

function collectContentVocabularyViolations(words) {
  return collectContentPatternViolations(words.map((word) => ({
    label: word,
    pattern: new RegExp(`\\b${escapeRegExp(word)}\\b`),
  })));
}

function collectContentPatternViolations(forbiddenPatterns) {
  const violations = [];
  for (const filePath of listJavaScriptFiles(CONTENT_DIR)) {
    violations.push(...collectPatternViolations(filePath, forbiddenPatterns));
  }
  return violations;
}

function collectPatternViolations(filePath, forbiddenPatterns) {
  const source = fs.readFileSync(filePath, "utf8");
  const violations = [];
  for (const { label, pattern } of forbiddenPatterns) {
    if (pattern.test(source)) {
      violations.push(`${relativeToRepo(filePath)} uses ${label}`);
    }
  }
  return violations;
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

function countMatches(source, pattern) {
  return Array.from(source.matchAll(pattern)).length;
}

function listJavaScriptFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  const files = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const filePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJavaScriptFiles(filePath));
      continue;
    }
    if (entry.isFile() && filePath.endsWith(".js")) {
      files.push(filePath);
    }
  }
  return files.sort();
}

function repoPath(...segments) {
  return path.join(REPO_ROOT, ...segments);
}

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
