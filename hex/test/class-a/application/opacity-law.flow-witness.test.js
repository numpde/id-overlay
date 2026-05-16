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

// Class-a: opacity is durable visual state, not semantic history. Changing it
// persists the session and preserves the existing undo past without appending a
// new history record.
test("opacity changes are durable but not undoable", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "opacity changes are durable but not undoable",
  });
  const history = {
    past: [{
      kind: "remove-reference-image",
      undoLabel: "Reload image",
      redoLabel: "Remove image",
      before: referenceImageDurableState(),
      after: null,
    }],
    future: [],
  };
  const witness = witnessApplicationCommand({
    trace,
    state: {
      ...referenceImageLoadedState(),
      history,
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SET_OPACITY, {
      opacity: 0.5,
    }),
  });

  assert.deepEqual(witness.result, {
    state: {
      ...referenceImageLoadedState({
        opacity: 0.5,
      }),
      history,
    },
    effects: [
      persistDurableStateEffect(referenceImageDurableState({
        opacity: 0.5,
      })),
    ],
  });
  assert.deepEqual(trace.edges, durableOpacityChangeEdges());
});

// Class-a: opacity is a visible reference-image setting in both Align and
// Trace. Trace disables placement/pin editing, but it must not make opacity
// read-only or turn opacity changes into history.
test("opacity changes are durable in Trace mode", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "opacity changes are durable in Trace mode",
  });
  const history = {
    past: [{
      kind: "overlay-placement-edit",
      editKind: "move",
      before: {
        placement: null,
        solvedRegistration: null,
      },
      after: {
        placement: {
          x: 80,
          y: 40,
          scale: 1,
          rotationRad: 0,
        },
        solvedRegistration: null,
      },
    }],
    future: [],
  };
  const witness = witnessApplicationCommand({
    trace,
    state: {
      ...referenceImageLoadedState({
        mode: "trace",
      }),
      history,
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SET_OPACITY, {
      opacity: 0.5,
    }),
  });

  assert.deepEqual(witness.result, {
    state: {
      ...referenceImageLoadedState({
        mode: "trace",
        opacity: 0.5,
      }),
      history,
    },
    effects: [
      persistDurableStateEffect(referenceImageDurableState({
        mode: "trace",
        opacity: 0.5,
      })),
    ],
  });
  assert.deepEqual(trace.edges, durableOpacityChangeEdges());
});

// Class-a: because opacity is durable visual state, hydration must restore it.
// Otherwise opacity would be a write-only setting that disappears across
// extension restarts.
test("durable opacity hydrates into the session", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "durable opacity hydrates into the session",
  });
  const durableState = referenceImageDurableState({
    opacity: 0.5,
  });
  const witness = witnessApplicationCommand({
    trace,
    state: {},
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
      durableState,
    }),
  });

  assert.deepEqual(witness.result, {
    state: referenceImageLoadedState({
      opacity: 0.5,
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

function witnessApplicationCommand({ trace, state, command }) {
  const result = handleApplicationCommand({ state, command });
  traceApplicationResult({ trace, command, result });
  return {
    result,
    trace,
  };
}

function traceApplicationResult({ trace, command, result }) {
  const commandNode = `command.${command.kind}`;
  trace.edge(flowEdge(commandNode, "sink.application-state", {
    terminal: "state-result",
  }));
  if (result.effects.length === 0) {
    trace.edge(flowEdge(commandNode, "inert.no-effects", {
      terminal: "intentionally-inert",
    }));
    return;
  }
  for (const effect of result.effects) {
    trace.edge(flowEdge(commandNode, `effect.${effect.kind}`, {
      provider: "application",
    }));
  }
}

function durableOpacityChangeEdges() {
  return [
    flowEdge("command.set-opacity", "sink.application-state", {
      terminal: "state-result",
    }),
    flowEdge("command.set-opacity", "effect.persist-durable-state", {
      provider: "application",
    }),
  ];
}

function referenceImageLoadedState({ mode = "align", opacity } = {}) {
  const session = normalizedReferenceImageSession({ mode });
  if (opacity !== undefined) {
    session.opacity = opacity;
  }
  return {
    session,
  };
}

function referenceImageDurableState({ mode = "align", opacity } = {}) {
  return {
    session: referenceImageLoadedState({ mode, opacity }).session,
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

function persistDurableStateEffect(durableState) {
  return {
    kind: "persist-durable-state",
    durableState,
  };
}
