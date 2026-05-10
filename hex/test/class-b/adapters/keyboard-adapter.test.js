import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createKeyboardAdapter,
} from "../../../adapters/ui/keyboard-adapter.js";

// Class-b, not class-a: Space-as-temporary-pass-through is a useful loaded-map
// workflow, but the shortcut vocabulary may evolve. The durable boundary is
// stronger: keyboard DOM events are adapter-local and become plain interaction
// facts; they do not mutate application state or inspect product mode.
test("keyboard adapter emits temporary pass-through facts for Space press and release", () => {
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
      kind: "temporary-pass-through-pressed",
    },
    {
      kind: "temporary-pass-through-released",
    },
  ]);
});

// Class-b, not class-a: P is a plausible efficient shortcut, not a settled
// product law. The important boundary is that the adapter emits a request fact
// only; it does not project coordinates, inspect pins, or mutate registration.
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
      kind: "keyboard-pin-toggle-requested",
    },
  ]);
});

function keyboardEvent(window, type, options) {
  return new window.KeyboardEvent(type, {
    ...options,
    bubbles: true,
    cancelable: true,
  });
}
