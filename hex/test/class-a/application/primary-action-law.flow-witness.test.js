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

// Class-a: with no session, the primary action is Paste. Activating it both
// records the pending request and emits host work. The shell must not infer
// image input by noticing state shape; product causality leaves the app as an
// explicit effect.
test("primary action with no session requests reference-image input", () => {
  const trace = createPrimaryActionTrace("primary action with no session requests reference-image input");
  const result = witnessApplicationCommand({
    trace,
    state: createInitialApplicationState(),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assert.deepEqual(result, {
    state: {
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 1,
        intent: {
          kind: "load-reference-image",
        },
      },
    },
    effects: [
      requestReferenceImageInputEffect({
        requestId: 1,
        intent: {
          kind: "load-reference-image",
        },
      }),
    ],
  });
  assert.deepEqual(trace.edges, activatePrimaryActionEdges([
    "effect.request-reference-image-input",
  ]));
});

// Class-a: while image input is armed, activating the same primary action
// cancels that transient input flow. Cancellation must not create a session or
// write durable state, and the cancellation notice is request-correlated so
// late host results remain stale.
test("primary action while awaiting input cancels transient image input", () => {
  const trace = createPrimaryActionTrace("primary action while awaiting input cancels transient image input");
  const result = witnessApplicationCommand({
    trace,
    state: {
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 1,
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assert.deepEqual(result, {
    state: {
      notice: {
        kind: "reference-image-input-cancelled",
        requestId: 1,
      },
    },
    effects: [
      cancelReferenceImageInputEffect(1),
      scheduleClearStatusNoticeEffect(1),
    ],
  });
  assert.deepEqual(trace.edges, activatePrimaryActionEdges([
    "effect.cancel-reference-image-input",
    "effect.schedule-application-command",
  ]));
});

// Class-a: clearing a loaded reference image is destructive. The primary action
// must first arm an explicit confirmation and declare its expiry as product
// causality; the shell must not become the hidden confirmation timer.
test("primary action with a loaded image arms clear-image confirmation", () => {
  const trace = createPrimaryActionTrace("primary action with a loaded image arms clear-image confirmation");
  const state = referenceImageLoadedState();
  const result = witnessApplicationCommand({
    trace,
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assert.deepEqual(result, {
    state: {
      ...state,
      panelIntent: {
        kind: "confirm-clear-reference-image",
        requestId: 1,
      },
    },
    effects: [
      scheduleClearPanelIntentEffect({
        requestId: 1,
        intentKind: "confirm-clear-reference-image",
      }),
    ],
  });
  assert.deepEqual(trace.edges, activatePrimaryActionEdges([
    "effect.schedule-application-command",
  ]));
});

// Class-a: a destructive confirmation is the current panel intent. Arming it
// must replace stale status notices so the user is not shown two competing
// meanings for the same next click.
test("arming clear-image confirmation clears stale notices", () => {
  const trace = createPrimaryActionTrace("arming clear-image confirmation clears stale notices");
  const state = {
    ...referenceImageLoadedState(),
    notice: {
      kind: "stale-notice",
    },
  };
  const result = witnessApplicationCommand({
    trace,
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assert.deepEqual(result, {
    state: {
      ...referenceImageLoadedState(),
      panelIntent: {
        kind: "confirm-clear-reference-image",
        requestId: 1,
      },
    },
    effects: [
      scheduleClearPanelIntentEffect({
        requestId: 1,
        intentKind: "confirm-clear-reference-image",
      }),
    ],
  });
  assert.deepEqual(trace.edges, activatePrimaryActionEdges([
    "effect.schedule-application-command",
  ]));
});

// Class-a: visible Align pins are the narrower destructive target. The primary
// action must ask to clear pins before it asks to remove the whole image, and
// that confirmation gets the same explicit expiry treatment as image removal.
test("primary action with visible Align pins arms clear-pins confirmation", () => {
  const trace = createPrimaryActionTrace("primary action with visible Align pins arms clear-pins confirmation");
  const state = referenceImageLoadedState({
    pins: [firstPin()],
  });
  const result = witnessApplicationCommand({
    trace,
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assert.deepEqual(result, {
    state: {
      ...state,
      panelIntent: {
        kind: "confirm-clear-pins",
        requestId: 1,
      },
    },
    effects: [
      scheduleClearPanelIntentEffect({
        requestId: 1,
        intentKind: "confirm-clear-pins",
      }),
    ],
  });
  assert.deepEqual(trace.edges, activatePrimaryActionEdges([
    "effect.schedule-application-command",
  ]));
});

// Class-a: once the clear-pins confirmation is active, the primary action
// commits that destructive edit. It clears only registration facts, removes the
// transient confirmation, and persists the surviving image session.
test("primary action confirms clear-pins confirmation durably", () => {
  const trace = createPrimaryActionTrace("primary action confirms clear-pins confirmation durably");
  const result = witnessApplicationCommand({
    trace,
    state: {
      ...referenceImageLoadedState({
        pins: [firstPin()],
      }),
      panelIntent: {
        kind: "confirm-clear-pins",
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assert.deepEqual(result.state.session, referenceImageLoadedState().session);
  assert.equal(result.state.panelIntent, undefined);
  assert.deepEqual(result.effects, [
    persistDurableStateEffect({
      session: referenceImageLoadedState().session,
    }),
  ]);
  assert.deepEqual(trace.edges, activatePrimaryActionEdges([
    "effect.persist-durable-state",
  ]));
});

// Class-a: once clear-image confirmation is active, the primary action removes
// the reference-image session and writes durable null.
test("primary action confirms clear-image confirmation durably", () => {
  const trace = createPrimaryActionTrace("primary action confirms clear-image confirmation durably");
  const result = witnessApplicationCommand({
    trace,
    state: {
      ...referenceImageLoadedState(),
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assert.equal(result.state.session, undefined);
  assert.equal(result.state.panelIntent, undefined);
  assert.deepEqual(result.state.notice, {
    kind: "reference-image-cleared",
  });
  assert.deepEqual(result.effects, [
    persistDurableStateEffect(null),
  ]);
  assert.deepEqual(trace.edges, activatePrimaryActionEdges([
    "effect.persist-durable-state",
  ]));
});

// Class-a: removing an image is user-recoverable. Confirmation must record the
// durable before/after states so Undo can reload the exact removed image without
// preserving transient confirmation state.
test("primary action clear-image confirmation records undoable removal history", () => {
  const trace = createPrimaryActionTrace("primary action clear-image confirmation records undoable removal history");
  const result = witnessApplicationCommand({
    trace,
    state: {
      ...referenceImageLoadedState(),
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assert.equal(result.state.history.past.length, 1);
  assert.deepEqual(result.state.history.future, []);
  assert.deepEqual(result.state.history.past[0].before, {
    session: referenceImageLoadedState().session,
  });
  assert.equal(result.state.history.past[0].after, null);
  assert.deepEqual(result.state.notice, {
    kind: "reference-image-cleared",
  });
  assert.equal(result.state.panelIntent, undefined);
  assert.deepEqual(trace.edges, activatePrimaryActionEdges([
    "effect.persist-durable-state",
  ]));
});

function createPrimaryActionTrace(test) {
  return createFlowTrace({
    file: import.meta.url,
    test,
  });
}

function witnessApplicationCommand({ trace, state, command }) {
  const result = handleApplicationCommand({ state, command });
  const commandNode = `command.${command.kind}`;
  trace.edge(flowEdge(commandNode, "sink.application-state", {
    terminal: "state-result",
  }));
  for (const effect of result.effects) {
    trace.edge(flowEdge(commandNode, `effect.${effect.kind}`, {
      provider: "application",
    }));
  }
  if (result.effects.length === 0) {
    trace.edge(flowEdge(commandNode, "inert.no-effects", {
      terminal: "intentionally-inert",
    }));
  }
  return result;
}

function activatePrimaryActionEdges(effects) {
  return [
    flowEdge("command.activate-primary-action", "sink.application-state", {
      terminal: "state-result",
    }),
    ...effects.map((effect) => flowEdge("command.activate-primary-action", effect, {
      provider: "application",
    })),
  ];
}

function referenceImageLoadedState({ pins } = {}) {
  const session = {
    mode: "align",
    referenceImage: {
      imageDataRef: "reference-image-data-1",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  };
  if (pins !== undefined) {
    session.registration = {
      pins,
    };
  }
  return {
    session,
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

function persistDurableStateEffect(durableState) {
  return {
    kind: "persist-durable-state",
    durableState,
  };
}

function requestReferenceImageInputEffect({ requestId, intent }) {
  return {
    kind: "request-reference-image-input",
    requestId,
    intent,
  };
}

function cancelReferenceImageInputEffect(requestId) {
  return {
    kind: "cancel-reference-image-input",
    requestId,
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

function scheduleClearPanelIntentEffect({ requestId, intentKind }) {
  return {
    kind: "schedule-application-command",
    scheduleId: "panel-intent",
    delayMs: 2500,
    command: {
      kind: "clear-panel-intent",
      requestId,
      intentKind,
    },
  };
}
