import test from "node:test";
import assert from "node:assert/strict";

import {
  startPageVisibleExtension,
} from "../../../bootstrap/page-visible-extension.js";

const SELECTOR = {
  overlaySurface: "[data-id-overlay-surface]",
  panel: "[data-id-overlay-panel]",
  pin: "[data-id-overlay-pin]",
};

// Unclassified: keyboard shortcuts were part of the efficient legacy workflow.
// Space temporarily lets the map receive gestures while aligning; P toggles a
// pin at the current pointer location without requiring a panel control.
test("page-visible keyboard shortcuts handle temporary pass-through and pin toggle", async () => {
  const page = await startSupportedExtension({
    durableState: durableReferenceImageSession({
      mode: "align",
    }),
  });
  assert.equal(typeof page.user.keyDown, "function");
  assert.equal(typeof page.user.keyUp, "function");
  assert.equal(typeof page.user.keyPress, "function");
  assert.equal(typeof page.user.movePointer, "function");

  await page.user.keyDown(" ");
  assert.equal(
    assertOne(page.document, SELECTOR.overlaySurface).dataset.interactionOwner,
    "map",
  );

  await page.user.keyUp(" ");
  assert.equal(
    assertOne(page.document, SELECTOR.overlaySurface).dataset.interactionOwner,
    "overlay",
  );

  await page.user.movePointer(SELECTOR.overlaySurface, {
    screenPx: {
      x: 320,
      y: 240,
    },
  });
  await page.user.keyPress("p");
  assert.equal(count(page.document, SELECTOR.pin), 1);
});

// Unclassified: bootstrap lifecycle should prevent duplicate panels on repeated
// injection. This belongs to the real browser shell once it exists, but the
// visible behavior is simple enough to name now.
test("page-visible bootstrap reinjection keeps one owned panel", async () => {
  const page = await startSupportedExtension();
  assert.equal(typeof page.bootstrap.reinject, "function");

  await page.bootstrap.reinject();
  await page.bootstrap.reinject();

  assert.equal(count(page.document, SELECTOR.panel), 1);
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

function assertOne(document, selector) {
  const nodes = [...document.querySelectorAll(selector)];
  assert.equal(nodes.length, 1, `expected exactly one ${selector}`);
  return nodes[0];
}

function durableReferenceImageSession({ mode }) {
  return {
    session: {
      mode,
      referenceImage: {
        imageDataRef: "reference-image-data-1",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
  };
}
