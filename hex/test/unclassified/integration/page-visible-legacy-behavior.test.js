import test from "node:test";
import assert from "node:assert/strict";

import {
  startPageVisibleExtension,
} from "../../../bootstrap/page-visible-extension.js";

const SELECTOR = {
  panel: "[data-id-overlay-panel]",
};

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
