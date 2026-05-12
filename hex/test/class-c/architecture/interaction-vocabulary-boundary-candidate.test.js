import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Class-c: proposal for the canonical interaction-fact vocabulary.
//
// Decision encoded here: interaction facts are not DOM observations and not app
// commands. They are source-neutral user-intent facts that may still need
// projection/selection ports before becoming product commands. This rejects
// `overlay-*-wheel`, `keyboard-*`, raw `pointer*`, and button/deltaY fields as
// public vocabulary.
//
// Decision: keep quarantined. Current class-b tests still document low-level
// overlay/keyboard facts, so this source-scan becomes authoritative only after
// one deliberate interaction-vocabulary cut-over.
test("candidate: production interaction vocabulary is exact and source-neutral", () => {
  const source = INTERACTION_PRODUCTION_FILES
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
  const violations = [
    ...REQUIRED_INTERACTION_FACT_KINDS
      .filter((kind) => !source.includes(kind))
      .map((kind) => `missing canonical interaction fact kind: ${kind}`),
    ...FORBIDDEN_PUBLIC_INTERACTION_VOCABULARY.flatMap(({ label, pattern }) => (
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
]);

const FORBIDDEN_PUBLIC_INTERACTION_VOCABULARY = Object.freeze([
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
  {
    label: "button field leaks a DOM input detail",
    pattern: /\bbutton\s*:/,
  },
  {
    label: "deltaY field leaks WheelEvent field shape",
    pattern: /\bdeltaY\s*:/,
  },
  {
    label: "source fields preserve adapter provenance after mapping",
    pattern: /\bsource\s*:/,
  },
]);
