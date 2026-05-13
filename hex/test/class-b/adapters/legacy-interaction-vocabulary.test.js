import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createKeyboardAdapter,
} from "../../../adapters/ui/keyboard-adapter.js";
import {
  createOverlayAdapter,
} from "../../../adapters/ui/overlay-adapter.js";

// Class-b: these are legacy-faithful interaction behaviors, but still UI
// gesture policy rather than class-a product law.
//
// Legacy behavior says:
// - double-click toggles a registration pin; plain click is not a pin toggle
// - P toggles a registration pin at the current pointer
// - shift-drag moves the overlay; plain drag remains native-map pan
// - alt/ctrl/shift wheel map to opacity/rotate/scale; plain wheel remains
//   native-map zoom
//
// The boundary claim is that DOM/device details stay adapter-local. Public
// facts name semantic intent, not overlay, pointer, keyboard, wheel, button, or
// deltaY mechanics.
test("legacy overlay pin gesture is double-click, not plain click", () => {
  const { window, surface, facts } = createOverlayHarness();

  dispatchMouse(window, surface, "click", {
    clientX: 120,
    clientY: 90,
  });
  assert.deepEqual(facts, []);

  dispatchMouse(window, surface, "dblclick", {
    clientX: 120,
    clientY: 90,
  });

  assert.deepEqual(facts, [{
    kind: "registration-pin-toggle-requested",
    screenPx: {
      x: 120,
      y: 90,
    },
  }]);
  assertNoDomInputVocabulary(facts);
});

// Class-b: in Align, overlay pointerdown owns the browser click sequence so a
// click on the overlay cannot leak to the native map. Pointerdown alone is not a
// product edit and should not emit an inward interaction fact.
test("overlay pointerdown owns the DOM click sequence without forcing a product edit", () => {
  const { window } = new JSDOM("<!doctype html><body><div id='map'><div id='overlay'></div></div></body>");
  const map = window.document.getElementById("map");
  const overlaySurface = window.document.getElementById("overlay");
  const facts = [];
  let mapPointerDownCount = 0;
  const overlay = createOverlayAdapter({
    document: window.document,
    emitInteractionFact(fact) {
      facts.push(fact);
    },
  });
  map.addEventListener("pointerdown", () => {
    mapPointerDownCount += 1;
  });
  overlay.bindInput(overlaySurface);

  const event = new window.MouseEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    clientX: 512,
    clientY: 288,
    button: 0,
  });
  overlaySurface.dispatchEvent(event);

  assert.equal(event.defaultPrevented, true);
  assert.equal(mapPointerDownCount, 0);
  assert.deepEqual(facts, []);
});

test("keyboard P uses the same source-neutral pin-toggle vocabulary", () => {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const facts = [];
  const keyboard = createKeyboardAdapter({
    document: window.document,
    emitInteractionFact(fact) {
      facts.push(fact);
    },
  });

  keyboard.bindInput();
  window.document.dispatchEvent(new window.KeyboardEvent("keydown", {
    key: "p",
    code: "KeyP",
    bubbles: true,
    cancelable: true,
  }));

  assert.deepEqual(facts, [{
    kind: "registration-pin-toggle-requested",
  }]);
  assertNoDomInputVocabulary(facts);
});

test("shift-drag requests overlay move and plain drag stays native-map", () => {
  const plainDrag = createOverlayHarness();

  dispatchPointer(plainDrag.window, plainDrag.surface, "pointerdown", {
    clientX: 120,
    clientY: 90,
  });
  dispatchPointer(plainDrag.window, plainDrag.surface, "pointermove", {
    clientX: 150,
    clientY: 110,
  });
  dispatchPointer(plainDrag.window, plainDrag.surface, "pointerup", {
    clientX: 150,
    clientY: 110,
  });

  assert.deepEqual(plainDrag.facts, [
    {
      kind: "native-map-gesture-requested",
      gestureKind: "pan",
      phase: "start",
      screenPx: {
        x: 120,
        y: 90,
      },
    },
    {
      kind: "native-map-gesture-requested",
      gestureKind: "pan",
      phase: "move",
      screenPx: {
        x: 150,
        y: 110,
      },
    },
    {
      kind: "native-map-gesture-requested",
      gestureKind: "pan",
      phase: "end",
      screenPx: {
        x: 150,
        y: 110,
      },
    },
  ]);

  const overlayDrag = createOverlayHarness();

  dispatchPointer(overlayDrag.window, overlayDrag.surface, "pointerdown", {
    clientX: 120,
    clientY: 90,
    shiftKey: true,
  });
  dispatchPointer(overlayDrag.window, overlayDrag.surface, "pointermove", {
    clientX: 150,
    clientY: 110,
    shiftKey: true,
  });
  dispatchPointer(overlayDrag.window, overlayDrag.surface, "pointerup", {
    clientX: 150,
    clientY: 110,
    shiftKey: true,
  });

  assert.deepEqual(overlayDrag.facts, [{
    kind: "placement-edit-requested",
    editKind: "move",
    screenDeltaPx: {
      x: 30,
      y: 20,
    },
    anchorScreenPx: {
      x: 120,
      y: 90,
    },
  }]);
  assertNoDomInputVocabulary(overlayDrag.facts);
});

// Class-b: drag activation threshold is interaction policy, not product law.
// The stable legacy behavior is that small pointer jitter after an overlay
// pointerdown is inert, while deliberate movement emits one semantic move edit.
test("overlay move drag starts only after deliberate pointer movement", () => {
  const { window, surface, facts } = createOverlayHarness();

  dispatchPointer(window, surface, "pointerdown", {
    clientX: 100,
    clientY: 100,
    shiftKey: true,
  });
  dispatchPointer(window, window, "pointermove", {
    clientX: 102,
    clientY: 101,
    shiftKey: true,
  });
  assert.deepEqual(facts.filter(isPlacementEditFact), []);

  dispatchPointer(window, window, "pointermove", {
    clientX: 124,
    clientY: 118,
    shiftKey: true,
  });
  dispatchPointer(window, window, "pointerup", {
    clientX: 124,
    clientY: 118,
    shiftKey: true,
  });

  assert.deepEqual(facts.filter(isPlacementEditFact), [{
    kind: "placement-edit-requested",
    editKind: "move",
    screenDeltaPx: {
      x: 24,
      y: 18,
    },
    anchorScreenPx: {
      x: 100,
      y: 100,
    },
  }]);
  assertNoDomInputVocabulary(facts);
});

test("modifier wheels edit overlay while plain wheel requests native-map zoom", () => {
  const { window, surface, facts } = createOverlayHarness();

  dispatchWheel(window, surface);
  dispatchWheel(window, surface, {
    altKey: true,
  });
  dispatchWheel(window, surface, {
    ctrlKey: true,
  });
  dispatchWheel(window, surface, {
    shiftKey: true,
  });

  assert.deepEqual(facts, [
    {
      kind: "native-map-gesture-requested",
      gestureKind: "zoom",
      inputDelta: {
        y: -100,
      },
      anchorScreenPx: {
        x: 120,
        y: 90,
      },
    },
    {
      kind: "opacity-adjustment-requested",
      inputDelta: {
        y: -100,
      },
      anchorScreenPx: {
        x: 120,
        y: 90,
      },
    },
    {
      kind: "placement-edit-requested",
      editKind: "rotate",
      inputDelta: {
        y: -100,
      },
      anchorScreenPx: {
        x: 120,
        y: 90,
      },
    },
    {
      kind: "placement-edit-requested",
      editKind: "scale",
      inputDelta: {
        y: -100,
      },
      anchorScreenPx: {
        x: 120,
        y: 90,
      },
    },
  ]);
  assertNoDomInputVocabulary(facts);
});

function createOverlayHarness() {
  const { window } = new JSDOM("<!doctype html><body><div id='surface'></div></body>");
  const facts = [];
  const overlay = createOverlayAdapter({
    document: window.document,
    emitInteractionFact(fact) {
      facts.push(fact);
    },
  });
  const surface = window.document.getElementById("surface");
  overlay.bindInput(surface);
  return {
    window,
    surface,
    facts,
  };
}

function dispatchMouse(window, target, type, options) {
  return target.dispatchEvent(new window.MouseEvent(type, {
    ...options,
    bubbles: true,
    cancelable: true,
  }));
}

function dispatchPointer(window, target, type, options) {
  return dispatchMouse(window, target, type, options);
}

function dispatchWheel(window, target, modifiers = {}) {
  return target.dispatchEvent(new window.WheelEvent("wheel", {
    ...modifiers,
    deltaY: -100,
    clientX: 120,
    clientY: 90,
    bubbles: true,
    cancelable: true,
  }));
}

function isPlacementEditFact(fact) {
  return fact.kind === "placement-edit-requested";
}

function assertNoDomInputVocabulary(facts) {
  const serializedFacts = JSON.stringify(facts);

  assert.equal(serializedFacts.includes("overlay"), false);
  assert.equal(serializedFacts.includes("pointer"), false);
  assert.equal(serializedFacts.includes("keyboard"), false);
  assert.equal(serializedFacts.includes("wheel"), false);
  assert.equal(serializedFacts.includes("button"), false);
  assert.equal(serializedFacts.includes("deltaY"), false);
  assert.equal(serializedFacts.includes("dblclick"), false);
  assert.equal(serializedFacts.includes("click"), false);
}
