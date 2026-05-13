import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Unclassified candidate: the source-neutral interaction direction is solid, but this
// exact source-scan and `native-map-gesture-requested` vocabulary are still
// speculative architecture pressure. Promote only after the behavior cutover
// settles the public fact shape.
test("candidate: production interaction facts use only semantic public kinds", () => {
  const source = INTERACTION_PRODUCTION_FILES
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
  const violations = [
    ...REQUIRED_INTERACTION_FACT_KINDS
      .filter((kind) => !source.includes(kind))
      .map((kind) => `missing canonical interaction fact kind: ${kind}`),
    ...FORBIDDEN_PUBLIC_FACT_KIND_PATTERNS.flatMap(({ label, pattern }) => (
      pattern.test(source) ? [label] : []
    )),
  ];

  assert.deepEqual(violations, []);
});

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const INTERACTION_PRODUCTION_FILES = Object.freeze([
  "hex/adapters/ui/keyboard-adapter.js",
  "hex/adapters/ui/overlay-adapter.js",
  "hex/bootstrap/interaction-runtime.js",
].map((relativePath) => path.join(REPO_ROOT, relativePath)));

const REQUIRED_INTERACTION_FACT_KINDS = Object.freeze([
  "temporary-native-map-access-started",
  "temporary-native-map-access-ended",
  "registration-pin-toggle-requested",
  "placement-edit-requested",
  "opacity-adjustment-requested",
  "native-map-gesture-requested",
]);

const FORBIDDEN_PUBLIC_FACT_KIND_PATTERNS = Object.freeze([
  {
    label: "pass-through names input mechanics instead of native-map posture",
    pattern: /kind\s*:\s*"[^"]*pass-through[^"]*"|fact\.kind\s*[!=]==\s*"[^"]*pass-through[^"]*"/,
  },
  {
    label: "overlay-prefixed facts duplicate adapter ownership",
    pattern: /kind\s*:\s*"overlay-[^"]*"|fact\.kind\s*[!=]==\s*"overlay-[^"]*"/,
  },
  {
    label: "keyboard vocabulary leaks a source device into public facts",
    pattern: /kind\s*:\s*"[^"]*keyboard[^"]*"|fact\.kind\s*[!=]==\s*"[^"]*keyboard[^"]*"/,
  },
  {
    label: "pointer vocabulary leaks a DOM input family into public facts",
    pattern: /kind\s*:\s*"[^"]*pointer[^"]*"|fact\.kind\s*[!=]==\s*"[^"]*pointer[^"]*"/,
  },
  {
    label: "wheel vocabulary leaks a DOM input family into public facts",
    pattern: /kind\s*:\s*"[^"]*wheel[^"]*"|fact\.kind\s*[!=]==\s*"[^"]*wheel[^"]*"/,
  },
]);
