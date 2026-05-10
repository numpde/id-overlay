import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-c: adapter-level wheel containment is class-b, but this composed policy
// needs the not-yet-built interaction-fact dispatcher. Promote only when Align
// overlay gestures and Trace/native-map forwarding are routed through one shell
// boundary instead of separate DOM event paths.
test("Align contains overlay wheel gestures while Trace forwards them to the page", async () => {
  const alignHost = createBrowserHostHarness({
    durableStatePort: createDurableStorageHarness({
      durableState: durableImageState({
        mode: "align",
      }),
    }).port,
  });
  const traceHost = createBrowserHostHarness({
    durableStatePort: createDurableStorageHarness({
      durableState: durableImageState({
        mode: "trace",
      }),
    }).port,
  });

  await bootstrapBrowserExtension(alignHost);
  await bootstrapBrowserExtension(traceHost);
  await alignHost.dispatchOverlayGesture({
    kind: "overlay-rotate-wheel",
    deltaY: -100,
  });
  await traceHost.dispatchOverlayGesture({
    kind: "overlay-rotate-wheel",
    deltaY: -100,
  });

  assert.deepEqual(alignHost.forwardedGestures, []);
  assert.deepEqual(traceHost.forwardedGestures, [{
    kind: "overlay-rotate-wheel",
    deltaY: -100,
  }]);
});

// Class-c: no-session is native map. Even if a stale overlay emits a gesture
// fact, the shell should forward it rather than translating it into an overlay
// edit when no image session exists.
test("no-session overlay gestures pass through without extension edits", async () => {
  const host = createBrowserHostHarness({
    durableStatePort: createDurableStorageHarness({
      durableState: null,
    }).port,
  });

  await bootstrapBrowserExtension(host);
  await host.dispatchOverlayGesture({
    kind: "overlay-scale-wheel",
    deltaY: -100,
  });

  assert.deepEqual(host.forwardedGestures, [{
    kind: "overlay-scale-wheel",
    deltaY: -100,
  }]);
});

function createBrowserHostHarness({ durableStatePort }) {
  const forwardedGestures = [];
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    forwardedGestures,
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
    async dispatchOverlayGesture(gesture) {
      if (typeof this.handleInteractionFact !== "function") {
        throw new TypeError("browser shell did not expose interaction-fact dispatch");
      }
      await this.handleInteractionFact(gesture);
    },
    pageGesturePort: {
      async forward(gesture) {
        forwardedGestures.push(gesture);
      },
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

function durableImageState({ mode }) {
  return {
    session: {
      mode,
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
