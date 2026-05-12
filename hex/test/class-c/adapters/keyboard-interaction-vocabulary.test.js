import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createKeyboardAdapter,
} from "../../../adapters/ui/keyboard-adapter.js";

// Class-c: this is a proposed canonical interaction vocabulary, not a satisfied
// adapter contract. Current class-b tests intentionally document today's
// `temporary-pass-through-*` and shortcut-source facts; this quarantine keeps
// the better source-neutral shape visible without letting an unsatisfied rename
// pretend to be stable.
//
// Decision: keep as class-c until the whole interaction vocabulary is cut over
// at once. Promoting only the keyboard vocabulary would create a split-brain
// boundary with overlay and runtime facts.
test("candidate: keyboard adapter emits canonical source-neutral interaction facts", () => {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const facts = [];
  const keyboard = createKeyboardAdapter({
    document: window.document,
    emitInteractionFact(fact) {
      facts.push(fact);
    },
  });

  keyboard.bindInput();
  window.document.dispatchEvent(keyboardEvent(window, "keydown", {
    key: " ",
    code: "Space",
  }));
  window.document.dispatchEvent(keyboardEvent(window, "keyup", {
    key: " ",
    code: "Space",
  }));
  window.document.dispatchEvent(keyboardEvent(window, "keydown", {
    key: "p",
    code: "KeyP",
  }));

  assert.deepEqual(facts, [
    {
      kind: "temporary-native-map-access-started",
    },
    {
      kind: "temporary-native-map-access-ended",
    },
    {
      kind: "registration-pin-toggle-requested",
    },
  ]);
  assert.equal(JSON.stringify(facts).includes("keyboard"), false);
  assert.equal(JSON.stringify(facts).includes("Space"), false);
  assert.equal(JSON.stringify(facts).includes("shortcut"), false);
  assert.equal(JSON.stringify(facts).includes("pass-through"), false);
});

function keyboardEvent(window, type, options) {
  return new window.KeyboardEvent(type, {
    ...options,
    bubbles: true,
    cancelable: true,
  });
}
