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

// Class-a: once an image is loaded, Trace is a real durable user mode. Changing
// to Trace updates the saved session posture rather than merely toggling view.
test("switching loaded image from Align to Trace changes mode durably", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "switching loaded image from Align to Trace changes mode durably",
  });
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
    mode: "trace",
  });
  const witness = witnessApplicationCommand({
    trace,
    state: referenceImageLoadedState({ mode: "align" }),
    command,
  });

  assert.deepEqual(witness.result, {
    state: {
      ...referenceImageLoadedState({ mode: "trace" }),
      notice: {
        kind: "mode-selected",
        mode: "trace",
      },
    },
    effects: [
      persistDurableStateEffect(referenceImageDurableState({ mode: "trace" })),
    ],
  });
  assert.deepEqual(witness.trace.edges, durableModeChangeEdges());
});

// Class-a: Align is the inverse durable loaded-image mode. Returning to it is
// not an adapter-local toggle; it changes the saved session posture.
test("switching loaded image from Trace to Align changes mode durably", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "switching loaded image from Trace to Align changes mode durably",
  });
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
    mode: "align",
  });
  const witness = witnessApplicationCommand({
    trace,
    state: referenceImageLoadedState({ mode: "trace" }),
    command,
  });

  assert.deepEqual(witness.result, {
    state: {
      ...referenceImageLoadedState({ mode: "align" }),
      notice: {
        kind: "mode-selected",
        mode: "align",
      },
    },
    effects: [
      persistDurableStateEffect(referenceImageDurableState({ mode: "align" })),
    ],
  });
  assert.deepEqual(witness.trace.edges, durableModeChangeEdges());
});

// Class-a: selecting the current loaded mode is a semantic no-op. It must not
// create persistence work, history entries, notices, or a different state.
test("re-selecting the current loaded mode is a no-op", () => {
  for (const mode of ["align", "trace"]) {
    const trace = createFlowTrace({
      file: import.meta.url,
      test: "re-selecting the current loaded mode is a no-op",
    });
    const state = referenceImageLoadedState({ mode });
    const command = createApplicationCommand(
      APPLICATION_COMMAND_KIND.SELECT_MODE,
      { mode },
    );
    const witness = witnessApplicationCommand({
      trace,
      state,
      command,
      attributes: {
        phase: mode,
      },
    });

    assert.deepEqual(witness.result, {
      state,
      effects: [],
    });
    assert.deepEqual(witness.trace.edges, inertCommandEdges({
      phase: mode,
    }));
  }
});

// Class-a: switching mode interrupts any in-progress placement draft. The
// durable mode changes, but the uncommitted preview is discarded instead of
// being saved or carried into the next mode.
test("interrupted placement edit drops preview without changing durable session", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "interrupted placement edit drops preview without changing durable session",
  });
  const state = {
    ...referenceImageLoadedState({ mode: "align" }),
    placementPreview: {
      beforePlacement: null,
      previewPlacement: {
        x: 80,
        y: 40,
        scale: 1,
        rotationRad: 0,
      },
    },
  };

  const witness = witnessApplicationCommand({
    trace,
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: "trace",
    }),
  });

  assert.deepEqual(witness.result, {
    state: {
      ...referenceImageLoadedState({ mode: "trace" }),
      notice: {
        kind: "mode-selected",
        mode: "trace",
      },
    },
    effects: [
      persistDurableStateEffect(referenceImageDurableState({ mode: "trace" })),
    ],
  });
  assert.deepEqual(witness.trace.edges, durableModeChangeEdges());
});

// Class-a: destructive confirmations are tied to the current visible intention.
// A different semantic action must clear the armed confirmation so a stale
// second-click cannot perform a destructive action later.
test("mode switching clears pending destructive confirmation", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "mode switching clears pending destructive confirmation",
  });
  const witness = witnessApplicationCommand({
    trace,
    state: {
      ...referenceImageLoadedState({ mode: "align" }),
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: "trace",
    }),
  });

  assert.deepEqual(witness.result, {
    state: {
      ...referenceImageLoadedState({ mode: "trace" }),
      notice: {
        kind: "mode-selected",
        mode: "trace",
      },
    },
    effects: [
      persistDurableStateEffect(referenceImageDurableState({ mode: "trace" })),
    ],
  });
  assert.deepEqual(witness.trace.edges, durableModeChangeEdges());
});

// Class-a: selecting Trace must never fabricate a placement. Fitting is a
// separate semantic consequence of a successful registration solve; with only
// unsolved pins, Trace changes durable mode and preserves registration for a
// later return to Align.
test("switching to Trace without a solved registration changes mode only", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "switching to Trace without a solved registration changes mode only",
  });
  const state = referenceImageLoadedState({
    mode: "align",
    pins: [firstPin()],
  });
  const expectedState = referenceImageLoadedState({
    mode: "trace",
    pins: [firstPin()],
  });

  const witness = witnessApplicationCommand({
    trace,
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: "trace",
    }),
  });

  assert.deepEqual(witness.result, {
    state: {
      ...expectedState,
      notice: {
        kind: "mode-selected",
        mode: "trace",
      },
    },
    effects: [
      persistDurableStateEffect({
        session: expectedState.session,
      }),
    ],
  });
  assert.deepEqual(witness.trace.edges, durableModeChangeEdges());
});

function witnessApplicationCommand({
  trace,
  state,
  command,
  attributes = {},
}) {
  const result = handleApplicationCommand({ state, command });
  for (const edge of applicationBoundaryEdges({ command, result, attributes })) {
    trace.edge(edge);
  }
  return {
    result,
    trace,
  };
}

function applicationBoundaryEdges({ command, result, attributes = {} }) {
  const commandNode = `command.${command.kind}`;
  const edges = [
    flowEdge(commandNode, "sink.application-state", {
      ...attributes,
      terminal: "state-result",
    }),
  ];

  if (result.effects.length === 0) {
    edges.push(flowEdge(commandNode, "inert.no-effects", {
      ...attributes,
      terminal: "intentionally-inert",
    }));
    return edges;
  }

  for (const effect of result.effects) {
    edges.push(flowEdge(commandNode, `effect.${effect.kind}`, {
      ...attributes,
      provider: "application",
    }));
  }
  return edges;
}

function durableModeChangeEdges() {
  return [
    flowEdge("command.select-mode", "sink.application-state", {
      terminal: "state-result",
    }),
    flowEdge("command.select-mode", "effect.persist-durable-state", {
      provider: "application",
    }),
  ];
}

function inertCommandEdges(attributes = {}) {
  return [
    flowEdge("command.select-mode", "sink.application-state", {
      ...attributes,
      terminal: "state-result",
    }),
    flowEdge("command.select-mode", "inert.no-effects", {
      ...attributes,
      terminal: "intentionally-inert",
    }),
  ];
}

function referenceImageLoadedState({ mode, pins = [] }) {
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
  if (pins.length > 0) {
    session.registration = {
      pins,
    };
  }
  return {
    session,
  };
}

function referenceImageDurableState({ mode }) {
  return {
    session: referenceImageLoadedState({ mode }).session,
  };
}

function persistDurableStateEffect(durableState) {
  return {
    kind: "persist-durable-state",
    durableState,
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
