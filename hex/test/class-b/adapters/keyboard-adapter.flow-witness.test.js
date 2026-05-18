import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createKeyboardAdapter,
} from "../../../adapters/ui/keyboard-adapter.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: the keyboard shortcut is adapter policy.
// The boundary is stable: DOM events stay adapter-local and become source-
// neutral interaction facts without mutating app state or inspecting product
// mode.
test("keyboard adapter emits temporary native-map access facts for Space press and release", () => {
  const harness = createKeyboardHarness({
    test: "keyboard adapter emits temporary native-map access facts for Space press and release",
  });

  harness.keyboard.bindInput();
  harness.dispatchDocumentKeyboard("source.keyboard.space.keydown", "keydown", {
    key: " ",
    code: "Space",
  });
  harness.dispatchDocumentKeyboard("source.keyboard.space.keyup", "keyup", {
    key: " ",
    code: "Space",
  });

  assert.deepEqual(harness.facts, [
    {
      kind: "temporary-native-map-access-started",
    },
    {
      kind: "temporary-native-map-access-ended",
    },
  ]);
  assert.equal(JSON.stringify(harness.facts).includes("Space"), false);
  assert.equal(JSON.stringify(harness.facts).includes("keyboard"), false);
  assert.equal(JSON.stringify(harness.facts).includes("pass-through"), false);
  assert.deepEqual(harness.trace.edges, [
    flowEdge("source.keyboard.space.keydown", "callback.interaction-fact.temporary-native-map-access-started", {
      provider: "keyboard-adapter",
    }),
    flowEdge("source.keyboard.space.keyup", "callback.interaction-fact.temporary-native-map-access-ended", {
      provider: "keyboard-adapter",
    }),
  ]);
});

// Class-b, deliberately not class-a: P is shortcut vocabulary, not product law.
// The adapter emits a plain request fact only; projection, pin matching, and
// registration mutation belong outside the keyboard listener. Source provenance
// is intentionally not carried forward.
test("keyboard adapter emits pin-toggle intent for P without product data", () => {
  const harness = createKeyboardHarness({
    test: "keyboard adapter emits pin-toggle intent for P without product data",
  });

  harness.keyboard.bindInput();
  harness.dispatchDocumentKeyboard("source.keyboard.p.keydown", "keydown", {
    key: "p",
    code: "KeyP",
  });

  assert.deepEqual(harness.facts, [
    {
      kind: "registration-pin-toggle-requested",
    },
  ]);
  assert.equal(JSON.stringify(harness.facts).includes("shortcut"), false);
  assert.deepEqual(harness.trace.edges, [
    flowEdge("source.keyboard.p.keydown", "callback.interaction-fact.registration-pin-toggle-requested", {
      provider: "keyboard-adapter",
    }),
  ]);
});

// Class-b, deliberately not class-a: Escape is legacy keyboard policy. The
// stable boundary is that it crosses inward as a source-neutral Trace request;
// the adapter consumes the DOM shortcut and does not leak physical key
// vocabulary into the fact.
test("keyboard adapter emits a source-neutral Trace request for Escape", () => {
  const harness = createKeyboardHarness({
    test: "keyboard adapter emits a source-neutral Trace request for Escape",
  });
  harness.keyboard.bindInput();
  const event = keyboardEvent(harness.window, "keydown", {
    key: "Escape",
    code: "Escape",
  });

  harness.trace.withSource("source.keyboard.escape.keydown", () => {
    harness.window.document.dispatchEvent(event);
  });

  assert.deepEqual(harness.facts, [{
    kind: "trace-mode-requested",
  }]);
  assert.equal(event.defaultPrevented, true);
  assert.equal(JSON.stringify(harness.facts).includes("Escape"), false);
  assert.equal(JSON.stringify(harness.facts).includes("keyboard"), false);
  assert.deepEqual(harness.trace.edges, [
    flowEdge("source.keyboard.escape.keydown", "callback.interaction-fact.trace-mode-requested", {
      provider: "keyboard-adapter",
    }),
  ]);
});

// Class-b, deliberately not class-a: focus-loss handling is adapter/runtime
// posture, not product state. Losing the owner window should enter the
// application shell as one semantic interaction reset request, without exposing
// the browser event.
test("keyboard adapter emits an interaction reset request on owner-window blur", () => {
  const harness = createKeyboardHarness({
    test: "keyboard adapter emits an interaction reset request on owner-window blur",
  });
  harness.keyboard.bindInput();

  harness.trace.withSource("source.keyboard.window-blur", () => {
    harness.window.dispatchEvent(new harness.window.Event("blur"));
  });

  assert.deepEqual(harness.facts, [{
    kind: "interaction-reset-requested",
  }]);
  assert.deepEqual(harness.trace.edges, [
    flowEdge("source.keyboard.window-blur", "callback.interaction-fact.interaction-reset-requested", {
      provider: "keyboard-adapter",
    }),
  ]);
});

// Class-b, deliberately not class-a: editability is DOM-boundary policy. Text
// inputs and editable content keep normal browser shortcuts, while extension
// controls remain shortcut-safe surfaces.
test("keyboard adapter ignores editable targets but accepts extension buttons", () => {
  const harness = createKeyboardHarness({
    test: "keyboard adapter ignores editable targets but accepts extension buttons",
    html: "<!doctype html><body><input><button></button></body>",
  });
  const input = harness.window.document.querySelector("input");
  const button = harness.window.document.querySelector("button");
  harness.keyboard.bindInput();
  const inputEvent = keyboardEvent(harness.window, "keydown", {
    key: "p",
    code: "KeyP",
  });
  const buttonEvent = keyboardEvent(harness.window, "keydown", {
    key: "p",
    code: "KeyP",
  });

  harness.dispatchTargetKeyboard(input, "source.keyboard.editable-target.p.keydown", inputEvent);
  harness.dispatchTargetKeyboard(button, "source.keyboard.button.p.keydown", buttonEvent);

  assert.deepEqual(harness.facts, [{
    kind: "registration-pin-toggle-requested",
  }]);
  assert.equal(inputEvent.defaultPrevented, false);
  assert.equal(buttonEvent.defaultPrevented, true);
  assert.deepEqual(harness.trace.edges, [
    flowEdge("source.keyboard.editable-target.p.keydown", "inert.editable-key-target", {
      terminal: "intentionally-inert",
    }),
    flowEdge("source.keyboard.button.p.keydown", "callback.interaction-fact.registration-pin-toggle-requested", {
      provider: "keyboard-adapter",
    }),
  ]);
});

// Class-b: keyboard capture is a browser-adapter resource. Binding must be
// idempotent, and teardown must remove the exact listeners it installed so a
// disposed browser session cannot keep emitting interaction facts.
test("keyboard adapter owns a disposable, idempotent listener lifecycle", () => {
  const harness = createKeyboardHarness({
    test: "keyboard adapter owns a disposable, idempotent listener lifecycle",
  });

  harness.keyboard.bindInput();
  harness.keyboard.bindInput();
  harness.dispatchDocumentKeyboard("source.keyboard.bound.p.keydown", "keydown", {
    key: "p",
    code: "KeyP",
  });
  harness.keyboard.destroy();
  harness.keyboard.destroy();
  harness.dispatchDisposedDocumentKeyboard("source.keyboard.disposed.p.keydown", "keydown", {
    key: "p",
    code: "KeyP",
  });

  assert.deepEqual(harness.facts, [{
    kind: "registration-pin-toggle-requested",
  }]);
  assert.deepEqual(harness.trace.edges, [
    flowEdge("source.keyboard.bound.p.keydown", "callback.interaction-fact.registration-pin-toggle-requested", {
      provider: "keyboard-adapter",
    }),
    flowEdge("source.keyboard.disposed.p.keydown", "inert.disposed-keyboard-adapter", {
      terminal: "intentionally-inert",
    }),
  ]);
});

function createKeyboardHarness({
  test,
  html = "<!doctype html><body></body>",
}) {
  const { window } = new JSDOM(html);
  const trace = createFlowTrace({
    file: import.meta.url,
    test,
  });
  const facts = [];
  const keyboard = createKeyboardAdapter({
    document: window.document,
    ownerWindow: window,
    emitInteractionFact(fact) {
      facts.push(fact);
      trace.edge(flowEdge(
        trace.activeSource() ?? "source.keyboard.unattributed",
        `callback.interaction-fact.${fact.kind}`,
        {
          provider: "keyboard-adapter",
        },
      ));
    },
  });

  return {
    window,
    trace,
    facts,
    keyboard,
    dispatchDocumentKeyboard(source, type, options) {
      trace.withSource(source, () => {
        window.document.dispatchEvent(keyboardEvent(window, type, options));
      });
    },
    dispatchDisposedDocumentKeyboard(source, type, options) {
      const factCount = facts.length;
      trace.withSource(source, () => {
        window.document.dispatchEvent(keyboardEvent(window, type, options));
      });
      if (facts.length === factCount) {
        trace.edge(flowEdge(source, "inert.disposed-keyboard-adapter", {
          terminal: "intentionally-inert",
        }));
      }
    },
    dispatchTargetKeyboard(target, source, event) {
      const factCount = facts.length;
      trace.withSource(source, () => {
        target.dispatchEvent(event);
      });
      if (facts.length === factCount) {
        trace.edge(flowEdge(source, "inert.editable-key-target", {
          terminal: "intentionally-inert",
        }));
      }
    },
  };
}

function keyboardEvent(window, type, options) {
  return new window.KeyboardEvent(type, {
    ...options,
    bubbles: true,
    cancelable: true,
  });
}
