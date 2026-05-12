import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createOverlayAdapter,
} from "../../../adapters/ui/overlay-adapter.js";

// Class-c: durable image refs must not be treated as browser-loadable URLs, but
// the display-resource port is not implemented yet. This test is intentionally
// quarantined until the shell resolves `imageDataRef` into a render-scoped
// display URL and the overlay adapter receives that URL as view data.
//
// Decision: keep. The principle is likely correct, but promoting this adapter
// expectation before the shell/resource lifecycle exists would leave a green
// adapter test with no real browser-resource ownership.
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
