import test from "node:test";
import assert from "node:assert/strict";

import {
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { selectDurableApplicationState } from "../../../application/view-model.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

const SET_TEMPORARY_INPUT_POSTURE = "set-temporary-input-posture";

// Class-a: temporary native-map access is visible application state, not
// adapter-local state and not durable product mode. Holding a temporary posture
// must keep the saved mode intact while making the overlay inert.
test("temporary input posture is application-owned and non-durable", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "temporary input posture is application-owned and non-durable",
  });
  const initialState = referenceImageLoadedState({
    mode: "align",
  });

  const enterCommand = createApplicationCommand(SET_TEMPORARY_INPUT_POSTURE, {
    posture: "native-map",
  });
  const enter = handleApplicationCommand({
    state: initialState,
    command: enterCommand,
  });
  traceApplicationResult({
    trace,
    command: enterCommand,
    result: enter,
    phase: "enter",
  });
  assert.deepEqual(enter.state, {
    ...initialState,
    inputOverride: {
      kind: "temporary-native-map-access",
    },
  });
  assert.deepEqual(enter.effects, []);
  assert.deepEqual(selectDurableApplicationState(enter.state), initialState);

  const exitCommand = createApplicationCommand(SET_TEMPORARY_INPUT_POSTURE, {
    posture: "normal",
  });
  const exit = handleApplicationCommand({
    state: enter.state,
    command: exitCommand,
  });
  traceApplicationResult({
    trace,
    command: exitCommand,
    result: exit,
    phase: "exit",
  });
  assert.deepEqual(exit.state, initialState);
  assert.deepEqual(exit.effects, []);
  assert.deepEqual(trace.edges, [
    ...inertCommandEdges("command.set-temporary-input-posture", { phase: "enter" }),
    ...inertCommandEdges("command.set-temporary-input-posture", { phase: "exit" }),
  ]);
});

// Class-a: the command payload names semantic posture only. Source mechanics
// such as key names, active booleans, or Trace mode aliases belong in adapters
// or interaction mapping, never in the replayable application command.
test("temporary input posture command accepts only semantic posture payloads", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "temporary input posture command accepts only semantic posture payloads",
  });
  trace.edge(flowEdge(
    "check.set-temporary-input-posture-command",
    "command.set-temporary-input-posture",
    {
      provider: "application-command-vocabulary",
    },
  ));

  assert.deepEqual(createApplicationCommand(SET_TEMPORARY_INPUT_POSTURE, {
    posture: "native-map",
  }), {
    kind: SET_TEMPORARY_INPUT_POSTURE,
    posture: "native-map",
  });
  assert.deepEqual(createApplicationCommand(SET_TEMPORARY_INPUT_POSTURE, {
    posture: "normal",
  }), {
    kind: SET_TEMPORARY_INPUT_POSTURE,
    posture: "normal",
  });

  for (const payload of [
    {},
    {
      active: true,
    },
    {
      key: "Space",
    },
    {
      posture: "trace",
    },
  ]) {
    assert.throws(() => createApplicationCommand(SET_TEMPORARY_INPUT_POSTURE, payload));
  }
  assert.deepEqual(trace.edges, [
    flowEdge("check.set-temporary-input-posture-command", "command.set-temporary-input-posture", {
      provider: "application-command-vocabulary",
    }),
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

function referenceImageLoadedState({ mode }) {
  return {
    session: {
      mode,
      referenceImage: {
        imageDataRef: "data:image/png;base64,reference-image",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
  };
}
