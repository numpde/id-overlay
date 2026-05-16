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

// Class-a: placement undo is scoped replay over the current session, not full
// session rollback. Mode, opacity, pins, and reference identity are unrelated to
// a move record and must survive undo even if they changed after the edit.
test("undoing placement preserves unrelated current durable state", () => {
  const trace = createPlacementHistoryTrace("undoing placement preserves unrelated current durable state");
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

  assert.deepEqual(handleApplicationCommand({
    state: {
      session: referenceImageSession({
        mode: "trace",
        opacity: 0.5,
        pins: [firstPin()],
        placement: movedPlacement(),
      }),
      history: {
        past: [record],
        future: [],
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
  }), {
    state: {
      session: referenceImageSession({
        mode: "trace",
        opacity: 0.5,
        pins: [firstPin()],
        placement: originalPlacement(),
      }),
      history: {
        past: [],
        future: [record],
      },
    },
    effects: [{
      kind: "persist-durable-state",
      durableState: durableImageState({
        mode: "trace",
        opacity: 0.5,
        pins: [firstPin()],
        placement: originalPlacement(),
      }),
    }],
    viewFeedback: historyReplayFeedback({
      record,
      direction: "undo",
    }),
  });
  tracePlacementHistory(trace, "undo-placement");
});

// Class-a: placement redo is the same scoped replay in the forward direction.
// Redo reapplies only the recorded placement revision over the current session.
test("redoing placement preserves unrelated current durable state", () => {
  const trace = createPlacementHistoryTrace("redoing placement preserves unrelated current durable state");
  const record = placementHistoryRecord({
    editKind: "rotate",
    before: placementRevision({
      placement: originalPlacement(),
      solvedRegistration: null,
    }),
    after: placementRevision({
      placement: rotatedPlacement(),
      solvedRegistration: null,
    }),
  });

  assert.deepEqual(handleApplicationCommand({
    state: {
      session: referenceImageSession({
        mode: "align",
        opacity: 0.7,
        pins: [firstPin()],
        placement: originalPlacement(),
      }),
      history: {
        past: [],
        future: [record],
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.REDO),
  }), {
    state: {
      session: referenceImageSession({
        mode: "align",
        opacity: 0.7,
        pins: [firstPin()],
        placement: rotatedPlacement(),
      }),
      history: {
        past: [record],
        future: [],
      },
    },
    effects: [{
      kind: "persist-durable-state",
      durableState: durableImageState({
        mode: "align",
        opacity: 0.7,
        pins: [firstPin()],
        placement: rotatedPlacement(),
      }),
    }],
    viewFeedback: historyReplayFeedback({
      record,
      direction: "redo",
    }),
  });
  tracePlacementHistory(trace, "redo-placement");
});

// Class-a: solved registration placement is part of a placement revision, but
// only with its pin context. Undo can restore solved metadata when the current
// pins still match the recorded fit.
test("undoing manual placement restores solved registration placement metadata", () => {
  const trace = createPlacementHistoryTrace("undoing manual placement restores solved registration placement metadata");
  const record = placementHistoryRecord({
    editKind: "move",
    before: placementRevision({
      placement: originalPlacement(),
      solvedRegistration: solvedRegistration({
        pinIds: [1, 2],
        placement: originalPlacement(),
      }),
    }),
    after: placementRevision({
      placement: movedPlacement(),
      solvedRegistration: null,
    }),
  });

  assert.deepEqual(handleApplicationCommand({
    state: {
      session: referenceImageSession({
        mode: "align",
        pins: [firstPin(), secondPin()],
        placement: movedPlacement(),
      }),
      history: {
        past: [record],
        future: [],
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
  }), {
    state: {
      session: referenceImageSession({
        mode: "align",
        pins: [firstPin(), secondPin()],
        placement: originalPlacement(),
        solvedPlacement: originalPlacement(),
      }),
      history: {
        past: [],
        future: [record],
      },
    },
    effects: [{
      kind: "persist-durable-state",
      durableState: durableImageState({
        mode: "align",
        pins: [firstPin(), secondPin()],
        placement: originalPlacement(),
        solvedPlacement: originalPlacement(),
      }),
    }],
    viewFeedback: historyReplayFeedback({
      record,
      direction: "undo",
    }),
  });
  tracePlacementHistory(trace, "undo-placement-solved-registration");
});

// Class-a: solved metadata is valid only for the pins that produced it. If pins
// changed after the manual placement, undo restores visible placement but not a
// stale solved-registration claim.
test("undoing placement does not restore solved metadata for changed pins", () => {
  const trace = createPlacementHistoryTrace("undoing placement does not restore solved metadata for changed pins");
  const record = placementHistoryRecord({
    editKind: "move",
    before: placementRevision({
      placement: originalPlacement(),
      solvedRegistration: solvedRegistration({
        pinIds: [1, 2],
        placement: originalPlacement(),
      }),
    }),
    after: placementRevision({
      placement: movedPlacement(),
      solvedRegistration: null,
    }),
  });

  assert.deepEqual(handleApplicationCommand({
    state: {
      session: referenceImageSession({
        mode: "align",
        pins: [firstPin(), thirdPin()],
        placement: movedPlacement(),
      }),
      history: {
        past: [record],
        future: [],
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
  }), {
    state: {
      session: referenceImageSession({
        mode: "align",
        pins: [firstPin(), thirdPin()],
        placement: originalPlacement(),
      }),
      history: {
        past: [],
        future: [record],
      },
    },
    effects: [{
      kind: "persist-durable-state",
      durableState: durableImageState({
        mode: "align",
        pins: [firstPin(), thirdPin()],
        placement: originalPlacement(),
      }),
    }],
    viewFeedback: historyReplayFeedback({
      record,
      direction: "undo",
    }),
  });
  tracePlacementHistory(trace, "undo-placement-changed-pins");
});

function createPlacementHistoryTrace(testName) {
  return createFlowTrace({
    file: import.meta.url,
    test: testName,
  });
}

function tracePlacementHistory(trace, phase) {
  const command = phase.startsWith("redo") ? "command.redo" : "command.undo";
  trace.edge(flowEdge("source.application-command", command, {
    phase,
    provider: "application-transition-witness",
  }));
  trace.edge(flowEdge(command, "sink.application-state", {
    phase,
    terminal: "state-result",
  }));
  trace.edge(flowEdge(command, "sink.declared-effects", {
    phase,
    terminal: "effect-result",
  }));
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

function solvedRegistration({ pinIds, placement }) {
  return {
    pinIds,
    placement,
  };
}

function durableImageState({
  mode,
  placement,
  opacity,
  pins,
  solvedPlacement,
}) {
  return {
    session: referenceImageSession({
      mode,
      placement,
      opacity,
      pins,
      solvedPlacement,
    }),
  };
}

function referenceImageSession({
  mode,
  placement = undefined,
  opacity = undefined,
  pins = [],
  solvedPlacement = undefined,
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
  if (placement !== undefined) {
    session.placement = placement;
  }
  if (opacity !== undefined) {
    session.opacity = opacity;
  }
  if (pins.length > 0 || solvedPlacement !== undefined) {
    session.registration = {
      pins,
    };
    if (solvedPlacement !== undefined) {
      session.registration.solvedPlacement = solvedPlacement;
    }
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

function secondPin() {
  return {
    id: 2,
    imagePx: {
      x: 500,
      y: 260,
    },
    mapLatLon: {
      lat: -1.22,
      lon: 36.85,
    },
  };
}

function thirdPin() {
  return {
    id: 3,
    imagePx: {
      x: 420,
      y: 300,
    },
    mapLatLon: {
      lat: -1.21,
      lon: 36.86,
    },
  };
}

function originalPlacement() {
  return placement({
    x: 10,
    y: 20,
    scale: 1,
    rotationRad: 0,
  });
}

function movedPlacement() {
  return placement({
    x: 30,
    y: 50,
    scale: 1,
    rotationRad: 0,
  });
}

function rotatedPlacement() {
  return placement({
    x: 30,
    y: 50,
    scale: 1,
    rotationRad: 0.5,
  });
}

function placement({
  x,
  y,
  scale,
  rotationRad,
}) {
  return {
    x,
    y,
    scale,
    rotationRad,
  };
}
