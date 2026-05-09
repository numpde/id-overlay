// These tests keep the application ring replayable. Application code may
// compute next state and describe effects, but it must not consult ambient
// runtime facts or execute host work directly.
import test from "node:test";
import assert from "node:assert/strict";

import {
  hexPath,
  listJavaScriptFiles,
  readSource,
  relativeToRepo,
} from "./source-files.js";

const APPLICATION_SOURCE_DIR = hexPath("application");

const FORBIDDEN_AMBIENT_READS = [
  {
    label: "wall clock",
    pattern: /\bDate\b/,
  },
  {
    label: "randomness",
    pattern: /\bMath\.random\b|\brandomUUID\b|\bcrypto\b/,
  },
  {
    label: "performance clock",
    pattern: /\bperformance\b/,
  },
  {
    label: "environment variables",
    pattern: /\bprocess\.env\b/,
  },
  {
    label: "ambient global object",
    pattern: /\bglobalThis\b/,
  },
  {
    label: "module location",
    pattern: /\bimport\.meta\b/,
  },
];

const FORBIDDEN_EFFECT_EXECUTION = [
  {
    label: "async control flow",
    pattern: /\basync\b|\bawait\b|\bPromise\b/,
  },
  {
    label: "timers or task scheduling",
    pattern: /\bsetTimeout\b|\bclearTimeout\b|\bsetInterval\b|\bclearInterval\b|\bqueueMicrotask\b/,
  },
  {
    label: "network execution",
    pattern: /\bfetch\b|\bXMLHttpRequest\b/,
  },
  {
    label: "event wiring or dispatch",
    pattern: /\baddEventListener\b|\bremoveEventListener\b|\bdispatchEvent\b|\bpostMessage\b/,
  },
  {
    label: "external mutable storage",
    pattern: /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/,
  },
  {
    label: "logging side effect",
    pattern: /\bconsole\b/,
  },
];

// Class-a: replay, undo/redo, hydration, and tests all collapse if the reducer
// can read time, randomness, environment, or globals by itself. Those facts must
// enter as command data so state transitions remain a function of state+command.
test("application source does not read ambient runtime facts", () => {
  assert.deepEqual(collectPatternViolations(FORBIDDEN_AMBIENT_READS), []);
});

// Class-a: direct host work would create a second authority outside the returned
// result. Application code returns inert effect descriptions; adapters perform
// the actual async, IO, event, storage, and logging work.
test("application source does not execute effects", () => {
  assert.deepEqual(collectPatternViolations(FORBIDDEN_EFFECT_EXECUTION), []);
});

function collectPatternViolations(forbiddenPatterns) {
  const violations = [];
  for (const filePath of listJavaScriptFiles(APPLICATION_SOURCE_DIR)) {
    const source = readSource(filePath);
    for (const { label, pattern } of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativeToRepo(filePath)} uses ${label}`);
      }
    }
  }
  return violations;
}
