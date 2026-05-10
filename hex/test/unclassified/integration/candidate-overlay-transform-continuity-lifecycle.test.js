import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createBrowserHostHarness,
  createDurableStorageHarness,
  durableImageState,
  placement,
} from "./candidate-browser-harness.js";

// Unclassified: gesture implementation details are still candidate territory.
// The visible product behavior is not: moving/rotating/scaling the overlay is a
// committed user edit, survives mode changes, and is undoable as that edit.
test("candidate: committed overlay transform edit is durable and undoable", async () => {
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

// Unclassified: opacity may or may not join history, but placement continuity
// across Trace/Align is core user perception. The overlay should not jump just
// because editing controls are temporarily hidden.
test("candidate: mode switching preserves committed overlay placement", async () => {
  const committedPlacement = placement({
    x: 14,
    y: 28,
    scale: 1.2,
    rotationRad: 0.25,
  });
  const host = createBrowserHostHarness({
    durableStatePort: createDurableStorageHarness({
      durableState: durableImageState({
        mode: "align",
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
