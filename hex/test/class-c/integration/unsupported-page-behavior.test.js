import test from "node:test";
import assert from "node:assert/strict";

import {
  startPageVisibleExtension,
} from "../../../bootstrap/page-visible-extension.js";

const SELECTOR = {
  overlay: "[data-id-overlay-reference-image]",
  panel: "[data-id-overlay-panel]",
};

// Class-c: the product must not show a usable overlay UI on unsupported pages,
// but "no panel at all" may be too strong if a minimal unsupported-page notice
// becomes the better UX. Keep this quarantined until that boundary is settled.
test("unsupported page does not mount product UI", async () => {
  const page = await startPageVisibleExtension({
    page: unsupportedPage(),
    durableState: null,
  });

  assert.equal(count(page.document, SELECTOR.panel), 0);
  assert.equal(count(page.document, SELECTOR.overlay), 0);
});

function count(document, selector) {
  return document.querySelectorAll(selector).length;
}

function unsupportedPage() {
  return {
    kind: "unsupported-page",
    url: "https://www.openstreetmap.org/",
  };
}
