import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createKeyboardAdapter,
} from "../../../adapters/ui/keyboard-adapter.js";

// Unclassified: proposal for keyboard adapter output. Keyboard mechanics are
// adapter-local; downstream code receives the same interaction facts another
// adapter could emit from a toolbar, gesture, or accessibility control.
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
