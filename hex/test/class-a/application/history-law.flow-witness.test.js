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

// Class-a: undo is durable-state replay, not bespoke reverse code per action.
// The latest past record's `before` state becomes the persisted app state and
// the record moves to the redo stack unchanged.
test("undo replays the latest history record before-state durably", () => {
  const trace = createHistoryTrace("undo replays the latest history record before-state durably");
  const record = {
    kind: "load-reference-image",
    before: null,
    after: referenceImageDurableState(),
  };
  const result = handleApplicationCommand({
    state: {
      ...referenceImageLoadedState(),
      history: {
        past: [record],
        future: [],
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
  });

  assert.equal(Object.hasOwn(result.state, "session"), false);
  assert.deepEqual(result.state.history, {
    past: [],
    future: [record],
  });
  assert.deepEqual(
    persistDurableStateEffects(result.effects),
    [persistDurableStateEffect(null)],
  );
  traceApplicationCommand(trace, "undo", [
    "sink.application-state",
    "sink.declared-effects",
  ]);
});

// Class-a: redo is the same durable-state replay in the other direction. The
// latest future record's `after` state becomes persisted state and the record
// moves back to the undo stack unchanged.
test("redo replays the latest history record after-state durably", () => {
  const trace = createHistoryTrace("redo replays the latest history record after-state durably");
  const record = {
    kind: "load-reference-image",
    before: null,
    after: referenceImageDurableState(),
  };
  const result = handleApplicationCommand({
    state: {
      history: {
        past: [],
        future: [record],
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.REDO),
  });

  assert.deepEqual(result.state.session, referenceImageLoadedState().session);
  assert.deepEqual(result.state.history, {
    past: [record],
    future: [],
  });
  assert.deepEqual(
    persistDurableStateEffects(result.effects),
    [persistDurableStateEffect(referenceImageDurableState())],
  );
  traceApplicationCommand(trace, "redo", [
    "sink.application-state",
    "sink.declared-effects",
  ]);
});

// Class-a: initial image load is undoable legacy product behavior, and replaying
// that undo must also clear stale destructive confirmation UI state.
test("undoing initial reference-image load clears stale confirmation state", () => {
  const trace = createHistoryTrace("undoing initial reference-image load clears stale confirmation state");
  const record = {
    kind: "load-reference-image",
    before: null,
    after: referenceImageDurableState(),
  };
  const result = handleApplicationCommand({
    state: {
      ...referenceImageLoadedState(),
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
      history: {
        past: [record],
        future: [],
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
  });

  assert.equal(Object.hasOwn(result.state, "session"), false);
  assert.equal(Object.hasOwn(result.state, "panelIntent"), false);
  assert.deepEqual(result.state.history, {
    past: [],
    future: [record],
  });
  assert.deepEqual(
    persistDurableStateEffects(result.effects),
    [persistDurableStateEffect(null)],
  );
  traceApplicationCommand(trace, "undo", [
    "sink.application-state",
    "sink.declared-effects",
  ]);
});

// Class-a: a new durable edit creates a new timeline branch. Even when that
// edit is not itself pushed onto undo history, the previous redo future is no
// longer reachable and must be discarded.
test("new durable edits clear redo future", () => {
  const trace = createHistoryTrace("new durable edits clear redo future");
  const redoRecord = {
    kind: "move-overlay",
    undoLabel: "Undo move overlay",
    redoLabel: "Redo move overlay",
    before: referenceImageDurableState(),
    after: referenceImageDurableState({
      placement: {
        x: 80,
        y: 40,
        scale: 1,
        rotationRad: 0,
      },
    }),
  };
  const result = handleApplicationCommand({
    state: {
      ...referenceImageLoadedState(),
      history: {
        past: [],
        future: [redoRecord],
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SET_OPACITY, {
      opacity: 0.5,
    }),
  });

  assert.deepEqual(result, {
    state: {
      ...referenceImageLoadedState({
        opacity: 0.5,
      }),
      history: {
        past: [],
        future: [],
      },
    },
    effects: [
      persistDurableStateEffect(referenceImageDurableState({
        opacity: 0.5,
      })),
    ],
  });
  traceApplicationCommand(trace, "set-opacity", [
    "sink.application-state",
    "sink.declared-effects",
  ]);
});

// Class-a: Align/Trace selection is durable posture, but it is not a semantic
// edit to the image. Moving between modes must therefore preserve any redo
// future authored by the last semantic undo.
test("pure mode switches preserve redo future", () => {
  const trace = createHistoryTrace("pure mode switches preserve redo future");
  const redoRecord = {
    kind: "registration-pin-edit",
    before: referenceImageDurableState(),
    after: referenceImageDurableState({
      pins: [firstPin()],
    }),
  };
  const result = handleApplicationCommand({
    state: {
      ...referenceImageLoadedState({
        mode: "align",
      }),
      history: {
        past: [],
        future: [redoRecord],
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: "trace",
    }),
  });

  traceApplicationCommand(trace, "select-mode", [
    "sink.application-state",
    "sink.declared-effects",
  ]);
  assert.equal(result.state.session.mode, "trace");
  assert.deepEqual(result.state.history, {
    past: [],
    future: [redoRecord],
  });
  assert.deepEqual(
    persistDurableStateEffects(result.effects),
    [persistDurableStateEffect(referenceImageDurableState({
      mode: "trace",
    }))],
  );
});

function createHistoryTrace(testName) {
  return createFlowTrace({
    file: import.meta.url,
    test: testName,
  });
}

function traceApplicationCommand(trace, command, sinks) {
  const commandNode = `command.${command}`;
  trace.edge(flowEdge("source.application-command", commandNode, {
    provider: "application-transition-witness",
  }));
  for (const sink of sinks) {
    trace.edge(flowEdge(commandNode, sink, {
      terminal: sink === "sink.application-state" ? "state-result" : "effect-result",
    }));
  }
}

function referenceImageLoadedState({
  mode,
  opacity,
  placement,
  pins,
} = {}) {
  return {
    session: normalizedReferenceImageSession({
      mode,
      opacity,
      placement,
      pins,
    }),
  };
}

function referenceImageDurableState({
  mode,
  opacity,
  placement,
  pins,
} = {}) {
  return {
    session: normalizedReferenceImageSession({
      mode,
      opacity,
      placement,
      pins,
    }),
  };
}

function normalizedReferenceImageSession({
  mode = "align",
  opacity,
  placement,
  pins,
} = {}) {
  const session = {
    mode,
    referenceImage: {
      imageDataRef: "reference-image-data-1",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  };
  if (opacity !== undefined) {
    session.opacity = opacity;
  }
  if (placement !== undefined) {
    session.placement = placement;
  }
  if (pins !== undefined) {
    session.registration = {
      pins,
    };
  }
  return session;
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

function persistDurableStateEffect(durableState) {
  return {
    kind: "persist-durable-state",
    durableState,
  };
}

function persistDurableStateEffects(effects) {
  return effects.filter((effect) => effect.kind === "persist-durable-state");
}
