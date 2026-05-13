import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createKeyboardAdapter,
} from "../../../adapters/ui/keyboard-adapter.js";

// Unclassified candidate: legacy Escape returned the user to Trace. In hex this
// should remain a source-neutral shortcut fact, with the app/runtime mapping it
// to a mode command. The adapter should consume only handled shortcuts and
// should not leak the physical key name inward.
test("keyboard adapter emits a source-neutral Trace request for Escape", () => {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const facts = [];
  const keyboard = createKeyboardAdapter({
    document: window.document,
    emitInteractionFact(fact) {
      facts.push(fact);
    },
  });
  keyboard.bindInput();
  const event = keyboardEvent(window, "keydown", {
    key: "Escape",
    code: "Escape",
  });

  window.document.dispatchEvent(event);

  assert.deepEqual(facts, [{
    kind: "trace-mode-requested",
  }]);
  assert.equal(event.defaultPrevented, true);
  assert.equal(JSON.stringify(facts).includes("Escape"), false);
  assert.equal(JSON.stringify(facts).includes("keyboard"), false);
});

// Unclassified candidate: blur ended transient interaction state in the legacy
// router. The exact reset payload is not settled, but losing keyboard focus
// should cross inward as one semantic interaction reset request.
test("keyboard adapter emits an interaction reset request on blur", () => {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const facts = [];
  const keyboard = createKeyboardAdapter({
    document: window.document,
    emitInteractionFact(fact) {
      facts.push(fact);
    },
  });
  keyboard.bindInput();

  window.document.dispatchEvent(new window.Event("blur"));

  assert.deepEqual(facts, [{
    kind: "interaction-reset-requested",
  }]);
});

// Unclassified candidate: keyboard editability is DOM-boundary policy. Text
// inputs and editable content should keep their normal shortcuts, while
// extension buttons remain shortcut-safe surfaces.
test("keyboard adapter ignores editable targets but accepts extension buttons", () => {
  const { window } = new JSDOM("<!doctype html><body><input><button></button></body>");
  const facts = [];
  const keyboard = createKeyboardAdapter({
    document: window.document,
    emitInteractionFact(fact) {
      facts.push(fact);
    },
  });
  const input = window.document.querySelector("input");
  const button = window.document.querySelector("button");
  keyboard.bindInput();
  const inputEvent = keyboardEvent(window, "keydown", {
    key: "p",
    code: "KeyP",
  });
  const buttonEvent = keyboardEvent(window, "keydown", {
    key: "p",
    code: "KeyP",
  });

  input.dispatchEvent(inputEvent);
  button.dispatchEvent(buttonEvent);

  assert.deepEqual(facts, [{
    kind: "registration-pin-toggle-requested",
  }]);
  assert.equal(inputEvent.defaultPrevented, false);
  assert.equal(buttonEvent.defaultPrevented, true);
});

function keyboardEvent(window, type, options) {
  return new window.KeyboardEvent(type, {
    ...options,
    bubbles: true,
    cancelable: true,
  });
}
