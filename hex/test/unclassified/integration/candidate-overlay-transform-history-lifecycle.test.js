import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified candidate: overlay move/rotate/scale should probably be undoable, but this
// candidate also chooses a subtle mode posture: undoing a placement edit after a
// later Trace switch keeps Trace selected while changing placement. That is not
// a mere missing implementation; it conflicts with the current class-a snapshot
// replay law, where history records restore their durable before/after states.
// Promote only after deciding whether placement history is snapshot replay,
// semantic patch replay, or a mode-aware hybrid.
test("committed overlay transform edit is durable and undoable", async () => {
  const beforePlacement = placement({
    x: 10,
    y: 20,
    scale: 1,
    rotationRad: 0,
  });
  const afterPlacement = placement({
    x: 30,
    y: 50,
    scale: 1,
    rotationRad: 0,
  });
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      placement: beforePlacement,
    }),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "commit-placement-edit",
    editKind: "move",
    placement: afterPlacement,
  });
  await host.latestRender.dispatchCommand({
    kind: "select-mode",
    mode: "trace",
  });
  await host.latestRender.dispatchCommand({
    kind: "undo",
  });

  assert.deepEqual(host.latestRender.view.overlay.placement, beforePlacement);
  assert.deepEqual(host.latestRender.view.history.redo.label, "Move overlay");
  assert.deepEqual(storage.writes.at(-1), durableImageState({
    mode: "trace",
    placement: beforePlacement,
  }));
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

function durableImageState({
  mode,
  placement: placementData = undefined,
}) {
  const session = {
    mode,
    referenceImage: {
      imageDataRef: "data:image/png;base64,reference-image",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  };
  if (placementData !== undefined) {
    session.placement = placementData;
  }
  return {
    session,
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
