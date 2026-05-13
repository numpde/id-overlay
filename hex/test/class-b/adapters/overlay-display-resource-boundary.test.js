import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createOverlayAdapter,
} from "../../../adapters/ui/overlay-adapter.js";

// Class-b: durable image refs are application data, while display image URLs
// are browser resources. The overlay adapter should render only the resolved
// display URL.
test("overlay adapter renders display image URL instead of durable imageDataRef", () => {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const overlay = createOverlayAdapter({
    document: window.document,
  });

  const root = overlay.render({
    visible: true,
    imageDataRef: "reference-image-data-1",
    displayImageUrl: "blob:https://www.openstreetmap.org/display-resource-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
    placement: null,
    opacity: 1,
    pins: [],
  });

  const image = root.querySelector("[data-overlay-image]");
  assert.equal(image.dataset.imageDataRef, "reference-image-data-1");
  assert.match(image.style.backgroundImage, /display-resource-1/);
  assert.doesNotMatch(image.style.backgroundImage, /reference-image-data-1/);
});
