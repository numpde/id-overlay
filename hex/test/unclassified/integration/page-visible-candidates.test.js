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
