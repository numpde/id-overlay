import test from "node:test";
import assert from "node:assert/strict";

import {
  OVERLAY_STYLE_ID,
  createOverlayStyleInjector,
} from "../../src/content/overlay/style-injector.js";
import { createDomEnvironment } from "../helpers/dom-env.js";

test("overlay style injector installs the overlay stylesheet once per document", () => {
  const env = createDomEnvironment();
  try {
    const styleInjector = createOverlayStyleInjector();

    styleInjector.ensureInstalled(env.document);
    styleInjector.ensureInstalled(env.document);

    const styles = env.document.querySelectorAll(`#${OVERLAY_STYLE_ID}`);
    assert.equal(styles.length, 1);
    assert.equal(styles[0].textContent.includes(".id-overlay-viewport"), true);
    assert.equal(styles[0].parentElement, env.document.head);
  } finally {
    env.cleanup();
  }
});

test("overlay style injector treats each document as a separate style scope", () => {
  const first = createDomEnvironment();
  const second = createDomEnvironment();
  try {
    const styleInjector = createOverlayStyleInjector({
      styleId: "test-overlay-style",
      styleText: ".test-overlay { display: block; }",
    });

    styleInjector.ensureInstalled(first.document);
    styleInjector.ensureInstalled(second.document);

    assert.equal(first.document.querySelectorAll("#test-overlay-style").length, 1);
    assert.equal(second.document.querySelectorAll("#test-overlay-style").length, 1);
    assert.equal(
      first.document.getElementById("test-overlay-style").textContent,
      ".test-overlay { display: block; }",
    );
  } finally {
    second.cleanup();
    first.cleanup();
  }
});
