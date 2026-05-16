import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-a: accepting a reference image creates the first visible overlay
// session. The canonical first posture is Align, the load is undoable, and the
// new durable session is emitted as host work rather than written by the
// application.
test("accepted reference image creates an undoable Align session and durability effect", () => {
  const trace = createReferenceImageLifecycleTrace("accepted reference image creates an undoable Align session and durability effect");
  const referenceImage = normalizedReferenceImage();
  const session = {
    mode: "align",
    referenceImage,
  };
  const durableState = {
    session,
  };

  assert.deepEqual(handleApplicationCommand({
    state: {
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 1,
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: 1,
        outcome: {
          kind: "accepted",
          referenceImage,
        },
      },
    ),
  }), {
    state: {
      session,
      history: {
        past: [loadReferenceImageHistoryRecord(durableState)],
        future: [],
      },
      notice: {
        kind: "reference-image-loaded",
        referenceImage,
      },
    },
    effects: [
      persistDurableStateEffect(durableState),
    ],
  });
  traceInputOutcome(trace, "accepted-initial-reference-image", [
    "sink.application-state",
    "sink.declared-effects",
  ]);
});

// Class-a: accepting an image starts a new loaded session. Stale input prompts,
// notices, and destructive confirmations must not carry into that session.
test("accepted reference image clears pending input notice and panel intent", () => {
  const trace = createReferenceImageLifecycleTrace("accepted reference image clears pending input notice and panel intent");
  const referenceImage = normalizedReferenceImage();
  const session = {
    mode: "align",
    referenceImage,
  };
  const durableState = {
    session,
  };

  assert.deepEqual(handleApplicationCommand({
    state: {
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 1,
      },
      notice: {
        kind: "reference-image-input-empty",
      },
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: 1,
        outcome: {
          kind: "accepted",
          referenceImage,
        },
      },
    ),
  }), {
    state: {
      session,
      history: {
        past: [loadReferenceImageHistoryRecord(durableState)],
        future: [],
      },
      notice: {
        kind: "reference-image-loaded",
        referenceImage,
      },
    },
    effects: [
      persistDurableStateEffect(durableState),
    ],
  });
  traceInputOutcome(trace, "accepted-clears-transient-context", [
    "sink.application-state",
    "sink.declared-effects",
  ]);
});

// Class-a: page observation is outside the app, but an accepted image may carry
// an already-derived initial placement. Loading the image and placement is one
// atomic durable product transition, not "load, then move overlay".
test("accepted reference image records initial placement atomically", () => {
  const trace = createReferenceImageLifecycleTrace("accepted reference image records initial placement atomically");
  const referenceImage = normalizedReferenceImage("placed");
  const initialPlacement = placement();
  const session = {
    mode: "align",
    referenceImage,
    placement: initialPlacement,
  };
  const durableState = {
    session,
  };

  assert.deepEqual(handleApplicationCommand({
    state: {
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 1,
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: 1,
        outcome: {
          kind: "accepted",
          referenceImage,
          placement: initialPlacement,
        },
      },
    ),
  }), {
    state: {
      session,
      history: {
        past: [loadReferenceImageHistoryRecord(durableState)],
        future: [],
      },
      notice: {
        kind: "reference-image-loaded",
        referenceImage,
      },
    },
    effects: [
      persistDurableStateEffect(durableState),
    ],
  });
  traceInputOutcome(trace, "accepted-initial-placement", [
    "sink.application-state",
    "sink.declared-effects",
  ]);
});

// Class-a: loading a new image after a prior removal starts a fresh session.
// Undo history may still remember the removed placement and pins, but those
// old alignment facts must not leak into the newly accepted image.
test("accepted reference image after removal does not inherit removed placement or pins", () => {
  const trace = createReferenceImageLifecycleTrace("accepted reference image after removal does not inherit removed placement or pins");
  const removedDurableState = {
    session: {
      mode: "align",
      referenceImage: normalizedReferenceImage("old"),
      placement: placement(),
      registration: {
        pins: [firstPin()],
      },
    },
  };
  const previousRemoval = {
    kind: "remove-reference-image",
    before: removedDurableState,
    after: null,
  };
  const referenceImage = normalizedReferenceImage("new");
  const session = {
    mode: "align",
    referenceImage,
  };
  const durableState = {
    session,
  };

  assert.deepEqual(handleApplicationCommand({
    state: {
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 2,
      },
      history: {
        past: [previousRemoval],
        future: [],
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: 2,
        outcome: {
          kind: "accepted",
          referenceImage,
        },
      },
    ),
  }), {
    state: {
      session,
      history: {
        past: [
          previousRemoval,
          loadReferenceImageHistoryRecord(durableState),
        ],
        future: [],
      },
      notice: {
        kind: "reference-image-loaded",
        referenceImage,
      },
    },
    effects: [
      persistDurableStateEffect(durableState),
    ],
  });
  traceInputOutcome(trace, "accepted-after-removal", [
    "sink.application-state",
    "sink.declared-effects",
  ]);
});

// Class-a: empty reference-image input is a normal user-world outcome, not a
// boundary failure. It must end the transient input without creating a session
// or durable work, and the application must declare the correlated status
// expiry rather than making the shell infer timers from notice shape.
test("empty reference-image input outcome ends input without durability", () => {
  const trace = createReferenceImageLifecycleTrace("empty reference-image input outcome ends input without durability");
  const result = handleApplicationCommand({
    state: {
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 1,
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: 1,
        outcome: {
          kind: "empty",
        },
      },
    ),
  });

  assert.deepEqual(result, {
    state: {
      notice: {
        kind: "reference-image-input-empty",
        requestId: 1,
      },
    },
    effects: [
      scheduleClearStatusNoticeEffect(1),
    ],
  });
  traceInputOutcome(trace, "empty-input-outcome", [
    "sink.application-state",
    "sink.declared-effects",
  ]);
});

// Class-a: a declared input failure is also a normal user-world outcome. It
// ends the transient input flow without creating an image session or durable
// work, keeps source-neutral failure vocabulary, and schedules status expiry.
test("failed reference-image input outcome ends input without durability", () => {
  const trace = createReferenceImageLifecycleTrace("failed reference-image input outcome ends input without durability");
  const result = handleApplicationCommand({
    state: {
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 1,
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: 1,
        outcome: {
          kind: "failed",
          reason: "source-unavailable",
        },
      },
    ),
  });

  assert.deepEqual(result, {
    state: {
      notice: {
        kind: "reference-image-input-failed",
        reason: "source-unavailable",
        requestId: 1,
      },
    },
    effects: [
      scheduleClearStatusNoticeEffect(1),
    ],
  });
  traceInputOutcome(trace, "failed-input-outcome", [
    "sink.application-state",
    "sink.declared-effects",
  ]);
});

// Class-a: clearing the reference image collapses the app back to no session
// and emits durable clearing. There is no hidden overlay state after removal.
test("clearing the reference image returns to no-session Trace", () => {
  const trace = createReferenceImageLifecycleTrace("clearing the reference image returns to no-session Trace");

  assert.deepEqual(handleApplicationCommand({
    state: referenceImageLoadedState(),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.CLEAR_REFERENCE_IMAGE,
    ),
  }), {
    state: {
      ...createInitialApplicationState(),
      notice: {
        kind: "reference-image-cleared",
      },
    },
    effects: [
      persistDurableStateEffect(null),
    ],
  });
  traceApplicationCommand(trace, "clear-reference-image", "clear-reference-image", [
    "sink.application-state",
    "sink.declared-effects",
  ]);
});

function createReferenceImageLifecycleTrace(testName) {
  return createFlowTrace({
    file: import.meta.url,
    test: testName,
  });
}

function traceInputOutcome(trace, phase, sinks) {
  traceApplicationCommand(
    trace,
    "report-reference-image-input-outcome",
    phase,
    sinks,
  );
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

function normalizedReferenceImage(label = "1") {
  return {
    imageDataRef: `reference-image-data-${label}`,
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

function referenceImageLoadedState() {
  return {
    session: {
      mode: "align",
      referenceImage: normalizedReferenceImage(),
    },
  };
}

function persistDurableStateEffect(durableState) {
  return {
    kind: "persist-durable-state",
    durableState,
  };
}

function loadReferenceImageHistoryRecord(durableState) {
  return {
    kind: "load-reference-image",
    before: null,
    after: durableState,
  };
}

function scheduleClearStatusNoticeEffect(requestId) {
  return {
    kind: "schedule-application-command",
    scheduleId: "status-notice",
    delayMs: 2500,
    command: {
      kind: "clear-status-notice",
      requestId,
    },
  };
}

function placement() {
  return {
    x: 30,
    y: 40,
    scale: 2,
    rotationRad: 0.4,
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
