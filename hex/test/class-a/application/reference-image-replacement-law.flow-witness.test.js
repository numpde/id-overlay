import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { selectApplicationView } from "../../../application/view-model.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-a: replacing a loaded reference image is not "clear, then paste".
// The old session remains the visible durable product fact until a new
// normalized reference-image input is accepted. This keeps failed, empty, stale,
// or cancelled input non-destructive no matter which input adapter supplied it.
test("requesting replacement keeps the current image while awaiting input", () => {
  const trace = createReplacementTrace("requesting replacement keeps the current image while awaiting input");
  const state = {
    ...loadedImageState({
      mode: "trace",
      placement: oldPlacement(),
      pins: [firstPin()],
      opacity: 0.5,
    }),
    notice: {
      kind: "stale-notice",
    },
    panelIntent: {
      kind: "confirm-clear-reference-image",
    },
  };

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REQUEST_REFERENCE_IMAGE_REPLACEMENT,
    ),
  }), {
    state: {
      session: state.session,
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 1,
        intent: {
          kind: "replace-reference-image",
        },
      },
    },
    effects: [{
      kind: "request-reference-image-input",
      requestId: 1,
      intent: {
        kind: "replace-reference-image",
      },
    }],
  });
  traceApplicationCommand(trace, "request-reference-image-replacement", "request-replacement", [
    "sink.application-state",
    "sink.declared-effects",
  ]);
});

// Class-a: no-session replacement must not create a hidden alternate input
// path. With no image loaded, the product has only the ordinary initial input
// action; synthetic replacement commands are stale and therefore inert.
test("replacement request with no image is inert", () => {
  const trace = createReplacementTrace("replacement request with no image is inert");

  assert.deepEqual(handleApplicationCommand({
    state: {},
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REQUEST_REFERENCE_IMAGE_REPLACEMENT,
    ),
  }), {
    state: {},
    effects: [],
  });
  traceApplicationCommand(trace, "request-reference-image-replacement", "no-session-replacement", [
    "sink.application-state",
    "inert.no-effects",
  ]);
});

// Class-a: pending replacement is a transient input state layered over the old
// session. The view must still render the old overlay facts; otherwise a failed
// or cancelled replacement would already have behaved like removal.
test("replacement-pending view still renders the old image", () => {
  const trace = createReplacementTrace("replacement-pending view still renders the old image");
  const state = {
    ...loadedImageState({
      mode: "align",
      placement: oldPlacement(),
      pins: [firstPin()],
    }),
    referenceImageInput: {
      status: "awaiting-input",
      requestId: 1,
      intent: {
        kind: "replace-reference-image",
      },
    },
  };

  const view = selectApplicationView(state);

  assert.deepEqual(view.overlay, {
    visible: true,
    imageDataRef: oldReferenceImage().imageDataRef,
    intrinsicSizePx: oldReferenceImage().intrinsicSizePx,
    placement: oldPlacement(),
    opacity: 1,
    pins: [firstPin()],
  });
  assert.match(view.primaryAction.label, /cancel/i);
  assert.doesNotMatch(view.primaryAction.label, /clear/i);
  trace.edge(flowEdge("view.replacement-pending", "sink.application-view", {
    phase: "old-image-visible",
    terminal: "view-result",
  }));
});

// Class-a: accepting replacement is the destructive moment. It starts a fresh
// Align session for the new reference, persists that durable state, and records
// a whole-session history edge so undo restores the previous image.
test("accepted replacement creates fresh Align session and persists it", () => {
  const trace = createReplacementTrace("accepted replacement creates fresh Align session and persists it");
  const oldState = loadedImageState({
    mode: "trace",
    placement: oldPlacement(),
    pins: [firstPin()],
    opacity: 0.5,
  });
  const newSession = {
    mode: "align",
    referenceImage: newReferenceImage(),
  };

  assert.deepEqual(handleApplicationCommand({
    state: {
      ...oldState,
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 4,
        intent: {
          kind: "replace-reference-image",
        },
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: 4,
        outcome: {
          kind: "accepted",
          referenceImage: newReferenceImage(),
        },
      },
    ),
  }), {
    state: {
      session: newSession,
      history: {
        past: [replacementHistoryRecord({
          before: durableStateFromLoadedState(oldState),
          after: {
            session: newSession,
          },
        })],
        future: [],
      },
      notice: {
        kind: "reference-image-loaded",
        referenceImage: newReferenceImage(),
      },
    },
    effects: [{
      kind: "persist-durable-state",
      durableState: {
        session: newSession,
      },
    }],
  });
  traceApplicationCommand(trace, "report-reference-image-input-outcome", "accepted-replacement", [
    "sink.application-state",
    "sink.declared-effects",
  ]);
});

// Class-a: replacement is a normal undoable durable edit. It appends to the
// existing past and clears redo because accepting a new image creates a new
// timeline branch.
test("accepted replacement appends history and clears redo future", () => {
  const trace = createReplacementTrace("accepted replacement appends history and clears redo future");
  const oldState = loadedImageState({
    mode: "align",
    placement: oldPlacement(),
  });
  const pastRecord = placementHistoryRecord();
  const futureRecord = placementHistoryRecord({
    editKind: "scale",
  });
  const newSession = {
    mode: "align",
    referenceImage: newReferenceImage(),
  };

  const result = handleApplicationCommand({
    state: {
      ...oldState,
      history: {
        past: [pastRecord],
        future: [futureRecord],
      },
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 5,
        intent: {
          kind: "replace-reference-image",
        },
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: 5,
        outcome: {
          kind: "accepted",
          referenceImage: newReferenceImage(),
        },
      },
    ),
  });

  assert.deepEqual(result.state.history, {
    past: [
      pastRecord,
      replacementHistoryRecord({
        before: durableStateFromLoadedState(oldState),
        after: {
          session: newSession,
        },
      }),
    ],
    future: [],
  });
  assert.deepEqual(result.effects, [{
    kind: "persist-durable-state",
    durableState: {
      session: newSession,
    },
  }]);
  traceApplicationCommand(trace, "report-reference-image-input-outcome", "accepted-replacement-history", [
    "sink.application-state",
    "sink.declared-effects",
  ]);
});

// Class-a: empty or failed replacement input is non-destructive. The previous
// session and history remain intact, the pending input ends, and no durable
// write occurs because the accepted-image boundary was never reached.
test("empty or failed replacement leaves old image intact", () => {
  const trace = createReplacementTrace("empty or failed replacement leaves old image intact");

  for (const { outcome, expectedNotice } of [
    {
      outcome: {
        kind: "empty",
      },
      expectedNotice: {
        kind: "reference-image-replacement-empty",
        requestId: 6,
      },
    },
    {
      outcome: {
        kind: "failed",
        reason: "source-unavailable",
      },
      expectedNotice: {
        kind: "reference-image-replacement-failed",
        reason: "source-unavailable",
        requestId: 6,
      },
    },
  ]) {
    const state = {
      ...loadedImageState({
        mode: "align",
        placement: oldPlacement(),
        pins: [firstPin()],
      }),
      history: {
        past: [placementHistoryRecord()],
        future: [],
      },
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 6,
        intent: {
          kind: "replace-reference-image",
        },
      },
    };

    const result = handleApplicationCommand({
      state,
      command: createApplicationCommand(
        APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
        {
          requestId: 6,
          outcome,
        },
      ),
    });

    assert.deepEqual(result, {
      state: {
        session: state.session,
        history: state.history,
        notice: expectedNotice,
      },
      effects: [{
        kind: "schedule-application-command",
        scheduleId: "status-notice",
        delayMs: 2500,
        command: {
          kind: "clear-status-notice",
          requestId: 6,
        },
      }],
    });
  }
  traceApplicationCommand(trace, "report-reference-image-input-outcome", "non-accepted-replacement", [
    "sink.application-state",
    "sink.declared-effects",
  ]);
});

// Class-a: cancelling replacement means "keep what I had". It is a transient
// input cancellation, not a destructive image action, so it preserves the old
// session, tells the shell to release the matching input flow, and schedules
// only notice expiry.
test("cancelling replacement leaves old image intact", () => {
  const trace = createReplacementTrace("cancelling replacement leaves old image intact");
  const state = {
    ...loadedImageState({
      mode: "trace",
      placement: oldPlacement(),
    }),
    referenceImageInput: {
      status: "awaiting-input",
      requestId: 7,
      intent: {
        kind: "replace-reference-image",
      },
    },
  };

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION),
  }), {
    state: {
      session: state.session,
      notice: {
        kind: "reference-image-replacement-cancelled",
        requestId: 7,
      },
    },
    effects: [
      {
        kind: "cancel-reference-image-input",
        requestId: 7,
      },
      {
        kind: "schedule-application-command",
        scheduleId: "status-notice",
        delayMs: 2500,
        command: {
          kind: "clear-status-notice",
          requestId: 7,
        },
      },
    ],
  });
  traceApplicationCommand(trace, "activate-primary-action", "cancel-replacement", [
    "sink.application-state",
    "sink.declared-effects",
  ]);
});

// Class-a: stale replacement results are ignored before outcome semantics. A
// late accepted input must not overwrite the visible old session after the user
// has moved on to a newer request or cancellation.
test("stale replacement outcome cannot replace current image", () => {
  const trace = createReplacementTrace("stale replacement outcome cannot replace current image");
  const state = {
    ...loadedImageState({
      mode: "align",
      placement: oldPlacement(),
    }),
    referenceImageInput: {
      status: "awaiting-input",
      requestId: 9,
      intent: {
        kind: "replace-reference-image",
      },
    },
  };

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: 8,
        outcome: {
          kind: "accepted",
          referenceImage: newReferenceImage(),
        },
      },
    ),
  }), {
    state,
    effects: [],
  });
  traceApplicationCommand(trace, "report-reference-image-input-outcome", "stale-replacement-outcome", [
    "sink.application-state",
    "inert.no-effects",
  ]);
});

// Class-a: replacement state names the product intent, not a particular input
// source. Paste and clipboard are adapter tactics; they must not leak into the
// application state that survives command handling or request correlation.
test("replacement state is source-agnostic", () => {
  const trace = createReplacementTrace("replacement state is source-agnostic");
  const state = handleApplicationCommand({
    state: loadedImageState(),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REQUEST_REFERENCE_IMAGE_REPLACEMENT,
    ),
  }).state;

  const serialized = JSON.stringify(state);
  assert.equal(serialized.includes("paste"), false);
  assert.equal(serialized.includes("clipboard"), false);
  assert.equal(serialized.includes("replace-reference-image"), true);
  traceApplicationCommand(trace, "request-reference-image-replacement", "source-agnostic-replacement", [
    "sink.application-state",
    "sink.declared-effects",
  ]);
});

function createReplacementTrace(testName) {
  return createFlowTrace({
    file: import.meta.url,
    test: testName,
  });
}

function traceApplicationCommand(trace, command, phase, sinks) {
  const commandNode = `command.${command}`;
  trace.edge(flowEdge("source.application-command", commandNode, {
    phase,
    provider: "application-transition-witness",
  }));
  for (const sink of sinks) {
    trace.edge(flowEdge(commandNode, sink, {
      phase,
      terminal: sink === "sink.application-state" ? "state-result" : "effect-result",
    }));
  }
}

function loadedImageState({
  mode = "align",
  referenceImage = oldReferenceImage(),
  placement = undefined,
  pins = [],
  opacity = undefined,
} = {}) {
  const session = {
    mode,
    referenceImage,
  };
  if (placement !== undefined) {
    session.placement = placement;
  }
  if (pins.length > 0) {
    session.registration = {
      pins,
    };
  }
  if (opacity !== undefined) {
    session.opacity = opacity;
  }
  return {
    session,
  };
}

function durableStateFromLoadedState(state) {
  return {
    session: state.session,
  };
}

function replacementHistoryRecord({ before, after }) {
  return {
    kind: "replace-reference-image",
    before,
    after,
  };
}

function placementHistoryRecord({ editKind = "move" } = {}) {
  return {
    kind: "overlay-placement-edit",
    editKind,
    before: {
      placement: null,
      solvedRegistration: null,
    },
    after: {
      placement: oldPlacement(),
      solvedRegistration: null,
    },
  };
}

function oldReferenceImage() {
  return {
    imageDataRef: "data:image/png;base64,old-reference-image",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

function newReferenceImage() {
  return {
    imageDataRef: "data:image/png;base64,new-reference-image",
    intrinsicSizePx: {
      width: 800,
      height: 600,
    },
  };
}

function oldPlacement() {
  return {
    x: 30,
    y: 40,
    scale: 1.5,
    rotationRad: 0.25,
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
