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

// Class-a: the direct clear-pins command is application behavior, not a
// witnessed user-flow source. The user-facing route is covered by the primary
// action flow witness.
test("clearing Align registration pins keeps the image and clears registration durably", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "clearing Align registration pins keeps the image and clears registration durably",
  });
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({
      mode: "align",
      pins: [firstPin(), secondPin()],
    }),
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.CLEAR_REGISTRATION_PINS),
  });

  assert.deepEqual(result.state.session, {
    mode: "align",
    referenceImage: normalizedReferenceImage(),
  });
  assert.deepEqual(result.effects, [
    persistDurableStateEffect({
      session: result.state.session,
    }),
  ]);
  trace.edge(flowEdge("source.application-command", "command.clear-registration-pins", {
    provider: "application-transition-witness",
  }));
  trace.edge(flowEdge("command.clear-registration-pins", "sink.application-state", {
    terminal: "state-result",
  }));
  trace.edge(flowEdge("command.clear-registration-pins", "sink.declared-effects", {
    terminal: "effect-result",
  }));
});

// Class-a: clearing pins is a semantic registration edit. Its undo/redo posture
// must be Align because the cleared/restored object is invisible in Trace.
test("clearing registration pins creates undoable Align-authored history", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "clearing registration pins creates undoable Align-authored history",
  });
  const before = referenceImageLoadedState({
    mode: "align",
    pins: [firstPin(), secondPin()],
  });
  const result = handleApplicationCommand({
    state: before,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.CLEAR_REGISTRATION_PINS),
  });

  trace.edge(flowEdge("source.application-command", "command.clear-registration-pins", {
    provider: "application-transition-witness",
  }));
  trace.edge(flowEdge("command.clear-registration-pins", "sink.application-state", {
    terminal: "state-result",
  }));
  trace.edge(flowEdge("command.clear-registration-pins", "sink.declared-effects", {
    terminal: "effect-result",
  }));

  assert.deepEqual(result.state.history, {
    past: [{
      kind: "clear-registration-pins",
      before: {
        session: before.session,
      },
      after: {
        session: {
          mode: "align",
          referenceImage: normalizedReferenceImage(),
        },
      },
    }],
    future: [],
  });

  const undo = handleApplicationCommand({
    state: {
      ...result.state,
      session: {
        ...result.state.session,
        mode: "trace",
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
  });
  trace.edge(flowEdge("source.application-command", "command.undo", {
    phase: "undo",
    provider: "application-transition-witness",
  }));
  trace.edge(flowEdge("command.undo", "sink.application-state", {
    phase: "undo",
    terminal: "state-result",
  }));
  trace.edge(flowEdge("command.undo", "sink.declared-effects", {
    phase: "undo",
    terminal: "effect-result",
  }));

  assert.equal(undo.state.session.mode, "align");
  assert.deepEqual(undo.state.session.registration?.pins, [firstPin(), secondPin()]);
});

function referenceImageLoadedState({
  mode = "align",
  pins,
} = {}) {
  const session = {
    mode,
    referenceImage: normalizedReferenceImage(),
  };
  if (pins !== undefined) {
    session.registration = {
      pins,
    };
  }
  return { session };
}

function normalizedReferenceImage() {
  return {
    imageDataRef: "reference-image-data-1",
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

function persistDurableStateEffect({ session }) {
  return {
    kind: "persist-durable-state",
    durableState: {
      session,
    },
  };
}
