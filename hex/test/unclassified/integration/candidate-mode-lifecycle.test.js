import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified: app-level mode laws are already class-a. This candidate checks
// the composed browser shell: panel-selected mode changes must re-render the
// visible interaction posture and persist the durable session together.
test("candidate: mode switching hides and restores Align pins through shell render and storage", async () => {
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      pins: [firstPin()],
    }),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
  });

  await bootstrapBrowserExtension(host);
  assert.deepEqual(host.latestRender.view.overlayInput, {
    kind: "overlay-editing",
    canEditOverlay: true,
    arePinsVisible: true,
  });
  assert.deepEqual(host.latestRender.view.overlay.pins, [firstPin()]);

  await host.latestRender.dispatchCommand({
    kind: "select-mode",
    mode: "trace",
  });
  assert.deepEqual(host.latestRender.view.overlayInput, {
    kind: "native-map",
    canEditOverlay: false,
    arePinsVisible: false,
  });
  assert.deepEqual(host.latestRender.view.overlay.pins, []);

  await host.latestRender.dispatchCommand({
    kind: "select-mode",
    mode: "align",
  });
  assert.deepEqual(host.latestRender.view.overlayInput, {
    kind: "overlay-editing",
    canEditOverlay: true,
    arePinsVisible: true,
  });
  assert.deepEqual(host.latestRender.view.overlay.pins, [firstPin()]);

  assert.deepEqual(storage.writes, [
    durableImageState({
      mode: "trace",
      pins: [firstPin()],
    }),
    durableImageState({
      mode: "align",
      pins: [firstPin()],
    }),
  ]);
});

// Unclassified: no-session Trace is already a class-a view law. This composed
// check keeps the shell honest: a disabled Align affordance must not turn into a
// hidden durable mode change if a stale command reaches bootstrap.
test("candidate: no-session Align selection stays inert through shell dispatch", async () => {
  const storage = createDurableStorageHarness({
    durableState: null,
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
  });

  const result = await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "select-mode",
    mode: "align",
  });

  assert.deepEqual(result.runtime.getState(), {});
  assert.equal(host.latestRender.view.mode, "trace");
  assert.equal(host.latestRender.view.modeSwitch.align.enabled, false);
  assert.deepEqual(storage.writes, []);
});

function createBrowserHostHarness({ durableStatePort }) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
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
  const writes = [];
  return {
    writes,
    port: {
      async readDurableState() {
        return durableState;
      },
      async writeDurableState(nextDurableState) {
        writes.push(nextDurableState);
      },
    },
  };
}

function durableImageState({ mode, pins }) {
  const session = {
    mode,
    referenceImage: normalizedReferenceImage(),
  };
  if (pins !== undefined) {
    session.registration = {
      pins,
    };
  }
  return {
    session,
  };
}

function normalizedReferenceImage() {
  return {
    imageDataRef: "data:image/png;base64,reference-image",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

function firstPin() {
  return {
    id: 1,
    imagePx: {
      x: 320,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 36.84,
    },
  };
}
