import test from "node:test";
import assert from "node:assert/strict";

import {
  startPageVisibleExtension,
} from "../../../bootstrap/page-visible-extension.js";

const SELECTOR = {
  panel: "[data-id-overlay-panel]",
};

// Class-b, not class-a: mounting a visible panel is the first end-to-end page
// smoke signal, but the bootstrap harness and DOM test handles are still
// provisional integration seams.
test("bootstrap mounts one visible panel", async () => {
  const page = await startSupportedExtension();

  assert.equal(count(page.document, SELECTOR.panel), 1);
  assert.equal(assertOne(page.document, SELECTOR.panel).hidden, false);
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
