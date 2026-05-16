import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: the browser host harness is still
// provisional. The integration invariant is stable: repeated content bootstrap
// reuses one owned root/runtime instead of duplicating visible extension UI.
test("browser shell bootstrap is idempotent over one owned UI root", async () => {
  const trace = createShellTrace("browser shell bootstrap is idempotent over one owned UI root");
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
  });

  const first = await bootstrapBrowserExtension(host);
  const second = await bootstrapBrowserExtension(host);

  assert.equal(host.countOwnedRoots("id-overlay"), 1);
  assert.equal(first.runtime, second.runtime);
  trace.edge(flowEdge("source.browser-content-start", "sink.owned-root", {
    phase: "idempotent-bootstrap",
    terminal: "composition-result",
  }));
  trace.edge(flowEdge("source.browser-content-start", "sink.runtime-instance", {
    phase: "idempotent-bootstrap",
    terminal: "composition-result",
  }));
});

// Class-b, deliberately not class-a: unsupported-page UI policy might later add
// a small notice. The stable boundary is that unsupported pages expose no usable
// overlay controls and start no product runtime work.
test("browser shell does not expose usable overlay UI on unsupported pages", async () => {
  const trace = createShellTrace("browser shell does not expose usable overlay UI on unsupported pages");
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "unsupported-page",
    },
  });

  const result = await bootstrapBrowserExtension(host);

  assert.equal(result.kind, "unsupported-page");
  assert.equal(host.countOwnedRoots("id-overlay"), 0);
  assert.equal(host.startedRuntimeCount, 0);
  trace.edge(flowEdge("source.browser-content-start", "inert.unsupported-page", {
    phase: "unsupported-page",
    terminal: "composition-result",
  }));
});

// Class-b, deliberately not class-a: the browser-shell composition path may
// grow as UI adapters come online. The stable integration claim is that startup
// crosses the port boundary once: durable storage is read by the shell, and the
// application is hydrated through its command interface rather than by bootstrap
// rebuilding product state.
test("browser shell hydrates the real application runtime from durable storage", async () => {
  const trace = createShellTrace("browser shell hydrates the real application runtime from durable storage");
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
  traceShellHydration(trace, "supported-page-hydration");
});

// Class-b, deliberately not class-a: recovery from old extension storage is a
// browser-shell compatibility policy. The durable-state law still lives in the
// application, but the content bootstrap must not let one bad stored record make
// the extension invisible on the page.
test("browser shell starts with empty state when stored durable state is unsupported", async () => {
  const trace = createShellTrace("browser shell starts with empty state when stored durable state is unsupported");
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
  traceShellHydration(trace, "unsupported-storage-recovery");
});

// Class-b, deliberately not class-a: clearing invalid startup storage is a
// browser-shell migration policy, not a product reducer rule. It prevents the
// same corrupt/legacy record from breaking every future page load.
test("browser shell clears unsupported durable state after startup recovery", async () => {
  const trace = createShellTrace("browser shell clears unsupported durable state after startup recovery");
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
  traceShellHydration(trace, "unsupported-storage-cleared");
  traceShellPersist(trace, "unsupported-storage-cleared");
});

// Class-b, deliberately not class-a: history semantics are application law
// elsewhere. The shell integration boundary is narrower: history commands from
// rendered controls re-render the visible overlay and persist the replayed
// durable projection.
test("browser shell re-renders and persists clear-image undo and redo", async () => {
  const trace = createShellTrace("browser shell re-renders and persists clear-image undo and redo");
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
  traceShellHydration(trace, "clear-image-history");
  traceShellCommand(trace, "activate-primary-action", "clear-image-arm", false);
  traceShellCommand(trace, "activate-primary-action", "clear-image-confirm", true);
  traceShellCommand(trace, "undo", "undo-clear-image", true);
  traceShellCommand(trace, "redo", "redo-clear-image", true);
});

// Class-b, deliberately not class-a: application mode laws are already
// authoritative. This integration boundary checks the browser shell composition:
// a rendered mode command must update visible overlay input posture and persist
// the same durable session projection.
test("browser shell mode switching hides and restores Align pins", async () => {
  const trace = createShellTrace("browser shell mode switching hides and restores Align pins");
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
  traceShellHydration(trace, "mode-switching");
  traceShellCommand(trace, "select-mode", "trace", true);
  traceShellCommand(trace, "select-mode", "align", true);
});

// Class-b, deliberately not class-a: no-session mode inertness is class-a at the
// application boundary. The shell still needs this guard because disabled UI is
// advisory; stale or synthetic commands must not create hidden durable state.
test("browser shell keeps no-session Align selection inert", async () => {
  const trace = createShellTrace("browser shell keeps no-session Align selection inert");
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
  traceShellHydration(trace, "no-session-mode-inert");
  traceShellCommand(trace, "select-mode", "no-session-align", false);
});

// Class-b, deliberately not class-a: this is browser-shell lifecycle, not
// product state. The stable integration boundary is per-host isolation: two
// extension hosts must not share runtime state, roots, or storage writes through
// an accidental global singleton.
test("browser shell isolates separate hosts", async () => {
  const trace = createShellTrace("browser shell isolates separate hosts");
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
  traceShellHydration(trace, "first-host");
  traceShellHydration(trace, "second-host");
  traceShellCommand(trace, "select-mode", "first-host-trace", true);
});

// Class-b, deliberately not class-a: the precise gesture implementation is
// adapter/runtime work. The shell-visible invariant is that committed placement
// remains the rendered placement when mode changes hide or restore editing UI.
test("browser shell preserves committed overlay placement across mode switches", async () => {
  const trace = createShellTrace("browser shell preserves committed overlay placement across mode switches");
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
  traceShellHydration(trace, "committed-placement");
  traceShellCommand(trace, "select-mode", "trace", true);
  traceShellCommand(trace, "select-mode", "align", true);
});

// Class-b, deliberately not class-a: durable opacity/placement semantics are
// application laws elsewhere. The shell boundary here is that a fresh bootstrap
// from durable storage renders the same overlay facts without replaying any old
// interaction.
test("browser shell renders durable placement and opacity on fresh bootstrap", async () => {
  const trace = createShellTrace("browser shell renders durable placement and opacity on fresh bootstrap");
  const durableState = durableImageState({
    mode: "align",
    referenceImage: normalizedReferenceImage(),
    placement: placement({
      x: 80,
      y: 40,
      scale: 1,
      rotationRad: 0,
    }),
    opacity: 0.5,
  });
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort: createDurableStorageHarness({
      durableState,
    }).port,
  });

  await bootstrapBrowserExtension(host);

  assert.deepEqual(host.latestRender.view.overlay, {
    visible: true,
    imageDataRef: normalizedReferenceImage().imageDataRef,
    intrinsicSizePx: normalizedReferenceImage().intrinsicSizePx,
    placement: placement({
      x: 80,
      y: 40,
      scale: 1,
      rotationRad: 0,
    }),
    opacity: 0.5,
    pins: [],
  });
  traceShellHydration(trace, "durable-placement-opacity");
});

// Class-b: a locked Trace overlay is page-observed rendering. Once the session
// contains a solved map-world transform, live page snapshots must re-project
// and re-render the overlay without changing durable application state.
test("browser shell re-renders solved Trace overlay from live page snapshots without durable writes", async () => {
  const trace = createShellTrace(
    "browser shell re-renders solved Trace overlay from live page snapshots without durable writes",
  );
  const pageSnapshots = createPageSnapshotHarness({
    initialSnapshot: traceSnapshot(),
  });
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "trace",
      referenceImage: normalizedReferenceImage(),
      pins: [firstPin()],
      solvedTransform: solvedTransform(),
    }),
  });
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort: storage.port,
    pageSnapshotPort: pageSnapshots.port,
    projectTraceOverlayForPageSnapshot({ overlay, pageSnapshot }) {
      if (!overlay.pageProjectionSource || pageSnapshot.kind !== "supported-map-page") {
        return overlay;
      }
      const centerLon = pageSnapshot.mapView.centerLatLon.lon;
      return {
        ...overlay,
        placement: placement({
          x: 372 - centerLon,
          y: 272,
          scale: 1,
          rotationRad: 0,
        }),
        pageSurfaceMotion: pageSnapshot.surfaceMotion,
      };
    },
  });

  await bootstrapBrowserExtension(host);
  assert.deepEqual(host.latestRender.view.overlay.placement, placement({
    x: 372,
    y: 272,
    scale: 1,
    rotationRad: 0,
  }));

  pageSnapshots.publish(traceSnapshot({
    centerLon: 10,
    surfaceMotion: {
      transformCss: "matrix(1, 0, 0, 1, 18, -12)",
      transformOriginCss: "0px 0px",
    },
  }));

  assert.deepEqual(host.latestRender.view.overlay.placement, placement({
    x: 362,
    y: 272,
    scale: 1,
    rotationRad: 0,
  }));
  assert.deepEqual(host.latestRender.view.overlay.pageSurfaceMotion, {
    transformCss: "matrix(1, 0, 0, 1, 18, -12)",
    transformOriginCss: "0px 0px",
  });
  assert.deepEqual(storage.writes, []);
  traceShellHydration(trace, "solved-trace-overlay");
  trace.edge(flowEdge("port.page-snapshot.subscribe", "callback.live-map-snapshot", {
    phase: "map-surface-motion",
    provider: "page-snapshot-port",
  }));
  trace.edge(flowEdge("callback.live-map-snapshot", "sink.render", {
    phase: "map-surface-motion",
    terminal: "render-result",
  }));
});

// Class-b: old durable Trace placements used the same untagged shape as
// Align's screen placement. Hydration must not silently reinterpret those
// ambiguous facts as map-world coordinates; doing so can project the image far
// outside the viewport and make it effectively invisible.
test("browser shell hydrates untagged Trace placement as screen placement", async () => {
  const trace = createShellTrace("browser shell hydrates untagged Trace placement as screen placement");
  const legacyScreenPlacement = placement({
    x: 309.12078133205324,
    y: 250.6495347553391,
    scale: 0.5488116360940265,
    rotationRad: 0,
  });
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "trace",
      referenceImage: normalizedReferenceImage(),
      placement: legacyScreenPlacement,
    }),
  });
  const pageSnapshots = createPageSnapshotHarness({
    initialSnapshot: traceSnapshot({
      centerLon: 120.668,
    }),
  });
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort: storage.port,
    pageSnapshotPort: pageSnapshots.port,
  });

  await bootstrapBrowserExtension(host);

  assert.deepEqual(host.latestRender.view.overlay, {
    visible: true,
    imageDataRef: normalizedReferenceImage().imageDataRef,
    intrinsicSizePx: normalizedReferenceImage().intrinsicSizePx,
    placement: legacyScreenPlacement,
    opacity: 1,
    pins: [],
  });
  assert.deepEqual(storage.writes, []);
  traceShellHydration(trace, "legacy-untagged-trace-placement");
});

// Class-b: hand placement is screen-authored while Align is interactive, but
// Trace has a single map-locked placement contract. On the transition into
// Trace, the shell uses the live map snapshot to convert the visible placement
// into map-locked coordinates before persistence.
test("browser shell normalizes hand placement to map lock when entering Trace", async () => {
  const trace = createShellTrace("browser shell normalizes hand placement to map lock when entering Trace");
  const screenPlacement = placement({
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0,
    coordinateSpace: "screen",
  });
  const mapLockedPlacement = placement({
    x: -192,
    y: -32,
    scale: 1,
    rotationRad: 0,
    coordinateSpace: "map-world",
  });
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      referenceImage: normalizedReferenceImage(),
      placement: screenPlacement,
    }),
  });
  const pageSnapshots = createPageSnapshotHarness({
    initialSnapshot: traceSnapshot(),
  });
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort: storage.port,
    pageSnapshotPort: pageSnapshots.port,
  });

  const result = await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "select-mode",
    mode: "trace",
  });

  assert.deepEqual(result.runtime.getState().session.placement, mapLockedPlacement);
  assert.deepEqual(storage.writes.at(-1), durableImageState({
    mode: "trace",
    referenceImage: normalizedReferenceImage(),
    placement: mapLockedPlacement,
  }));
  traceShellCommand(trace, "select-mode", "hand-placement-map-lock", true);
  trace.edge(flowEdge("callback.live-map-snapshot", "command.select-mode", {
    phase: "hand-placement-map-lock",
    provider: "browser-shell",
  }));
});

// Class-b: Align is also map-locked. Entering Align with a hand/screen
// placement must convert through the current map snapshot rather than leaving
// the image fixed to the viewport.
test("browser shell normalizes hand placement to map lock when entering Align", async () => {
  const trace = createShellTrace("browser shell normalizes hand placement to map lock when entering Align");
  const screenPlacement = placement({
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0,
    coordinateSpace: "screen",
  });
  const mapLockedPlacement = placement({
    x: -192,
    y: -32,
    scale: 1,
    rotationRad: 0,
    coordinateSpace: "map-world",
  });
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "trace",
      referenceImage: normalizedReferenceImage(),
      placement: screenPlacement,
    }),
  });
  const pageSnapshots = createPageSnapshotHarness({
    initialSnapshot: traceSnapshot(),
  });
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort: storage.port,
    pageSnapshotPort: pageSnapshots.port,
  });

  const result = await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "select-mode",
    mode: "align",
  });

  assert.deepEqual(result.runtime.getState().session.placement, mapLockedPlacement);
  assert.deepEqual(storage.writes.at(-1), durableImageState({
    mode: "align",
    referenceImage: normalizedReferenceImage(),
    placement: mapLockedPlacement,
  }));
  traceShellCommand(trace, "select-mode", "align-hand-placement-map-lock", true);
  trace.edge(flowEdge("callback.live-map-snapshot", "command.select-mode", {
    phase: "align-hand-placement-map-lock",
    provider: "browser-shell",
  }));
});

// Class-b: Align is the editing posture, not a screen-coordinate escape hatch.
// A map-locked placement must stay map-locked when entering Align so the overlay
// continues to pan and zoom with the native map while becoming hand-editable.
test("browser shell preserves map-locked placement when entering Align", async () => {
  const trace = createShellTrace("browser shell preserves map-locked placement when entering Align");
  const mapLockedPlacement = placement({
    x: -492,
    y: -82,
    scale: 1,
    rotationRad: 0,
    coordinateSpace: "map-world",
  });
  const screenPlacement = placement({
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0,
    coordinateSpace: "screen",
  });
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "trace",
      referenceImage: normalizedReferenceImage(),
      placement: mapLockedPlacement,
    }),
  });
  const pageSnapshots = createPageSnapshotHarness({
    initialSnapshot: traceSnapshot({
      viewportScreenPx: {
        x: 300,
        y: 50,
      },
    }),
  });
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort: storage.port,
    pageSnapshotPort: pageSnapshots.port,
    projectTraceOverlayForPageSnapshot({ overlay, pageSnapshot }) {
      if (!overlay.pageProjectionSource || pageSnapshot.kind !== "supported-map-page") {
        return overlay;
      }
      return {
        ...overlay,
        placement: screenPlacement,
        viewport: {
          mode: "align",
          isPassThrough: false,
          rect: {
            left: 300,
            top: 50,
            width: 800,
            height: 400,
          },
        },
      };
    },
  });

  const result = await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "select-mode",
    mode: "align",
  });

  assert.deepEqual(result.runtime.getState().session.placement, mapLockedPlacement);
  assert.deepEqual(host.latestRender.view.overlay.placement, screenPlacement);
  assert.deepEqual(storage.writes.at(-1), durableImageState({
    mode: "align",
    referenceImage: normalizedReferenceImage(),
    placement: mapLockedPlacement,
  }));
  traceShellCommand(trace, "select-mode", "map-lock-preserved-for-align", true);
  trace.edge(flowEdge("callback.live-map-snapshot", "command.select-mode", {
    phase: "map-lock-preserved-for-align",
    provider: "browser-shell",
  }));
});

// Class-b: startup must also treat persisted Align map-world placement as a
// first-class state, not legacy damage. It renders through page projection and
// must not rewrite durable state merely to become editable.
test("browser shell renders hydrated Align map-locked placement without rewriting it", async () => {
  const trace = createShellTrace("browser shell renders hydrated Align map-locked placement without rewriting it");
  const mapLockedPlacement = placement({
    x: -492,
    y: -82,
    scale: 1,
    rotationRad: 0,
    coordinateSpace: "map-world",
  });
  const screenPlacement = placement({
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0,
  });
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      referenceImage: normalizedReferenceImage(),
      placement: mapLockedPlacement,
    }),
  });
  const pageSnapshots = createPageSnapshotHarness({
    initialSnapshot: traceSnapshot({
      viewportScreenPx: {
        x: 300,
        y: 50,
      },
    }),
  });
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort: storage.port,
    pageSnapshotPort: pageSnapshots.port,
    projectTraceOverlayForPageSnapshot({ overlay, pageSnapshot }) {
      if (!overlay.pageProjectionSource || pageSnapshot.kind !== "supported-map-page") {
        return overlay;
      }
      return {
        ...overlay,
        placement: screenPlacement,
        viewport: {
          mode: "align",
          isPassThrough: false,
          rect: {
            left: 300,
            top: 50,
            width: 800,
            height: 400,
          },
        },
      };
    },
  });

  const result = await bootstrapBrowserExtension(host);

  assert.deepEqual(result.runtime.getState().session.placement, mapLockedPlacement);
  assert.deepEqual(host.latestRender.view.overlay.placement, screenPlacement);
  assert.deepEqual(storage.writes, []);
  traceShellHydration(trace, "startup-align-map-lock-render");
});

// Class-b: startup is part of the same contract as mode changes. Persisted
// Align screen placement is recovered into map-world coordinates when a live
// map snapshot is available, then rendered through page projection.
test("browser shell normalizes hydrated Align screen placement to map lock", async () => {
  const trace = createShellTrace("browser shell normalizes hydrated Align screen placement to map lock");
  const screenPlacement = placement({
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0,
    coordinateSpace: "screen",
  });
  const mapLockedPlacement = placement({
    x: -192,
    y: -32,
    scale: 1,
    rotationRad: 0,
    coordinateSpace: "map-world",
  });
  const projectedPlacement = placement({
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0,
  });
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      referenceImage: normalizedReferenceImage(),
      placement: screenPlacement,
    }),
  });
  const pageSnapshots = createPageSnapshotHarness({
    initialSnapshot: traceSnapshot(),
  });
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort: storage.port,
    pageSnapshotPort: pageSnapshots.port,
    projectTraceOverlayForPageSnapshot({ overlay, pageSnapshot }) {
      if (!overlay.pageProjectionSource || pageSnapshot.kind !== "supported-map-page") {
        return overlay;
      }
      return {
        ...overlay,
        placement: projectedPlacement,
        viewport: {
          mode: "align",
          isPassThrough: false,
          rect: {
            left: 0,
            top: 0,
            width: 800,
            height: 400,
          },
        },
      };
    },
  });

  const result = await bootstrapBrowserExtension(host);

  assert.deepEqual(result.runtime.getState().session.placement, mapLockedPlacement);
  assert.deepEqual(host.latestRender.view.overlay.placement, projectedPlacement);
  assert.deepEqual(storage.writes, [
    durableImageState({
      mode: "align",
      referenceImage: normalizedReferenceImage(),
      placement: mapLockedPlacement,
    }),
  ]);
  traceShellHydration(trace, "startup-align-screen-map-lock");
  trace.edge(flowEdge("callback.live-map-snapshot", "command.startup-recovery", {
    phase: "startup-align-screen-map-lock",
    provider: "browser-shell",
  }));
  traceShellPersist(trace, "startup-align-screen-map-lock");
});

function createShellTrace(testName) {
  return createFlowTrace({
    file: import.meta.url,
    test: testName,
  });
}

function traceShellHydration(trace, phase) {
  trace.edge(flowEdge("source.browser-content-start", "port.durable-state.read", {
    phase,
    provider: "browser-shell",
  }));
  trace.edge(flowEdge("port.durable-state.read", "callback.durable-state-read", {
    phase,
    provider: "durable-state-port",
  }));
  trace.edge(flowEdge("callback.durable-state-read", "command.hydrate", {
    phase,
    provider: "browser-shell",
  }));
  trace.edge(flowEdge("command.hydrate", "sink.render", {
    phase,
    terminal: "render-result",
  }));
}

function traceShellCommand(trace, command, phase, persists) {
  const commandNode = `command.${command}`;
  trace.edge(flowEdge("source.rendered-command", commandNode, {
    phase,
    provider: "rendered-ui",
  }));
  trace.edge(flowEdge(commandNode, "sink.render", {
    phase,
    terminal: "render-result",
  }));
  if (!persists) {
    return;
  }
  trace.edge(flowEdge(commandNode, "effect.persist-durable-state", {
    phase,
    provider: "application-effect",
  }));
  trace.edge(flowEdge("effect.persist-durable-state", "port.durable-state.write", {
    phase,
    provider: "browser-shell",
  }));
  trace.edge(flowEdge("port.durable-state.write", "sink.durable-state.write", {
    phase,
    terminal: "storage-write",
  }));
}

function traceShellPersist(trace, phase) {
  trace.edge(flowEdge("source.browser-content-start", "command.startup-recovery", {
    phase,
    provider: "browser-shell",
  }));
  trace.edge(flowEdge("command.startup-recovery", "effect.persist-durable-state", {
    phase,
    provider: "startup-recovery",
  }));
  trace.edge(flowEdge("effect.persist-durable-state", "port.durable-state.write", {
    phase,
    provider: "browser-shell",
  }));
  trace.edge(flowEdge("port.durable-state.write", "sink.durable-state.write", {
    phase,
    terminal: "storage-write",
  }));
}

function createBrowserHostHarness({
  pageContext,
  durableStatePort = createDurableStorageHarness({ durableState: null }).port,
  pageSnapshotPort = undefined,
  projectTraceOverlayForPageSnapshot = undefined,
}) {
  const ownedRoots = new Map();
  return {
    pageContext,
    durableStatePort,
    pageSnapshotPort,
    projectTraceOverlayForPageSnapshot,
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
  opacity = undefined,
  pins,
  solvedTransform: solvedTransformData = undefined,
}) {
  const session = {
    mode,
    referenceImage,
  };
  if (placementData !== undefined) {
    session.placement = placementData;
  }
  if (opacity !== undefined) {
    session.opacity = opacity;
  }
  if (pins !== undefined) {
    session.registration = {
      pins,
    };
    if (solvedTransformData !== undefined) {
      session.registration.solvedTransform = solvedTransformData;
    }
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

function solvedTransform() {
  return {
    type: "image-to-map-world",
    a: 0.01,
    b: 0,
    tx: 100,
    ty: 200,
    scale: 0.01,
    rotationRad: 0,
    pinIds: [1],
  };
}

function placement({
  x = 80,
  y = 40,
  scale = 1,
  rotationRad = 0,
  coordinateSpace = undefined,
} = {}) {
  const value = {
    x,
    y,
    scale,
    rotationRad,
  };
  if (coordinateSpace !== undefined) {
    value.coordinateSpace = coordinateSpace;
  }
  return value;
}

function traceSnapshot({
  centerLon = 0,
  viewportScreenPx = {
    x: 0,
    y: 0,
  },
  surfaceMotion = {
    transformCss: "none",
    transformOriginCss: "0px 0px",
  },
} = {}) {
  return {
    kind: "supported-map-page",
    mapView: {
      zoom: 0,
      centerLatLon: {
        lat: 0,
        lon: centerLon,
      },
    },
    viewportPx: {
      width: 800,
      height: 400,
    },
    viewportScreenPx,
    surfaceMotion,
  };
}

function createPageSnapshotHarness({ initialSnapshot }) {
  let currentSnapshot = initialSnapshot;
  const listeners = new Set();
  return {
    publish(snapshot) {
      currentSnapshot = snapshot;
      for (const listener of listeners) {
        listener(snapshot);
      }
    },
    port: {
      readSnapshot() {
        return currentSnapshot;
      },
      subscribe(listener) {
        listeners.add(listener);
        listener(currentSnapshot);
        return () => {
          listeners.delete(listener);
        };
      },
    },
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
