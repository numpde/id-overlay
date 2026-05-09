import test from "node:test";
import assert from "node:assert/strict";

import { createOverlayInputHost } from "../../src/content/overlay/input-host.js";
import { createDomEnvironment } from "../helpers/dom-env.js";

test("overlay input host retargets mounted listeners without duplicates", () => {
  const env = createDomEnvironment({
    viewportHtml: '<div id="map-a"></div><div id="map-b"></div>',
  });
  try {
    const mapA = env.document.getElementById("map-a");
    const mapB = env.document.getElementById("map-b");
    let mountElement = mapA;
    let pointerMoveCount = 0;
    let wheelCount = 0;

    const host = createOverlayInputHost({
      getMountElement: () => mountElement,
      mountedHandlers: createMountedHandlers({
        handleMountedPointerMove() {
          pointerMoveCount += 1;
        },
        handleMountedWheel(event) {
          wheelCount += 1;
          event.preventDefault();
        },
      }),
      globalPointerHandlers: createGlobalPointerHandlers(),
    });

    host.syncMountedInputListeners();
    host.syncMountedInputListeners();
    mapA.dispatchEvent(createMouseEvent(env.window, "pointermove"));
    assert.equal(pointerMoveCount, 1);

    const wheelEvent = new env.window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
    });
    mapA.dispatchEvent(wheelEvent);
    assert.equal(wheelCount, 1);
    assert.equal(wheelEvent.defaultPrevented, true);

    mountElement = mapB;
    host.syncMountedInputListeners();
    mapA.dispatchEvent(createMouseEvent(env.window, "pointermove"));
    mapB.dispatchEvent(createMouseEvent(env.window, "pointermove"));
    assert.equal(pointerMoveCount, 2);

    host.destroy();
    mapB.dispatchEvent(createMouseEvent(env.window, "pointermove"));
    assert.equal(pointerMoveCount, 2);
  } finally {
    env.cleanup();
  }
});

test("overlay input host retargets global pointer listeners to the mount window", () => {
  const env = createDomEnvironment({
    viewportHtml: '<div id="map-a"></div><iframe id="map-frame"></iframe>',
  });
  try {
    const mapA = env.document.getElementById("map-a");
    const frame = env.document.getElementById("map-frame");
    frame.contentDocument.body.innerHTML = '<div id="map-b"></div>';
    const mapB = frame.contentDocument.getElementById("map-b");
    let mountElement = mapA;
    let pointerMoveCount = 0;

    const host = createOverlayInputHost({
      getMountElement: () => mountElement,
      mountedHandlers: createMountedHandlers(),
      globalPointerHandlers: createGlobalPointerHandlers({
        handleGlobalPointerMove() {
          pointerMoveCount += 1;
        },
      }),
      fallbackWindow: env.window,
    });

    host.syncGlobalPointerListeners(true);
    host.syncGlobalPointerListeners(true);
    env.window.dispatchEvent(createMouseEvent(env.window, "pointermove"));
    assert.equal(pointerMoveCount, 1);

    mountElement = mapB;
    host.syncGlobalPointerListeners(true);
    env.window.dispatchEvent(createMouseEvent(env.window, "pointermove"));
    frame.contentWindow.dispatchEvent(createMouseEvent(frame.contentWindow, "pointermove"));
    assert.equal(pointerMoveCount, 2);

    host.syncGlobalPointerListeners(false);
    frame.contentWindow.dispatchEvent(createMouseEvent(frame.contentWindow, "pointermove"));
    assert.equal(pointerMoveCount, 2);

    host.syncGlobalPointerListeners(true);
    host.destroy();
    frame.contentWindow.dispatchEvent(createMouseEvent(frame.contentWindow, "pointermove"));
    assert.equal(pointerMoveCount, 2);
  } finally {
    env.cleanup();
  }
});

test("overlay input host detaches global pointer listeners when no target is available", () => {
  const env = createDomEnvironment({
    viewportHtml: '<div id="map"></div>',
  });
  try {
    const map = env.document.getElementById("map");
    let mountElement = map;
    let pointerMoveCount = 0;

    const host = createOverlayInputHost({
      getMountElement: () => mountElement,
      mountedHandlers: createMountedHandlers(),
      globalPointerHandlers: createGlobalPointerHandlers({
        handleGlobalPointerMove() {
          pointerMoveCount += 1;
        },
      }),
      fallbackWindow: null,
    });

    host.syncGlobalPointerListeners(true);
    env.window.dispatchEvent(createMouseEvent(env.window, "pointermove"));
    assert.equal(pointerMoveCount, 1);

    mountElement = null;
    host.syncGlobalPointerListeners(true);
    env.window.dispatchEvent(createMouseEvent(env.window, "pointermove"));
    assert.equal(pointerMoveCount, 1);
  } finally {
    env.cleanup();
  }
});

function createMouseEvent(ownerWindow, type) {
  return new ownerWindow.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: 1,
    clientY: 2,
  });
}

function createMountedHandlers(overrides = {}) {
  return {
    handleMountedPointerMove() {},
    handleMountedPointerLeave() {},
    handleMountedPointerDown() {},
    handleMountedClick() {},
    handleMountedDoubleClick() {},
    handleMountedWheel() {},
    ...overrides,
  };
}

function createGlobalPointerHandlers(overrides = {}) {
  return {
    handleGlobalPointerMove() {},
    handleGlobalPointerUp() {},
    handleGlobalPointerCancel() {},
    ...overrides,
  };
}
