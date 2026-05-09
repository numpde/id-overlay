import test from "node:test";
import assert from "node:assert/strict";

import {
  applyPanelPosition,
  capturePanelPosition,
  clampPanelPosition,
} from "../../src/content/panel-position.js";
import { createDomEnvironment } from "../helpers/dom-env.js";

test("panel position captures finite panel coordinates", () => {
  const env = createDomEnvironment();
  try {
    const root = createPanelRoot(env.window, {
      left: 100,
      top: 50,
      width: 280,
      height: 200,
    });

    assert.deepEqual(capturePanelPosition({
      root,
      ownerWindow: env.window,
    }), {
      left: 100,
      top: 50,
    });
  } finally {
    env.cleanup();
  }
});

test("panel position clamps coordinates to the visible viewport", () => {
  const env = createDomEnvironment();
  try {
    const root = createPanelRoot(env.window, {
      left: 0,
      top: 0,
      width: 280,
      height: 200,
    });
    Object.defineProperty(env.window, "innerWidth", {
      configurable: true,
      value: 320,
    });
    Object.defineProperty(env.window, "innerHeight", {
      configurable: true,
      value: 240,
    });

    assert.deepEqual(clampPanelPosition({
      root,
      ownerWindow: env.window,
      position: {
        left: 900,
        top: 700,
      },
    }), {
      left: 32,
      top: 32,
    });
  } finally {
    env.cleanup();
  }
});

test("panel position applies explicit absolute positioning styles", () => {
  const env = createDomEnvironment();
  try {
    const root = env.document.createElement("section");

    applyPanelPosition(root, {
      left: 42,
      top: 24,
    });

    assert.equal(root.style.left, "42px");
    assert.equal(root.style.top, "24px");
    assert.equal(root.style.right, "auto");
    assert.equal(root.style.bottom, "auto");
  } finally {
    env.cleanup();
  }
});

function createPanelRoot(ownerWindow, rect) {
  const root = ownerWindow.document.createElement("section");
  root.getBoundingClientRect = () => ({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON() {
      return this;
    },
  });
  ownerWindow.document.body.append(root);
  return root;
}
