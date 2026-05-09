import test from "node:test";
import assert from "node:assert/strict";

import {
  startPageVisibleExtension,
} from "../../../bootstrap/page-visible-extension.js";

// Unclassified candidate file: these tests describe visible extension behavior
// across bootstrap, UI adapters, page adapters, storage, clipboard, and manifest
// loading. They deliberately use a proposed bootstrap seam and DOM test handles;
// each scenario must be promoted, rewritten, split, or deleted before it becomes
// authoritative design evidence.

const SELECTOR = {
  panel: "[data-id-overlay-panel]",
  primaryAction: "[data-id-overlay-primary-action]",
  modeSwitch: "[data-id-overlay-mode-switch]",
  alignControl: "[data-id-overlay-mode='align']",
  traceControl: "[data-id-overlay-mode='trace']",
  overlay: "[data-id-overlay-reference-image]",
  overlaySurface: "[data-id-overlay-surface]",
  pin: "[data-id-overlay-pin]",
  status: "[data-id-overlay-status]",
  undo: "[data-id-overlay-history='undo']",
  redo: "[data-id-overlay-history='redo']",
  panelDragHandle: "[data-id-overlay-panel-drag-handle]",
};

// Unclassified candidate: empty durable state should visibly start in Paste /
// Trace posture with no overlay image. This is the first useful page milestone.
test("no-session panel shows Paste posture", async () => {
  const page = await startSupportedExtension({
    durableState: null,
  });

  assert.match(textOf(page.document, SELECTOR.primaryAction), /^Paste$/i);
  assert.equal(selectedMode(page.document), "trace");
  assert.equal(assertOne(page.document, SELECTOR.alignControl).disabled, true);
  assert.equal(count(page.document, SELECTOR.overlay), 0);
});

// Unclassified candidate: clicking the visible primary button should arm the
// paste flow. The exact status copy is provisional; the visible armed posture is
// the behavior under test.
test("clicking Paste arms paste flow visibly", async () => {
  const page = await startSupportedExtension();

  await page.user.click(SELECTOR.primaryAction);

  assert.equal(
    assertOne(page.document, SELECTOR.primaryAction).dataset.intent,
    "cancel-paste",
  );
  assert.match(textOf(page.document, SELECTOR.status), /paste/i);
});

// Unclassified candidate: an accepted image result should render an image
// overlay on the page, not merely update internal application state.
test("accepted image shows overlay", async () => {
  const page = await startSupportedExtension();

  await page.user.click(SELECTOR.primaryAction);
  await page.user.pasteImage(normalizedReferenceImage());

  const overlay = assertOne(page.document, SELECTOR.overlay);
  assert.equal(overlay.dataset.imageDataRef, "reference-image-data-1");
  assert.equal(overlay.hidden, false);
});

// Unclassified candidate: after image acceptance, the visible mode should move
// to Align/editing posture. This duplicates a class-a product law at the page
// boundary so adapter/bootstrap drift is caught later.
test("accepted image switches to visible Align posture", async () => {
  const page = await startSupportedExtension();

  await page.user.click(SELECTOR.primaryAction);
  await page.user.pasteImage(normalizedReferenceImage());

  assert.equal(selectedMode(page.document), "align");
  assert.equal(
    assertOne(page.document, SELECTOR.overlaySurface).dataset.interactionOwner,
    "overlay",
  );
  assert.equal(assertOne(page.document, SELECTOR.alignControl).disabled, false);
});

// Unclassified candidate: Trace should visibly return interaction ownership to
// the map while leaving the reference image present for tracing.
test("Trace mode makes page pass-through visible", async () => {
  const page = await startSupportedExtension({
    durableState: durableReferenceImageSession({
      mode: "align",
      pins: [firstPin()],
    }),
  });

  await page.user.selectMode("trace");

  assert.equal(count(page.document, SELECTOR.overlay), 1);
  assert.equal(count(page.document, SELECTOR.pin), 0);
  assert.equal(
    assertOne(page.document, SELECTOR.overlaySurface).dataset.interactionOwner,
    "map",
  );
});

// Unclassified candidate: Align should make the page underneath inert through
// the overlay. This protects the previously observed bug where map hover still
// reacted under the image.
test("Align mode makes map inert under overlay", async () => {
  const page = await startSupportedExtension({
    durableState: durableReferenceImageSession({
      mode: "align",
    }),
  });

  await page.user.hover(SELECTOR.overlaySurface, {
    screenPx: {
      x: 200,
      y: 160,
    },
  });

  assert.equal(page.hostMap.hoveredFeatureCount, 0);
  assert.equal(
    assertOne(page.document, SELECTOR.overlaySurface).dataset.interactionOwner,
    "overlay",
  );
});

// Unclassified candidate: clearing the image should be visible as overlay
// removal and return to Paste / Trace posture.
test("clear image removes overlay and returns to Paste posture", async () => {
  const page = await startSupportedExtension({
    durableState: durableReferenceImageSession({
      mode: "align",
    }),
  });

  await page.user.click(SELECTOR.primaryAction);
  await page.user.click(SELECTOR.primaryAction);

  assert.equal(count(page.document, SELECTOR.overlay), 0);
  assert.match(textOf(page.document, SELECTOR.primaryAction), /^Paste$/i);
  assert.equal(selectedMode(page.document), "trace");
});

// Unclassified candidate: registration pins are an Align affordance. They
// should render in Align and disappear in Trace without deleting the session.
test("pins render only in Align", async () => {
  const page = await startSupportedExtension({
    durableState: durableReferenceImageSession({
      mode: "align",
      pins: [firstPin(), secondPin()],
    }),
  });

  assert.equal(count(page.document, SELECTOR.pin), 2);

  await page.user.selectMode("trace");

  assert.equal(count(page.document, SELECTOR.pin), 0);
  assert.equal(count(page.document, SELECTOR.overlay), 1);
});

// Unclassified candidate: history controls should expose what will happen, not
// generic Undo/Redo labels. Exact wording is product copy and should be reviewed
// before promotion.
test("undo and redo controls render semantic labels", async () => {
  const page = await startSupportedExtension({
    durableState: durableReferenceImageSession({
      mode: "align",
    }),
  });

  await page.user.click(SELECTOR.primaryAction);
  await page.user.click(SELECTOR.primaryAction);

  assert.equal(assertOne(page.document, SELECTOR.undo).title, "Reload image");
  assert.notEqual(assertOne(page.document, SELECTOR.undo).title, "Undo");
  assert.equal(assertOne(page.document, SELECTOR.redo).disabled, true);

  await page.user.click(SELECTOR.undo);

  assert.equal(assertOne(page.document, SELECTOR.redo).title, "Remove image");
  assert.notEqual(assertOne(page.document, SELECTOR.redo).title, "Redo");
});

// Unclassified candidate: panel dragging is visible shell behavior. It may move
// the panel, but it must not emit product commands or change session state.
test("panel drag is visible but app-inert", async () => {
  const page = await startSupportedExtension();
  const panel = assertOne(page.document, SELECTOR.panel);
  const beforePosition = panel.getAttribute("style");

  await page.user.drag(SELECTOR.panelDragHandle, {
    fromScreenPx: {
      x: 20,
      y: 20,
    },
    toScreenPx: {
      x: 80,
      y: 60,
    },
  });

  assert.notEqual(panel.getAttribute("style"), beforePosition);
  assert.deepEqual(page.productCommands, []);
  assert.equal(count(page.document, SELECTOR.overlay), 0);
});

// Unclassified candidate: saved durable state should be visible after reload.
// This is the first page-visible proof that storage, hydration, and rendering
// are wired end to end.
test("reload restores visible durable session", async () => {
  const page = await startSupportedExtension({
    durableState: durableReferenceImageSession({
      mode: "align",
      pins: [firstPin()],
    }),
  });

  assert.equal(count(page.document, SELECTOR.overlay), 1);
  assert.equal(selectedMode(page.document), "align");
  assert.equal(count(page.document, SELECTOR.pin), 1);
});

// Unclassified candidate: empty storage on reload should not resurrect overlay
// state. This pairs with the durable restore test above.
test("reload with no durable state shows Paste", async () => {
  const page = await startSupportedExtension({
    durableState: null,
  });

  assert.equal(count(page.document, SELECTOR.overlay), 0);
  assert.match(textOf(page.document, SELECTOR.primaryAction), /^Paste$/i);
  assert.equal(selectedMode(page.document), "trace");
});

// Unclassified candidate: unsupported pages should not mount product UI that
// appears usable. A future promotion may choose a minimal unsupported notice
// instead, but it should not be the full overlay panel.
test("unsupported page does not mount product UI", async () => {
  const page = await startPageVisibleExtension({
    page: unsupportedPage(),
    durableState: null,
  });

  assert.equal(count(page.document, SELECTOR.panel), 0);
  assert.equal(count(page.document, SELECTOR.overlay), 0);
});

// Unclassified candidate: generated extension resources must allow content
// bootstrap to complete. This captures the practical page-load failure mode
// where dynamic imports are denied before any UI can mount.
test("manifest resources allow content bootstrap", async () => {
  const page = await startPageVisibleExtension({
    page: supportedMapEditorPage(),
    durableState: null,
    manifestResources: generatedManifestResources(),
  });

  assert.deepEqual(page.bootstrap.dynamicImportFailures, []);
  assert.equal(count(page.document, SELECTOR.panel), 1);
});

async function startSupportedExtension(options = {}) {
  return startPageVisibleExtension({
    page: supportedMapEditorPage(),
    durableState: options.durableState ?? null,
    manifestResources: options.manifestResources ?? generatedManifestResources(),
  });
}

function selectedMode(document) {
  return assertOne(document, SELECTOR.modeSwitch).dataset.selectedMode;
}

function count(document, selector) {
  return document.querySelectorAll(selector).length;
}

function assertOne(document, selector) {
  const nodes = [...document.querySelectorAll(selector)];
  assert.equal(nodes.length, 1, `expected exactly one ${selector}`);
  return nodes[0];
}

function textOf(document, selector) {
  return assertOne(document, selector).textContent.trim();
}

function supportedMapEditorPage() {
  return {
    kind: "supported-map-editor-page",
    url: "https://www.openstreetmap.org/edit?editor=id#map=16/-1.24401/36.82412",
    mapView: {
      zoom: 16,
      centerLatLon: {
        lat: -1.24401,
        lon: 36.82412,
      },
    },
  };
}

function unsupportedPage() {
  return {
    kind: "unsupported-page",
    url: "https://www.openstreetmap.org/",
  };
}

function normalizedReferenceImage() {
  return {
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

function durableReferenceImageSession({ mode, pins = [] }) {
  const session = {
    mode,
    referenceImage: normalizedReferenceImage(),
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

function generatedManifestResources() {
  return {
    kind: "generated-web-accessible-resources",
    resources: [
      "hex/adapters/extension/content-loader.js",
      "hex/adapters/ui/panel-adapter.js",
      "hex/bootstrap/runtime.js",
      "hex/adapters/ui/panel.css",
    ],
  };
}
