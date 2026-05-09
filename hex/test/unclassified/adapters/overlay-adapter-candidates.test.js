import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createOverlayAdapter,
} from "../../../adapters/ui/overlay-adapter.js";

// Unclassified candidate: overlay DOM is a rendering of overlay view facts. It
// should not inspect application session shape directly.
test("overlay adapter renders from view model only", () => {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const overlay = createOverlayAdapter({
    document: window.document,
  });

  const root = overlay.render({
    referenceImage: {
      imageDataRef: "reference-image-data-1",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
    placement: {
      x: 80,
      y: 40,
      scale: 1.25,
      rotationRad: 0.1,
    },
    pins: [{
      id: 1,
      imagePx: {
        x: 320,
        y: 240,
      },
    }],
  });

  assert.equal(root.querySelectorAll("[data-overlay-image]").length, 1);
  assert.equal(root.querySelectorAll("[data-registration-pin]").length, 1);
  assert.equal(
    root.querySelector("[data-registration-pin]").getAttribute("data-pin-id"),
    "1",
  );
});

// Unclassified candidate: raw pointer data is adapter input. What crosses
// inward is a plain interaction fact, never the original DOM event.
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
