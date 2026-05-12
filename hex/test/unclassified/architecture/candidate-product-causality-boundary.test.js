import test from "node:test";
import assert from "node:assert/strict";
import {
  APPLICATION_COMMAND_KIND,
} from "../../../application/command.js";

// Unclassified: normative candidate tests for "Product causality and browser
// mechanics" in the rebuild charter. These tests are intentionally about
// architectural direction, not current implementation convenience. They should
// fail any design where the browser shell becomes a hidden product state machine
// or the application starts naming browser mechanics as product concepts.

// Candidate: adapters may emit normalized facts and the shell may project them,
// but application command names remain semantic. This keeps raw browser events
// from leaking into replayable product causality.
test("candidate: raw browser event vocabulary is absent from application command kinds", () => {
  const rawEventWords = [
    "click",
    "pointer",
    "mouse",
    "wheel",
    "keydown",
    "keyup",
    "paste-event",
    "paste-handle",
  ];

  assert.deepEqual(
    Object.values(APPLICATION_COMMAND_KIND).flatMap((kind) => (
      rawEventWords
        .filter((word) => kind.includes(word))
        .map((word) => `${kind} contains raw event word ${word}`)
    )),
    [],
  );
});
