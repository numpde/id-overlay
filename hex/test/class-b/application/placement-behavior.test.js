import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import {
  movedPlacement,
  placementEditPayload,
  rotatedPlacement,
  scaledPlacement,
} from "./placement-fixtures.js";
import {
  durableStateChangedEffect,
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";

// Class-b, not class-a: move/rotate/scale are the likely committed placement
// vocabulary, but gesture taxonomy can still evolve. What is settled is the
// application boundary: a committed Align placement edit updates the visible
// session placement and emits exactly one durable-state change.
test("committed Align placement edits update placement and durability", () => {
  for (const { kind, placement } of [
    {
      kind: "move",
      placement: movedPlacement(),
    },
    {
      kind: "rotate",
      placement: rotatedPlacement(),
    },
    {
      kind: "scale",
      placement: scaledPlacement(),
    },
  ]) {
    const result = handleApplicationCommand({
      state: referenceImageLoadedState(),
      command: createApplicationCommand(
        APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
        placementEditPayload({ kind, placement }),
      ),
    });

    assert.deepEqual(result, {
      state: referenceImageLoadedState({ placement }),
      effects: [
        durableStateChangedEffect(referenceImageDurableState({ placement })),
      ],
    });
  }
});

// Class-b for the same reason: exact placement fields may move if the geometry
// model evolves, but durability is not optional. A persisted committed placement
// must hydrate back into the visible session instead of becoming a write-only
// storage fact.
test("durable committed placement hydrates into the session", () => {
  const durableState = referenceImageDurableState({
    placement: movedPlacement(),
  });

  assert.deepEqual(handleApplicationCommand({
    state: {},
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
      durableState,
    }),
  }), {
    state: referenceImageLoadedState({
      placement: movedPlacement(),
    }),
    effects: [],
  });
});

// Class-b, not class-a: equality details may grow if placement gains fields or
// tolerances, but duplicate commits are not user-visible edits. They must not
// create persistence work just because an adapter reports the final pointer-up.
test("unchanged placement edit is inert", () => {
  const state = referenceImageLoadedState({
    placement: movedPlacement(),
  });

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
      placementEditPayload({
        kind: "move",
        placement: movedPlacement(),
      }),
    ),
  }), {
    state,
    effects: [],
  });
});
