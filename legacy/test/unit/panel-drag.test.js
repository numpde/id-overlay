import test from "node:test";
import assert from "node:assert/strict";

import { createPanelDragController } from "../../src/content/panel-drag.js";
import { createDomEnvironment } from "../helpers/dom-env.js";
import {
  createPointerEvent,
  installPointerEvents,
} from "../helpers/pointer-events.js";

test("panel drag controller moves and releases the panel", () => {
  const env = createDomEnvironment();
  try {
    installPointerEvents(env.window);
    const { root, handle } = createPanelElements(env.window);
    root.getBoundingClientRect = () => ({
      left: 100,
      top: 50,
      width: 280,
      height: 200,
      right: 380,
      bottom: 250,
      x: 100,
      y: 50,
      toJSON() {
        return this;
      },
    });

    const controller = createPanelDragController({
      root,
      handle,
      ownerWindow: env.window,
    });

    handle.dispatchEvent(createPointerEvent(env.window, "pointerdown", {
      button: 0,
      clientX: 120,
      clientY: 70,
    }));
    env.window.dispatchEvent(createPointerEvent(env.window, "pointermove", {
      clientX: 180,
      clientY: 140,
    }));

    assert.equal(root.classList.contains("id-overlay-panel--dragging"), true);
    assert.equal(root.style.left, "160px");
    assert.equal(root.style.top, "120px");

    env.window.dispatchEvent(createPointerEvent(env.window, "pointerup", {
      clientX: 180,
      clientY: 140,
    }));

    assert.equal(root.classList.contains("id-overlay-panel--dragging"), false);
    controller.destroy();
  } finally {
    env.cleanup();
  }
});

test("panel drag controller clamps position on resize", () => {
  const env = createDomEnvironment();
  try {
    const { root, handle } = createPanelElements(env.window);
    root.getBoundingClientRect = () => ({
      left: 900,
      top: 700,
      width: 280,
      height: 200,
      right: 1180,
      bottom: 900,
      x: 900,
      y: 700,
      toJSON() {
        return this;
      },
    });

    const controller = createPanelDragController({
      root,
      handle,
      ownerWindow: env.window,
    });

    Object.defineProperty(env.window, "innerWidth", {
      configurable: true,
      value: 320,
    });
    Object.defineProperty(env.window, "innerHeight", {
      configurable: true,
      value: 240,
    });
    env.window.dispatchEvent(new env.window.Event("resize"));

    assert.equal(root.style.left, "32px");
    assert.equal(root.style.top, "32px");
    controller.destroy();
  } finally {
    env.cleanup();
  }
});

test("panel drag controller destroy removes active listeners", () => {
  const env = createDomEnvironment();
  try {
    installPointerEvents(env.window);
    const { root, handle } = createPanelElements(env.window);
    root.getBoundingClientRect = () => ({
      left: 100,
      top: 50,
      width: 280,
      height: 200,
      right: 380,
      bottom: 250,
      x: 100,
      y: 50,
      toJSON() {
        return this;
      },
    });

    const controller = createPanelDragController({
      root,
      handle,
      ownerWindow: env.window,
    });

    handle.dispatchEvent(createPointerEvent(env.window, "pointerdown", {
      button: 0,
      clientX: 120,
      clientY: 70,
    }));
    controller.destroy();
    env.window.dispatchEvent(createPointerEvent(env.window, "pointermove", {
      clientX: 260,
      clientY: 180,
    }));

    assert.equal(root.classList.contains("id-overlay-panel--dragging"), false);
    assert.equal(root.style.left, "100px");
    assert.equal(root.style.top, "50px");
  } finally {
    env.cleanup();
  }
});

test("panel drag controller ignores interactive header descendants", () => {
  const env = createDomEnvironment();
  try {
    installPointerEvents(env.window);
    const { root, handle } = createPanelElements(env.window);
    const link = env.document.createElement("a");
    link.href = "https://example.test";
    handle.append(link);
    root.getBoundingClientRect = () => ({
      left: 100,
      top: 50,
      width: 280,
      height: 200,
      right: 380,
      bottom: 250,
      x: 100,
      y: 50,
      toJSON() {
        return this;
      },
    });

    const controller = createPanelDragController({
      root,
      handle,
      ownerWindow: env.window,
    });

    link.dispatchEvent(createPointerEvent(env.window, "pointerdown", {
      button: 0,
      clientX: 120,
      clientY: 70,
    }));
    env.window.dispatchEvent(createPointerEvent(env.window, "pointermove", {
      clientX: 180,
      clientY: 140,
    }));

    assert.equal(root.classList.contains("id-overlay-panel--dragging"), false);
    assert.equal(root.style.left, "100px");
    assert.equal(root.style.top, "50px");
    controller.destroy();
  } finally {
    env.cleanup();
  }
});

test("panel drag controller ignores secondary pointer starts", () => {
  const env = createDomEnvironment();
  try {
    installPointerEvents(env.window);
    const { root, handle } = createPanelElements(env.window);
    root.getBoundingClientRect = () => ({
      left: 100,
      top: 50,
      width: 280,
      height: 200,
      right: 380,
      bottom: 250,
      x: 100,
      y: 50,
      toJSON() {
        return this;
      },
    });

    const controller = createPanelDragController({
      root,
      handle,
      ownerWindow: env.window,
    });

    handle.dispatchEvent(createPointerEvent(env.window, "pointerdown", {
      button: 2,
      clientX: 120,
      clientY: 70,
    }));
    env.window.dispatchEvent(createPointerEvent(env.window, "pointermove", {
      clientX: 180,
      clientY: 140,
    }));

    assert.equal(root.classList.contains("id-overlay-panel--dragging"), false);
    assert.equal(root.style.left, "100px");
    assert.equal(root.style.top, "50px");
    controller.destroy();
  } finally {
    env.cleanup();
  }
});

function createPanelElements(ownerWindow) {
  const root = ownerWindow.document.createElement("section");
  const handle = ownerWindow.document.createElement("div");
  root.append(handle);
  ownerWindow.document.body.append(root);
  return {
    root,
    handle,
  };
}
