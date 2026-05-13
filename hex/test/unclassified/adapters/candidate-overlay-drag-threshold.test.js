import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createOverlayAdapter,
} from "../../../adapters/ui/overlay-adapter.js";

// Unclassified candidate: the legacy overlay used a small activation threshold
// so incidental pointer jitter did not become an overlay move. The exact pixel
// threshold is adapter policy, but "jitter is inert, deliberate drag edits" is
// user-facing interaction behavior.
test("overlay move drag starts only after deliberate pointer movement", () => {
  const { window } = new JSDOM("<!doctype html><body><div id='overlay'></div></body>");
  const overlaySurface = window.document.getElementById("overlay");
  const facts = [];
  const overlay = createOverlayAdapter({
    document: window.document,
    emitInteractionFact(fact) {
      facts.push(fact);
    },
  });
  overlay.bindInput(overlaySurface);

  dispatchPointer(window, overlaySurface, "pointerdown", {
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
});

function dispatchPointer(window, target, type, init) {
  target.dispatchEvent(new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
    ...init,
  }));
}

function isPlacementEditFact(fact) {
  return fact.kind === "placement-edit-requested";
}
