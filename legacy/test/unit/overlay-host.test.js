import test from "node:test";
import assert from "node:assert/strict";

import { createOverlayHost } from "../../src/content/overlay/host.js";
import { createDomEnvironment } from "../helpers/dom-env.js";

test("overlay host mounts, delegates style installation, and notifies mount changes", () => {
  const env = createDomEnvironment();
  try {
    const root = env.document.createElement("div");
    const firstMount = env.document.createElement("div");
    const secondMount = env.document.createElement("div");
    env.document.body.append(firstMount, secondMount);
    let nextMountElement = firstMount;
    const mountChanges = [];
    const renderCalls = [];
    const installedStyleDocuments = [];

    const host = createOverlayHost({
      root,
      getMountElement: () => nextMountElement,
      render: () => renderCalls.push(root.parentElement),
      onMountChange: (mountElement) => mountChanges.push(mountElement),
      frameTarget: {},
      styleInjector: {
        ensureInstalled(targetDocument) {
          installedStyleDocuments.push(targetDocument);
        },
      },
    });

    host.scheduleRender();
    nextMountElement = secondMount;
    host.scheduleRender();

    assert.deepEqual(installedStyleDocuments, [env.document, env.document]);
    assert.equal(renderCalls.length, 2);
    assert.deepEqual(renderCalls, [firstMount, secondMount]);
    assert.deepEqual(mountChanges, [firstMount, secondMount]);
    assert.equal(host.getMountElement(), secondMount);

    host.destroy();
    assert.equal(root.isConnected, false);
    assert.deepEqual(mountChanges, [firstMount, secondMount, null]);
  } finally {
    env.cleanup();
  }
});

test("overlay host coalesces scheduled renders and cancels pending work on destroy", () => {
  const env = createDomEnvironment();
  try {
    const root = env.document.createElement("div");
    const mount = env.document.createElement("div");
    env.document.body.append(mount);
    const frameTarget = createManualFrameTarget();
    let renderCount = 0;

    const host = createOverlayHost({
      root,
      getMountElement: () => mount,
      render: () => {
        renderCount += 1;
      },
      frameTarget,
    });

    host.scheduleRender();
    host.scheduleRender();
    assert.equal(frameTarget.pendingCount(), 1);

    frameTarget.flush();
    assert.equal(renderCount, 1);

    host.scheduleRender();
    host.destroy();
    frameTarget.flush();
    assert.equal(renderCount, 1);
    assert.equal(root.isConnected, false);
  } finally {
    env.cleanup();
  }
});

function createManualFrameTarget() {
  let nextHandle = 1;
  const callbacks = new Map();
  return {
    requestAnimationFrame(callback) {
      const handle = nextHandle;
      nextHandle += 1;
      callbacks.set(handle, callback);
      return handle;
    },
    cancelAnimationFrame(handle) {
      callbacks.delete(handle);
    },
    flush() {
      const pendingCallbacks = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pendingCallbacks) {
        callback();
      }
    },
    pendingCount() {
      return callbacks.size;
    },
  };
}
