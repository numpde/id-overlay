import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-c: destructive-confirmation expiry is a real UX need, but the current
// test assumes a concrete timer-port callback shape that the shell has not
// earned yet. Keep this as quarantined design pressure until confirmation
// timing is wired through the same runtime/effect boundary as status timing.
test("clear-image confirmation expires through a request-scoped timer port", async () => {
  const timer = createTimerHarness();
  const host = createBrowserHostHarness({
    durableStatePort: createDurableStorageHarness({
      durableState: durableImageState(),
    }).port,
    timerPort: timer.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  assert.equal(host.latestRender.view.primaryAction.label, "Clear image?");
  assert.deepEqual(timer.started, [{
    kind: "panel-intent-timeout",
    requestId: 1,
  }]);

  await timer.fireCurrent();

  assert.equal(host.latestRender.view.primaryAction.label, "Clear image");
  assert.equal(host.latestRender.view.overlay.visible, true);
});

function createBrowserHostHarness({
  durableStatePort,
  timerPort,
}) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    timerPort,
    latestRender: null,
    mountOwnedRoot(ownerId, root) {
      return {
        ...root,
        ownerId,
      };
    },
    renderApplicationView(render) {
      this.latestRender = render;
    },
    startRuntime(runtime) {
      return runtime;
    },
  };
}

function createDurableStorageHarness({ durableState }) {
  return {
    port: {
      async readDurableState() {
        return durableState;
      },
      async writeDurableState() {},
    },
  };
}

function durableImageState() {
  return {
    session: {
      mode: "align",
      referenceImage: {
        imageDataRef: "data:image/png;base64,reference-image",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
  };
}

function createTimerHarness() {
  const started = [];
  let currentCallback = null;
  return {
    started,
    async fireCurrent() {
      assert.equal(typeof currentCallback, "function");
      await currentCallback();
    },
    port: {
      startTimer({ kind, requestId, callback }) {
        started.push({
          kind,
          requestId,
        });
        currentCallback = callback;
      },
      cancelTimer() {},
    },
  };
}
