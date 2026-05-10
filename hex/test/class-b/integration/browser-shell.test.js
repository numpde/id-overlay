import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";

// Class-b, deliberately not class-a: the browser host harness is still
// provisional. The integration invariant is stable: repeated content bootstrap
// reuses one owned root/runtime instead of duplicating visible extension UI.
test("browser shell bootstrap is idempotent over one owned UI root", async () => {
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
  });

  const first = await bootstrapBrowserExtension(host);
  const second = await bootstrapBrowserExtension(host);

  assert.equal(host.countOwnedRoots("id-overlay"), 1);
  assert.equal(first.runtime, second.runtime);
});

// Class-b, deliberately not class-a: unsupported-page UI policy might later add
// a small notice. The stable boundary is that unsupported pages expose no usable
// overlay controls and start no product runtime work.
test("browser shell does not expose usable overlay UI on unsupported pages", async () => {
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "unsupported-page",
    },
  });

  const result = await bootstrapBrowserExtension(host);

  assert.equal(result.kind, "unsupported-page");
  assert.equal(host.countOwnedRoots("id-overlay"), 0);
  assert.equal(host.startedRuntimeCount, 0);
});

// Class-b, deliberately not class-a: the browser-shell composition path may
// grow as UI adapters come online. The stable integration claim is that startup
// crosses the port boundary once: durable storage is read by the shell, and the
// application is hydrated through its command interface rather than by bootstrap
// rebuilding product state.
test("browser shell hydrates the real application runtime from durable storage", async () => {
  const durableState = {
    session: {
      mode: "align",
      referenceImage: {
        imageDataRef: "reference-image-data-1",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
  };
  const storage = createDurableStorageHarness({
    durableState,
  });
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort: storage.port,
  });

  const result = await bootstrapBrowserExtension(host);

  assert.equal(storage.readCount, 1);
  assert.deepEqual(result.runtime.getState(), {
    session: durableState.session,
  });
});

// Class-b, deliberately not class-a: recovery from old extension storage is a
// browser-shell compatibility policy. The durable-state law still lives in the
// application, but the content bootstrap must not let one bad stored record make
// the extension invisible on the page.
test("browser shell starts with empty state when stored durable state is unsupported", async () => {
  const storage = createDurableStorageHarness({
    durableState: {
      session: {
        mode: "align",
        referenceImage: {
          imageDataRef: "reference-image-data-1",
        },
        staleLegacyField: true,
      },
    },
  });
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort: storage.port,
  });

  const result = await bootstrapBrowserExtension(host);

  assert.equal(host.countOwnedRoots("id-overlay"), 1);
  assert.deepEqual(result.runtime.getState(), {});
});

// Class-b, deliberately not class-a: clearing invalid startup storage is a
// browser-shell migration policy, not a product reducer rule. It prevents the
// same corrupt/legacy record from breaking every future page load.
test("browser shell clears unsupported durable state after startup recovery", async () => {
  const storage = createDurableStorageHarness({
    durableState: {
      session: {
        mode: "trace",
      },
    },
  });
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort: storage.port,
  });

  await bootstrapBrowserExtension(host);

  assert.deepEqual(storage.writes, [null]);
});

// Class-b, deliberately not class-a: the concrete persistence adapter may move
// closer to extension-specific code. The no-regret boundary is that persistence
// remains effect-driven; bootstrap wires the handler but does not decide what
// state is durable.
test("browser shell persists durable-state effects through the storage port", async () => {
  const durableState = {
    session: {
      mode: "align",
      referenceImage: {
        imageDataRef: "reference-image-data-1",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
  };
  const storage = createDurableStorageHarness({
    durableState,
  });
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort: storage.port,
  });

  const result = await bootstrapBrowserExtension(host);
  await result.runtime.dispatch(createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
    mode: "trace",
  }));

  assert.deepEqual(storage.writes, [{
    session: {
      ...durableState.session,
      mode: "trace",
    },
  }]);
});

// Class-b, deliberately not class-a: history semantics are application law
// elsewhere. The shell integration boundary is narrower: history commands from
// rendered controls re-render the visible overlay and persist the replayed
// durable projection.
test("browser shell re-renders and persists clear-image undo and redo", async () => {
  const referenceImage = normalizedReferenceImage();
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      referenceImage,
    }),
  });
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort: storage.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });

  assert.equal(host.latestRender.view.overlay.visible, false);
  assert.deepEqual(host.latestRender.view.history.undo, {
    enabled: true,
    label: "Reload image",
  });

  await host.latestRender.dispatchCommand({
    kind: "undo",
  });
  assert.equal(host.latestRender.view.overlay.visible, true);
  assert.deepEqual(host.latestRender.view.history.redo, {
    enabled: true,
    label: "Remove image",
  });

  await host.latestRender.dispatchCommand({
    kind: "redo",
  });
  assert.equal(host.latestRender.view.overlay.visible, false);
  assert.deepEqual(storage.writes, [
    null,
    durableImageState({
      mode: "align",
      referenceImage,
    }),
    null,
  ]);
});

// Class-b, deliberately not class-a: application mode laws are already
// authoritative. This integration boundary checks the browser shell composition:
// a rendered mode command must update visible overlay input posture and persist
// the same durable session projection.
test("browser shell mode switching hides and restores Align pins", async () => {
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      referenceImage: normalizedReferenceImage(),
      pins: [firstPin()],
    }),
  });
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
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
      referenceImage: normalizedReferenceImage(),
      pins: [firstPin()],
    }),
    durableImageState({
      mode: "align",
      referenceImage: normalizedReferenceImage(),
      pins: [firstPin()],
    }),
  ]);
});

// Class-b, deliberately not class-a: no-session mode inertness is class-a at the
// application boundary. The shell still needs this guard because disabled UI is
// advisory; stale or synthetic commands must not create hidden durable state.
test("browser shell keeps no-session Align selection inert", async () => {
  const storage = createDurableStorageHarness({
    durableState: null,
  });
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
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

// Class-b, deliberately not class-a: this is browser-shell lifecycle, not
// product state. The stable integration boundary is per-host isolation: two
// extension hosts must not share runtime state, roots, or storage writes through
// an accidental global singleton.
test("browser shell isolates separate hosts", async () => {
  const firstStorage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      referenceImage: normalizedReferenceImage(),
    }),
  });
  const secondStorage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      referenceImage: normalizedReferenceImage(),
    }),
  });
  const firstHost = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort: firstStorage.port,
  });
  const secondHost = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort: secondStorage.port,
  });

  const first = await bootstrapBrowserExtension(firstHost);
  const second = await bootstrapBrowserExtension(secondHost);
  await firstHost.latestRender.dispatchCommand({
    kind: "select-mode",
    mode: "trace",
  });

  assert.notEqual(first.runtime, second.runtime);
  assert.equal(firstHost.countOwnedRoots("id-overlay"), 1);
  assert.equal(secondHost.countOwnedRoots("id-overlay"), 1);
  assert.equal(firstHost.latestRender.view.mode, "trace");
  assert.equal(secondHost.latestRender.view.mode, "align");
  assert.deepEqual(firstStorage.writes, [durableImageState({
    mode: "trace",
    referenceImage: normalizedReferenceImage(),
  })]);
  assert.deepEqual(secondStorage.writes, []);
});

// Class-b, deliberately not class-a: the precise gesture implementation is
// adapter/runtime work. The shell-visible invariant is that committed placement
// remains the rendered placement when mode changes hide or restore editing UI.
test("browser shell preserves committed overlay placement across mode switches", async () => {
  const committedPlacement = placement({
    x: 14,
    y: 28,
    scale: 1.2,
    rotationRad: 0.25,
  });
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort: createDurableStorageHarness({
      durableState: durableImageState({
        mode: "align",
        referenceImage: normalizedReferenceImage(),
        placement: committedPlacement,
      }),
    }).port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "select-mode",
    mode: "trace",
  });
  assert.deepEqual(host.latestRender.view.overlay.placement, committedPlacement);

  await host.latestRender.dispatchCommand({
    kind: "select-mode",
    mode: "align",
  });
  assert.deepEqual(host.latestRender.view.overlay.placement, committedPlacement);
});

function createBrowserHostHarness({
  pageContext,
  durableStatePort = createDurableStorageHarness({ durableState: null }).port,
}) {
  const ownedRoots = new Map();
  return {
    pageContext,
    durableStatePort,
    latestRender: null,
    startedRuntimeCount: 0,
    mountOwnedRoot(ownerId, root) {
      ownedRoots.set(ownerId, root);
      return root;
    },
    countOwnedRoots(ownerId) {
      return ownedRoots.has(ownerId) ? 1 : 0;
    },
    renderApplicationView(render) {
      this.latestRender = render;
    },
    startRuntime(runtime) {
      this.startedRuntimeCount += 1;
      return runtime;
    },
  };
}

function durableImageState({
  mode,
  referenceImage,
  placement: placementData = undefined,
  pins,
}) {
  const session = {
    mode,
    referenceImage,
  };
  if (placementData !== undefined) {
    session.placement = placementData;
  }
  if (pins !== undefined) {
    session.registration = {
      pins,
    };
  }
  return {
    session: {
      ...session,
    },
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

function placement({
  x = 80,
  y = 40,
  scale = 1,
  rotationRad = 0,
} = {}) {
  return {
    x,
    y,
    scale,
    rotationRad,
  };
}

function createDurableStorageHarness({ durableState }) {
  const writes = [];
  let readCount = 0;
  return {
    get readCount() {
      return readCount;
    },
    writes,
    port: {
      async readDurableState() {
        readCount += 1;
        return durableState;
      },
      async writeDurableState(nextDurableState) {
        writes.push(nextDurableState);
      },
    },
  };
}
