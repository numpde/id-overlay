import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createOverlayAdapter,
} from "../../../adapters/ui/overlay-adapter.js";

// Class-c: the overlay should render from view facts, not application state.
// The concrete DOM markers are adapter markup and may change.
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
