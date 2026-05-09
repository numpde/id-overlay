import test from "node:test";
import assert from "node:assert/strict";

import {
  startPageVisibleExtension,
} from "../../../bootstrap/page-visible-extension.js";

const SELECTOR = {
  alignControl: "[data-id-overlay-mode='align']",
  modeSwitch: "[data-id-overlay-mode-switch]",
  overlay: "[data-id-overlay-reference-image]",
  overlaySurface: "[data-id-overlay-surface]",
  panel: "[data-id-overlay-panel]",
  panelDragHandle: "[data-id-overlay-panel-drag-handle]",
  pin: "[data-id-overlay-pin]",
  primaryAction: "[data-id-overlay-primary-action]",
  redo: "[data-id-overlay-history='redo']",
  status: "[data-id-overlay-status]",
  undo: "[data-id-overlay-history='undo']",
};

// Class-b, not class-a: mounting a visible panel is the first end-to-end page
// smoke signal, but the bootstrap harness and DOM test handles are still
// provisional integration seams.
test("bootstrap mounts one visible panel", async () => {
  const page = await startSupportedExtension();

  assert.equal(count(page.document, SELECTOR.panel), 1);
  assert.equal(assertOne(page.document, SELECTOR.panel).hidden, false);
});

// Class-b, not class-a: the no-session Paste / Trace posture is already a
// product law, but this checks that bootstrap and UI rendering expose it on the
// page through provisional DOM test handles.
test("no-session panel shows Paste posture", async () => {
  const page = await startSupportedExtension({
    durableState: null,
  });

  assert.match(textOf(page.document, SELECTOR.primaryAction), /^Paste$/i);
  assert.equal(selectedMode(page.document), "trace");
  assert.equal(assertOne(page.document, SELECTOR.alignControl).disabled, true);
  assert.equal(count(page.document, SELECTOR.overlay), 0);
});

// Class-b, not class-a: clicking Paste must visibly arm reference-image input,
// but the DOM intent marker and exact status text are page-harness vocabulary.
test("clicking Paste arms paste flow visibly", async () => {
  const page = await startSupportedExtension();

  await page.user.click(SELECTOR.primaryAction);

  assert.equal(
    assertOne(page.document, SELECTOR.primaryAction).dataset.intent,
    "cancel-paste",
  );
  assert.match(textOf(page.document, SELECTOR.status), /paste/i);
});

// Class-b, not class-a: accepted image data must become a visible overlay on
// the page, but the DOM attribute used to assert the image reference is adapter
// test vocabulary.
test("accepted image shows overlay", async () => {
  const page = await startSupportedExtension();

  await page.user.click(SELECTOR.primaryAction);
  await page.user.pasteImage(normalizedReferenceImage());

  const overlay = assertOne(page.document, SELECTOR.overlay);
  assert.equal(overlay.dataset.imageDataRef, "reference-image-data-1");
  assert.equal(overlay.hidden, false);
});

// Class-b, not class-a: accepted image should expose the loaded Align posture
// on the page. The interaction-owner marker is a page-adapter test handle, not
// a product-domain concept.
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

// Class-b, not class-a: Trace pass-through is a product law, but this page
// check uses provisional DOM handles to prove pins disappear and map ownership
// is visible without removing the reference image.
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

// Class-b, not class-a: Align must prevent map hover behavior through the
// overlay. This protects a real page-visible regression, but the host-map hover
// counter is intentionally a provisional page-adapter harness detail.
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

// Class-b, not class-a: clearing image is a product lifecycle law, but this
// verifies the page-visible result: no overlay and a returned Paste / Trace
// posture after the confirmation flow.
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

// Class-b, not class-a: registration pins are an Align affordance, but these
// assertions are page-rendering evidence through provisional pin DOM handles.
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

// Class-b, not class-a: history controls must tell the user what will happen,
// not merely say Undo/Redo. The exact copy here is useful product pressure but
// still reviewable UI text.
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

// Class-b, not class-a: panel drag is page chrome behavior. It should visibly
// move the panel without becoming a product command or creating session state,
// but the exact style assertion is UI-adapter harness detail.
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

// Class-b, not class-a: durable restore is an application law, but this checks
// the integrated page result after storage, hydration, bootstrap, and rendering
// have been wired together.
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

async function startSupportedExtension(options = {}) {
  return startPageVisibleExtension({
    page: supportedMapEditorPage(),
    durableState: options.durableState ?? null,
    manifestResources: options.manifestResources ?? generatedManifestResources(),
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

function selectedMode(document) {
  return assertOne(document, SELECTOR.modeSwitch).dataset.selectedMode;
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
