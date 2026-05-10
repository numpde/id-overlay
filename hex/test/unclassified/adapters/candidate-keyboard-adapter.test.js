import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// Candidate: keyboard handling is an adapter boundary. It should normalize DOM
// key events into plain interaction facts and leave mode/state decisions to the
// application/runtime path.
test("keyboard adapter emits temporary pass-through facts for Space press and release", async () => {
  const createKeyboardAdapter = await loadCandidateExport(
    "../../../adapters/ui/keyboard-adapter.js",
    "createKeyboardAdapter",
  );
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

// Candidate: P is an intent, not a registration edit. The adapter should not
// project coordinates, inspect pins, or mutate state; it should only report the
// user's request so the next boundary can combine it with pointer/projection
// facts.
test("keyboard adapter emits pin-toggle intent for P without product data", async () => {
  const createKeyboardAdapter = await loadCandidateExport(
    "../../../adapters/ui/keyboard-adapter.js",
    "createKeyboardAdapter",
  );
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

async function loadCandidateExport(modulePath, exportName) {
  let module;
  try {
    module = await import(modulePath);
  } catch (error) {
    assert.fail(
      `candidate expects ${modulePath} to exist and export ${exportName}: ${error.message}`,
    );
  }
  assert.equal(
    typeof module[exportName],
    "function",
    `candidate expects ${modulePath} to export function ${exportName}`,
  );
  return module[exportName];
}

function keyboardEvent(window, type, options) {
  return new window.KeyboardEvent(type, {
    ...options,
    bubbles: true,
    cancelable: true,
  });
}
