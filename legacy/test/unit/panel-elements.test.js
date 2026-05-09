import test from "node:test";
import assert from "node:assert/strict";

import { createPanelElements } from "../../src/content/panel-elements.js";
import { createDomEnvironment } from "../helpers/dom-env.js";

test("panel element factory builds the static panel shell", () => {
  const env = createDomEnvironment();
  try {
    const elements = createPanelElements({
      ownerDocument: env.document,
      buildLabel: "built test",
    });

    assert.equal(elements.root.className, "id-overlay-panel");
    assert.equal(elements.root.dataset.idOverlayOwned, "true");
    assert.equal(elements.root.querySelector(".id-overlay-panel__title").textContent, "Reference Overlay");
    assert.equal(elements.root.querySelector(".id-overlay-panel__meta").textContent, "built test");
    assert.equal(elements.repoLink.getAttribute("href"), "https://github.com/numpde/id-overlay");
    assert.equal(elements.repoLink.getAttribute("aria-label"), "Open id-overlay on GitHub");
    assert.ok(elements.repoLink.querySelector(".id-overlay-panel__repo-icon"));
    assert.equal(elements.opacityInput.type, "range");
    assert.equal(elements.opacityInput.min, "0");
    assert.equal(elements.opacityInput.max, "1");
    assert.equal(elements.opacityInput.step, "0.01");
    assert.equal(elements.modeInput.type, "checkbox");
    assert.equal(elements.undoButton.textContent, "↶");
    assert.equal(elements.redoButton.textContent, "↷");
    assert.equal(elements.statusElement.tabIndex, 0);
  } finally {
    env.cleanup();
  }
});
