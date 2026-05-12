import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createKeyboardAdapter,
} from "../../../adapters/ui/keyboard-adapter.js";

// Class-b, deliberately not class-a: the keyboard shortcut is adapter policy.
// The boundary is stable: DOM events stay adapter-local and become source-
// neutral interaction facts without mutating app state or inspecting product
// mode.
test("keyboard adapter emits temporary native-map access facts for Space press and release", () => {
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

  assert.deepEqual(facts, [
    {
      kind: "temporary-native-map-access-started",
    },
    {
      kind: "temporary-native-map-access-ended",
    },
  ]);
  assert.equal(JSON.stringify(facts).includes("Space"), false);
  assert.equal(JSON.stringify(facts).includes("keyboard"), false);
  assert.equal(JSON.stringify(facts).includes("pass-through"), false);
});

// Class-b, deliberately not class-a: P is shortcut vocabulary, not product law.
// The adapter emits a plain request fact only; projection, pin matching, and
// registration mutation belong outside the keyboard listener. Source provenance
// is intentionally not carried forward.
test("keyboard adapter emits pin-toggle intent for P without product data", () => {
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
    key: "p",
    code: "KeyP",
  }));

  assert.deepEqual(facts, [
    {
      kind: "registration-pin-toggle-requested",
    },
  ]);
  assert.equal(JSON.stringify(facts).includes("shortcut"), false);
});

function keyboardEvent(window, type, options) {
  return new window.KeyboardEvent(type, {
    ...options,
    bubbles: true,
    cancelable: true,
  });
}
