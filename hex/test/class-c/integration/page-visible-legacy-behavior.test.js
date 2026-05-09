import test from "node:test";
import assert from "node:assert/strict";

import {
  startPageVisibleExtension,
} from "../../../bootstrap/page-visible-extension.js";

const SELECTOR = {
  overlay: "[data-id-overlay-reference-image]",
  overlaySurface: "[data-id-overlay-surface]",
  pin: "[data-id-overlay-pin]",
  primaryAction: "[data-id-overlay-primary-action]",
  status: "[data-id-overlay-status]",
  undo: "[data-id-overlay-history='undo']",
};

// Class-c: clear-pins-before-clear-image is a plausible legacy-compatible
// destructive-action ladder, but the main-button policy is still quarantined.
// Keep the page-visible behavior next to the lower-level class-c product tests.
test("page-visible primary action clears pins before clearing the image", async () => {
  const page = await startSupportedExtension({
    durableState: durableReferenceImageSession({
      mode: "align",
      pins: [firstPin(), secondPin()],
    }),
  });

  await page.user.click(SELECTOR.primaryAction);
  assert.match(textOf(page.document, SELECTOR.status), /clear pins/i);

  await page.user.click(SELECTOR.primaryAction);
  assert.equal(count(page.document, SELECTOR.overlay), 1);
  assert.equal(count(page.document, SELECTOR.pin), 0);
  assert.match(textOf(page.document, SELECTOR.status), /cleared.*pins/i);
});

// Class-c: direct overlay dragging is probably part of the desired product,
// but this couples three unsettled boundaries: the legacy shift-drag gesture,
// page-visible DOM transform evidence, and history tooltip copy. Keep it as
// quarantine pressure until placement editing and history replay are specified.
test("page-visible shift drag moves overlay and undo restores prior placement", async () => {
  const page = await startSupportedExtension({
    durableState: durableReferenceImageSession({
      mode: "align",
    }),
  });
  assert.equal(typeof page.user.drag, "function");
  const overlay = assertOne(page.document, SELECTOR.overlay);
  const before = overlay.getAttribute("style");

  await page.user.drag(SELECTOR.overlaySurface, {
    modifier: "shift",
    fromScreenPx: {
      x: 200,
      y: 160,
    },
    toScreenPx: {
      x: 260,
      y: 210,
    },
  });

  assert.notEqual(
    overlay.getAttribute("style"),
    before,
    "shift-drag should visibly change overlay placement",
  );
  assert.match(assertOne(page.document, SELECTOR.undo).title, /move overlay/i);

  await page.user.click(SELECTOR.undo);
  assert.equal(overlay.getAttribute("style"), before);
});

async function startSupportedExtension(options = {}) {
  return startPageVisibleExtension({
    page: {
      kind: "supported-map-editor-page",
      url: "https://www.openstreetmap.org/edit?editor=id#map=16/-1.24401/36.82412",
    },
    durableState: options.durableState ?? null,
    manifestResources: {
      kind: "web-accessible-resources-allowing-page-visible-bootstrap",
    },
  });
}

function count(document, selector) {
  return document.querySelectorAll(selector).length;
}

function textOf(document, selector) {
  return assertOne(document, selector).textContent.trim();
}

function assertOne(document, selector) {
  const nodes = [...document.querySelectorAll(selector)];
  assert.equal(nodes.length, 1, `expected exactly one ${selector}`);
  return nodes[0];
}

function durableReferenceImageSession({ mode, pins = [] }) {
  const session = {
    mode,
    referenceImage: {
      imageDataRef: "reference-image-data-1",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  };
  if (pins.length > 0) {
    session.registration = {
      pins,
    };
  }
  return {
    session,
  };
}

function firstPin() {
  return {
    id: 1,
    imagePx: {
      x: 320,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 36.84,
    },
  };
}

function secondPin() {
  return {
    id: 2,
    imagePx: {
      x: 520,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 38.84,
    },
  };
}
