import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createOverlayAdapter,
} from "../../../adapters/ui/overlay-adapter.js";

// Class-b: raw pointer input is adapter-local. The application receives a
// plain interaction fact, not the DOM event.
test("overlay input adapter emits pointer facts only", () => {
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
  surface.dispatchEvent(new window.MouseEvent("pointerdown", {
    clientX: 120,
    clientY: 90,
    bubbles: true,
  }));

  assert.deepEqual(facts, [{
    kind: "overlay-pointer-down",
    screenPx: {
      x: 120,
      y: 90,
    },
    button: 0,
  }]);
});
