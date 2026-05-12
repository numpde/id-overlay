import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Class-a: committed Align placement edits are durable, undoable overlay
// transforms. Move, rotate, and scale may originate from different gestures, but
// once committed they update placement, persist the session, and push exactly
// one scoped history record for that gesture.
test("committed Align placement edits update placement durably", () => {
  for (const { editKind, placement } of [
    {
      editKind: "move",
      placement: movedPlacement(),
    },
    {
      editKind: "rotate",
      placement: rotatedPlacement(),
    },
    {
      editKind: "scale",
      placement: scaledPlacement(),
    },
  ]) {
    const result = handleApplicationCommand({
      state: referenceImageLoadedState(),
      command: createApplicationCommand(
        APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
        placementEditPayload({ editKind, placement }),
      ),
    });

    const expectedState = referenceImageLoadedState({ placement });
    assert.deepEqual(result, {
      state: {
        ...expectedState,
        history: {
          past: [placementHistoryRecord({
            editKind,
            before: placementRevision({
              placement: null,
              solvedRegistration: null,
            }),
            after: placementRevision({
              placement,
              solvedRegistration: null,
            }),
          })],
          future: [],
        },
      },
      effects: [
        persistDurableStateEffect(referenceImageDurableState({ placement })),
      ],
    });
  }
});

// Class-a: committed placement is durable overlay state. Hydration must restore
// it into the visible session rather than treating placement as write-only
// storage.
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

// Class-a: committing the placement already in state is not a user-visible edit.
// Adapters may report a final pointer-up even when the transform did not change;
// the application must not emit persistence work for that duplicate commit.
test("unchanged placement edit is inert", () => {
  const state = referenceImageLoadedState({
    placement: movedPlacement(),
  });

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
      placementEditPayload({
        editKind: "move",
        placement: movedPlacement(),
      }),
    ),
  }), {
    state,
    effects: [],
  });
});

function movedPlacement() {
  return {
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0,
  };
}

function rotatedPlacement() {
  return {
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0.5,
  };
}

function scaledPlacement() {
  return {
    x: 80,
    y: 40,
    scale: 1.5,
    rotationRad: 0,
  };
}

function placementEditPayload({ editKind, placement }) {
  return {
    editKind,
    placement,
  };
}

function placementHistoryRecord({ editKind, before, after }) {
  return {
    kind: "overlay-placement-edit",
    editKind,
    before,
    after,
  };
}

function placementRevision({ placement, solvedRegistration }) {
  return {
    placement,
    solvedRegistration,
  };
}

function referenceImageLoadedState({ placement } = {}) {
  const session = normalizedReferenceImageSession();
  if (placement !== undefined) {
    session.placement = placement;
  }
  return {
    session,
  };
}

function referenceImageDurableState({ placement } = {}) {
  return {
    session: referenceImageLoadedState({ placement }).session,
  };
}

function normalizedReferenceImageSession() {
  return {
    mode: "align",
    referenceImage: {
      imageDataRef: "reference-image-data-1",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  };
}

function persistDurableStateEffect(durableState) {
  return {
    kind: "persist-durable-state",
    durableState,
  };
}
