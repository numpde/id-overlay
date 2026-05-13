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
// the application must not emit persistence work or manufacture history for
// that duplicate commit.
test("unchanged placement edit is inert", () => {
  const state = {
    ...referenceImageLoadedState({
      placement: movedPlacement(),
    }),
    history: {
      past: [placementHistoryRecord({
        editKind: "move",
        before: placementRevision({
          placement: null,
          solvedRegistration: null,
        }),
        after: placementRevision({
          placement: movedPlacement(),
          solvedRegistration: null,
        }),
      })],
      future: [],
    },
  };

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

// Class-a: a manual placement commit supersedes any solved-registration claim.
// The visible placement is preserved as the user's direct edit, while pins stay
// available for a future fit and the history record keeps enough before-data to
// undo without treating stale solved metadata as current truth.
test("manual placement edits invalidate solved placement metadata", () => {
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({
      placement: solvedPlacement(),
      pins: [firstPin(), secondPin()],
      solvedPlacement: solvedPlacement(),
    }),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
      placementEditPayload({
        editKind: "move",
        placement: movedPlacement(),
      }),
    ),
  });

  assert.deepEqual(result, {
    state: {
      session: {
        ...normalizedReferenceImageSession(),
        placement: movedPlacement(),
        registration: {
          pins: [firstPin(), secondPin()],
        },
      },
      history: {
        past: [placementHistoryRecord({
          editKind: "move",
          before: placementRevision({
            placement: solvedPlacement(),
            solvedRegistration: {
              pinIds: [1, 2],
              placement: solvedPlacement(),
            },
          }),
          after: placementRevision({
            placement: movedPlacement(),
            solvedRegistration: null,
          }),
        })],
        future: [],
      },
    },
    effects: [
      persistDurableStateEffect({
        session: result.state.session,
      }),
    ],
  });
});

// Class-a: placement undo/redo is a semantic placement revision, not whole
// session snapshot replay. Legacy preserves the user's current Align/Trace
// posture while restoring the prior overlay transform and solved-registration
// metadata.
test("placement undo and redo preserve the current mode", () => {
  const record = placementHistoryRecord({
    editKind: "move",
    before: placementRevision({
      placement: originalPlacement(),
      solvedRegistration: null,
    }),
    after: placementRevision({
      placement: movedPlacement(),
      solvedRegistration: null,
    }),
  });
  const undoResult = handleApplicationCommand({
    state: {
      ...referenceImageLoadedState({
        mode: "trace",
        placement: movedPlacement(),
      }),
      history: {
        past: [record],
        future: [],
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
  });

  assert.deepEqual(undoResult, {
    state: {
      ...referenceImageLoadedState({
        mode: "trace",
        placement: originalPlacement(),
      }),
      history: {
        past: [],
        future: [record],
      },
    },
    effects: [
      persistDurableStateEffect(referenceImageDurableState({
        mode: "trace",
        placement: originalPlacement(),
      })),
    ],
  });

  assert.deepEqual(handleApplicationCommand({
    state: undoResult.state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.REDO),
  }), {
    state: {
      ...referenceImageLoadedState({
        mode: "trace",
        placement: movedPlacement(),
      }),
      history: {
        past: [record],
        future: [],
      },
    },
    effects: [
      persistDurableStateEffect(referenceImageDurableState({
        mode: "trace",
        placement: movedPlacement(),
      })),
    ],
  });
});

function originalPlacement() {
  return {
    x: 10,
    y: 20,
    scale: 1,
    rotationRad: 0,
  };
}

function movedPlacement() {
  return {
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0,
  };
}

function solvedPlacement() {
  return {
    x: 100,
    y: 200,
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

function referenceImageLoadedState({
  mode = "align",
  placement,
  pins,
  solvedPlacement: solvedPlacementData,
} = {}) {
  const session = normalizedReferenceImageSession({ mode });
  if (placement !== undefined) {
    session.placement = placement;
  }
  if (pins !== undefined) {
    session.registration = {
      pins,
    };
    if (solvedPlacementData !== undefined) {
      session.registration.solvedPlacement = solvedPlacementData;
    }
  }
  return {
    session,
  };
}

function referenceImageDurableState({ mode = "align", placement } = {}) {
  return {
    session: referenceImageLoadedState({ mode, placement }).session,
  };
}

function normalizedReferenceImageSession({ mode = "align" } = {}) {
  return {
    mode,
    referenceImage: {
      imageDataRef: "reference-image-data-1",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
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

function secondPin() {
  return {
    id: 2,
    imagePx: {
      x: 520,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 38.84,
    },
  };
}

function persistDurableStateEffect(durableState) {
  return {
    kind: "persist-durable-state",
    durableState,
  };
}
