import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createOverlayAdapter,
} from "../../../adapters/ui/overlay-adapter.js";

// Class-b, deliberately not class-a: DOM tags, CSS serialization, and data
// markers are adapter-local handles. The stable boundary is narrower: overlay
// rendering consumes only view facts, never session-shaped product state.
test("overlay adapter renders from overlay view facts only", () => {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const overlay = createOverlayAdapter({
    document: window.document,
  });

  const root = overlay.render({
    visible: true,
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
    placement: {
      x: 80,
      y: 40,
      scale: 1.25,
      rotationRad: 0.1,
    },
    opacity: 0.5,
    pins: [{
      id: 1,
      imagePx: {
        x: 320,
        y: 240,
      },
    }],
  });

  assert.equal(root.querySelectorAll("[data-overlay-image]").length, 1);
  assert.equal(
    root.querySelector("[data-overlay-image]").dataset.imageDataRef,
    "reference-image-data-1",
  );
  assert.equal(root.querySelector("[data-overlay-image]").style.width, "640px");
  assert.equal(root.querySelector("[data-overlay-image]").style.height, "480px");
  assert.equal(root.querySelector("[data-overlay-image]").style.opacity, "0.5");
  assert.equal(
    root.querySelector("[data-overlay-image]").style.transform,
    "translate(80px, 40px) rotate(0.1rad) scale(1.25)",
  );
  assert.equal(root.querySelectorAll("[data-registration-pin]").length, 1);
  assert.equal(
    root.querySelector("[data-registration-pin]").dataset.pinId,
    "1",
  );
});
