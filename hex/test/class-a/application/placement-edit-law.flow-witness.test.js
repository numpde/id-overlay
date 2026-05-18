import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-a: committed Align placement edits are durable, undoable overlay
// transforms. Move, rotate, and scale may originate from different gestures, but
// once committed they update placement, persist the session, and push exactly
// one scoped history record for that gesture.
test("committed Align placement edits update placement durably", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "committed Align placement edits update placement durably",
  });
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
    const command = createApplicationCommand(
      APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
      placementEditPayload({ editKind, placement }),
    );
    const result = handleApplicationCommand({
      state: referenceImageLoadedState(),
      command,
    });
    traceApplicationResult({
      trace,
      command,
      result,
      phase: editKind,
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
        notice: {
          kind: "placement-changed",
          editKind,
        },
      },
      effects: [
        persistDurableStateEffect(referenceImageDurableState({ placement })),
      ],
    });
  }
  assert.deepEqual(trace.edges, [
    ...placementEditEdges({ phase: "move" }),
    ...placementEditEdges({ phase: "rotate" }),
    ...placementEditEdges({ phase: "scale" }),
  ]);
});

// Class-a: committed placement is durable overlay state. Hydration must restore
// it into the visible session rather than treating placement as write-only
// storage.
test("durable committed placement hydrates into the session", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "durable committed placement hydrates into the session",
  });
  const durableState = referenceImageDurableState({
    placement: movedPlacement(),
  });
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState,
  });
  const result = handleApplicationCommand({
    state: {},
    command,
  });
  traceApplicationResult({ trace, command, result });

  assert.deepEqual(result, {
    state: referenceImageLoadedState({
      placement: movedPlacement(),
    }),
    effects: [],
  });
  assert.deepEqual(trace.edges, [
    flowEdge("command.hydrate", "sink.application-state", {
      terminal: "state-result",
    }),
    flowEdge("command.hydrate", "inert.no-effects", {
      terminal: "intentionally-inert",
    }),
  ]);
});

// Class-a: committing the placement already in state is not a user-visible edit.
// Adapters may report a final pointer-up even when the transform did not change;
// the application must not emit persistence work or manufacture history for
// that duplicate commit.
test("unchanged placement edit is inert", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "unchanged placement edit is inert",
  });
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
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
    placementEditPayload({
      editKind: "move",
      placement: movedPlacement(),
    }),
  );
  const result = handleApplicationCommand({
    state,
    command,
  });
  traceApplicationResult({ trace, command, result });

  assert.deepEqual(result, {
    state,
    effects: [],
  });
  assert.deepEqual(trace.edges, [
    flowEdge("command.commit-placement-edit", "sink.application-state", {
      terminal: "state-result",
    }),
    flowEdge("command.commit-placement-edit", "inert.no-effects", {
      terminal: "intentionally-inert",
    }),
  ]);
});

// Class-a: a manual placement commit supersedes any solved-registration claim.
// The visible placement is preserved as the user's direct edit, while pins stay
// available for a future fit and the history record keeps enough before-data to
// undo without treating stale solved metadata as current truth.
test("manual placement edits invalidate solved placement metadata", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "manual placement edits invalidate solved placement metadata",
  });
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
    placementEditPayload({
      editKind: "move",
      placement: movedPlacement(),
    }),
  );
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({
      placement: solvedPlacement(),
      pins: [firstPin(), secondPin()],
      solvedPlacement: solvedPlacement(),
    }),
    command,
  });
  traceApplicationResult({ trace, command, result });

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
      notice: {
        kind: "placement-changed",
        editKind: "move",
      },
    },
    effects: [
      persistDurableStateEffect({
        session: result.state.session,
      }),
    ],
  });
  assert.deepEqual(trace.edges, placementEditEdges());
});

// Class-a: centering the overlay in the current view is a product placement
// edit once the shell supplies a concrete placement. It must be durable,
// undoable, and clear stale solved-registration metadata just like direct hand
// placement.
test("center overlay in view commits supplied placement durably and undoably", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "center overlay in view commits supplied placement durably and undoably",
  });
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.CENTER_OVERLAY_IN_VIEW,
    {
      placement: scaledPlacement(),
    },
  );
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({
      placement: solvedPlacement(),
      pins: [firstPin(), secondPin()],
      solvedPlacement: solvedPlacement(),
    }),
    command,
  });
  traceApplicationResult({ trace, command, result });

  assert.deepEqual(result, {
    state: {
      session: {
        ...normalizedReferenceImageSession(),
        placement: scaledPlacement(),
        registration: {
          pins: [firstPin(), secondPin()],
        },
      },
      history: {
        past: [placementHistoryRecord({
          editKind: "center-overlay",
          before: placementRevision({
            placement: solvedPlacement(),
            solvedRegistration: {
              pinIds: [1, 2],
              placement: solvedPlacement(),
            },
          }),
          after: placementRevision({
            placement: scaledPlacement(),
            solvedRegistration: null,
          }),
        })],
        future: [],
      },
      notice: {
        kind: "placement-changed",
        editKind: "center-overlay",
      },
    },
    effects: [
      persistDurableStateEffect({
        session: result.state.session,
      }),
    ],
  });
  assert.deepEqual(trace.edges, durableCommandEdges("command.center-overlay-in-view"));
});

// Class-a: the icon button expresses user intent, but the application only
// commits a fit when the shell has supplied a concrete placement. Without a
// loaded image or without measurement, the command is intentionally inert.
test("center overlay in view is inert without image or measured placement", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "center overlay in view is inert without image or measured placement",
  });
  for (const { phase, state, command } of [
    {
      phase: "no-image",
      state: {},
      command: createApplicationCommand(
        APPLICATION_COMMAND_KIND.CENTER_OVERLAY_IN_VIEW,
        {
          placement: scaledPlacement(),
        },
      ),
    },
    {
      phase: "no-placement",
      state: referenceImageLoadedState(),
      command: createApplicationCommand(APPLICATION_COMMAND_KIND.CENTER_OVERLAY_IN_VIEW),
    },
    {
      phase: "trace-map-locked-placement",
      state: referenceImageLoadedState({
        mode: "trace",
        placement: mapLockedPlacement(),
      }),
      command: createApplicationCommand(
        APPLICATION_COMMAND_KIND.CENTER_OVERLAY_IN_VIEW,
        {
          placement: scaledPlacement(),
        },
      ),
    },
    {
      phase: "trace-solved-transform",
      state: referenceImageLoadedState({
        mode: "trace",
        pins: [firstPin(), secondPin()],
        solvedTransform: imageToMapWorldTransform(),
      }),
      command: createApplicationCommand(
        APPLICATION_COMMAND_KIND.CENTER_OVERLAY_IN_VIEW,
        {
          placement: scaledPlacement(),
        },
      ),
    },
  ]) {
    const result = handleApplicationCommand({ state, command });
    traceApplicationResult({
      trace,
      command,
      result,
      phase,
    });
    assert.deepEqual(result, {
      state,
      effects: [],
    });
  }
  assert.deepEqual(trace.edges, [
    flowEdge("command.center-overlay-in-view", "sink.application-state", {
      phase: "no-image",
      terminal: "state-result",
    }),
    flowEdge("command.center-overlay-in-view", "inert.no-effects", {
      phase: "no-image",
      terminal: "intentionally-inert",
    }),
    flowEdge("command.center-overlay-in-view", "sink.application-state", {
      phase: "no-placement",
      terminal: "state-result",
    }),
    flowEdge("command.center-overlay-in-view", "inert.no-effects", {
      phase: "no-placement",
      terminal: "intentionally-inert",
    }),
    flowEdge("command.center-overlay-in-view", "sink.application-state", {
      phase: "trace-map-locked-placement",
      terminal: "state-result",
    }),
    flowEdge("command.center-overlay-in-view", "inert.no-effects", {
      phase: "trace-map-locked-placement",
      terminal: "intentionally-inert",
    }),
    flowEdge("command.center-overlay-in-view", "sink.application-state", {
      phase: "trace-solved-transform",
      terminal: "state-result",
    }),
    flowEdge("command.center-overlay-in-view", "inert.no-effects", {
      phase: "trace-solved-transform",
      terminal: "intentionally-inert",
    }),
  ]);
});

// Class-a: placement undo/redo is a semantic placement revision, not whole
// session snapshot replay. Legacy preserves the user's current Align/Trace
// posture while restoring the prior overlay transform and solved-registration
// metadata.
test("placement undo and redo preserve the current mode", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "placement undo and redo preserve the current mode",
  });
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
  traceApplicationResult({
    trace,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
    result: undoResult,
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
    viewFeedback: historyReplayFeedback({
      record,
      direction: "undo",
    }),
  });

  const redoCommand = createApplicationCommand(APPLICATION_COMMAND_KIND.REDO);
  const redoResult = handleApplicationCommand({
    state: undoResult.state,
    command: redoCommand,
  });
  traceApplicationResult({
    trace,
    command: redoCommand,
    result: redoResult,
  });

  assert.deepEqual(redoResult, {
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
    viewFeedback: historyReplayFeedback({
      record,
      direction: "redo",
    }),
  });
  assert.deepEqual(trace.edges, [
    ...durableCommandEdges("command.undo"),
    ...durableCommandEdges("command.redo"),
  ]);
});

function traceApplicationResult({
  trace,
  command,
  result,
  phase,
}) {
  const attributes = phase === undefined ? {} : { phase };
  trace.edge(flowEdge(`command.${command.kind}`, "sink.application-state", {
    ...attributes,
    terminal: "state-result",
  }));
  if (result.effects.length === 0) {
    trace.edge(flowEdge(`command.${command.kind}`, "inert.no-effects", {
      ...attributes,
      terminal: "intentionally-inert",
    }));
    return;
  }
  for (const effect of result.effects) {
    trace.edge(flowEdge(`command.${command.kind}`, `effect.${effect.kind}`, {
      ...attributes,
      provider: "application",
    }));
  }
}

function durableCommandEdges(commandNode, attributes = {}) {
  return [
    flowEdge(commandNode, "sink.application-state", {
      ...attributes,
      terminal: "state-result",
    }),
    flowEdge(commandNode, "effect.persist-durable-state", {
      ...attributes,
      provider: "application",
    }),
  ];
}

function placementEditEdges(attributes = {}) {
  return durableCommandEdges("command.commit-placement-edit", attributes);
}

function historyReplayFeedback({ record, direction }) {
  return {
    statusNotice: {
      kind: "history-replayed",
      direction,
      historyKind: record.kind,
      editKind: record.editKind,
    },
  };
}

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

function mapLockedPlacement() {
  return {
    ...solvedPlacement(),
    coordinateSpace: "map-world",
  };
}

function imageToMapWorldTransform() {
  return {
    type: "image-to-map-world",
    a: 1,
    b: 0,
    tx: 100,
    ty: 200,
    scale: 1,
    rotationRad: 0,
    pinIds: [1, 2],
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
  solvedTransform,
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
    if (solvedTransform !== undefined) {
      session.registration.solvedTransform = solvedTransform;
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
