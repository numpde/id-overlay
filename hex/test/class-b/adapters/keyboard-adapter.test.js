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

// Class-b, deliberately not class-a: Escape is legacy keyboard policy. The
// stable boundary is that it crosses inward as a source-neutral Trace request;
// the adapter consumes the DOM shortcut and does not leak physical key
// vocabulary into the fact.
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

// Class-b, deliberately not class-a: blur handling is adapter/runtime posture,
// not product state. Losing keyboard focus should enter the application shell as
// one semantic interaction reset request, without exposing the browser event.
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

// Class-b, deliberately not class-a: editability is DOM-boundary policy. Text
// inputs and editable content keep normal browser shortcuts, while extension
// controls remain shortcut-safe surfaces.
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
