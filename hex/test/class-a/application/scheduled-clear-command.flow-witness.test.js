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

// Class-a: the matching delayed clear is an ordinary application command, not
// runtime cleanup. The app owns the request id comparison and removes only the
// product notice it can prove the timer was scheduled for.
test("matching status clear request removes the current notice", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "matching status clear request removes the current notice",
  });
  const witness = witnessApplicationCommand({
    trace,
    state: {
      notice: {
        kind: "reference-image-input-empty",
        requestId: 2,
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.CLEAR_STATUS_NOTICE,
      { requestId: 2 },
    ),
  });

  assert.deepEqual(witness.result, {
    state: {},
    effects: [],
  });
  assert.deepEqual(trace.edges, inertCommandEdges("command.clear-status-notice"));
});

// Class-a: destructive-confirmation expiry uses the same correlation rule as
// status expiry, but it also names the intent. A late timer for an older or
// different confirmation must not disarm the user's current destructive choice.
test("clear-panel-intent request clears only the matching confirmation", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "clear-panel-intent request clears only the matching confirmation",
  });
  const state = {
    session: {
      mode: "align",
      referenceImage: {
        imageDataRef: "reference-image-data-1",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
    panelIntent: {
      kind: "confirm-clear-reference-image",
      requestId: 2,
    },
  };

  assert.deepEqual(witnessApplicationCommand({
    trace,
    phase: "stale-request",
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.CLEAR_PANEL_INTENT, {
      requestId: 1,
      intentKind: "confirm-clear-reference-image",
    }),
  }).result, {
    state,
    effects: [],
  });

  assert.deepEqual(witnessApplicationCommand({
    trace,
    phase: "wrong-intent",
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.CLEAR_PANEL_INTENT, {
      requestId: 2,
      intentKind: "confirm-clear-pins",
    }),
  }).result, {
    state,
    effects: [],
  });

  assert.deepEqual(witnessApplicationCommand({
    trace,
    phase: "matching-intent",
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.CLEAR_PANEL_INTENT, {
      requestId: 2,
      intentKind: "confirm-clear-reference-image",
    }),
  }).result, {
    state: {
      session: state.session,
    },
    effects: [],
  });

  assert.deepEqual(trace.edges, [
    ...inertCommandEdges("command.clear-panel-intent", {
      phase: "stale-request",
    }),
    ...inertCommandEdges("command.clear-panel-intent", {
      phase: "wrong-intent",
    }),
    ...inertCommandEdges("command.clear-panel-intent", {
      phase: "matching-intent",
    }),
  ]);
});

function witnessApplicationCommand({
  trace,
  state,
  command,
  phase = undefined,
}) {
  const result = handleApplicationCommand({ state, command });
  const attributes = phase === undefined ? {} : { phase };
  const commandNode = `command.${command.kind}`;
  trace.edge(flowEdge(commandNode, "sink.application-state", {
    ...attributes,
    terminal: "state-result",
  }));
  if (result.effects.length === 0) {
    trace.edge(flowEdge(commandNode, "inert.no-effects", {
      ...attributes,
      terminal: "intentionally-inert",
    }));
  }
  return {
    result,
    trace,
  };
}

function inertCommandEdges(commandNode, attributes = {}) {
  return [
    flowEdge(commandNode, "sink.application-state", {
      ...attributes,
      terminal: "state-result",
    }),
    flowEdge(commandNode, "inert.no-effects", {
      ...attributes,
      terminal: "intentionally-inert",
    }),
  ];
}
