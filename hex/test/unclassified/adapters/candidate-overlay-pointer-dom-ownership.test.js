import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createOverlayAdapter,
} from "../../../adapters/ui/overlay-adapter.js";

// Unclassified candidate: legacy Align overlay clicks owned the browser click
// sequence even when the gesture did not become a pin toggle or placement edit.
// This is user-visible map containment, but the final input-router API should
// decide where DOM consumption lives.
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
  assert.deepEqual(facts.filter(isProductEditFact), []);
});

function isProductEditFact(fact) {
  return [
    "placement-edit-requested",
    "registration-pin-toggle-requested",
    "opacity-adjustment-requested",
  ].includes(fact.kind);
}
