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

// Class-b, deliberately not class-a: exact undo/redo status copy is negotiable.
// The stable user-facing boundary is that successful history replay is not a
// silent state jump; the view exposes transient feedback for the completed
// history action.
test("undo and redo expose transient history feedback", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "undo and redo expose transient history feedback",
  });

  const cases = [
    {
      phase: "load-reference-image",
      record: loadImageHistoryRecord(),
      loaded: true,
      undoStatus: `${imageCopy()} cleared.`,
      redoStatus: `${imageCopy()} reloaded.`,
    },
    {
      phase: "remove-reference-image",
      record: removeImageHistoryRecord(),
      loaded: false,
      undoStatus: `${imageCopy()} reloaded.`,
      redoStatus: `${imageCopy()} cleared.`,
    },
    {
      phase: "replace-reference-image",
      record: replaceImageHistoryRecord(),
      loaded: true,
      undoStatus: "Previous image restored.",
      redoStatus: `${imageCopy()} replaced.`,
    },
    {
      phase: "overlay-placement-edit",
      record: placementHistoryRecord({ editKind: "move" }),
      loaded: true,
      undoStatus: "Overlay move undone.",
      redoStatus: "Overlay move redone.",
    },
    {
      phase: "center-overlay",
      record: placementHistoryRecord({ editKind: "center-overlay" }),
      loaded: true,
      undoStatus: "Overlay center undone.",
      redoStatus: "Overlay center redone.",
    },
    {
      phase: "registration-pin-edit",
      record: registrationPinHistoryRecord(),
      loaded: true,
      undoStatus: "Pin edit undone.",
      redoStatus: "Pin edit redone.",
    },
    {
      phase: "clear-registration-pins",
      record: clearPinsHistoryRecord(),
      loaded: true,
      undoStatus: "Pins restored.",
      redoStatus: "Pins cleared.",
    },
    {
      phase: "fit-registration-placement",
      record: fitHistoryRecord(),
      loaded: true,
      undoStatus: "Overlay fit undone.",
      redoStatus: "Overlay fit redone.",
    },
  ];
  for (const { phase, record, loaded, undoStatus, redoStatus } of cases) {
    const undo = witnessApplicationStatus({
      trace,
      phase,
      state: {
        ...(loaded ? loadedState() : {}),
        history: {
          past: [record],
          future: [],
        },
      },
      command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
    });

    assert.equal(undo.status, undoStatus);
    assert.equal(Object.hasOwn(undo.result.state, "historyFeedback"), false);
    assert.deepEqual(undo.result.viewFeedback, {
      statusNotice: {
        kind: "history-replayed",
        direction: "undo",
        historyKind: record.kind,
        ...(record.editKind === undefined ? {} : {
          editKind: record.editKind,
        }),
      },
    });

    const redo = witnessApplicationStatus({
      trace,
      phase,
      state: undo.result.state,
      command: createApplicationCommand(APPLICATION_COMMAND_KIND.REDO),
    });

    assert.equal(redo.status, redoStatus);
    assert.equal(Object.hasOwn(redo.result.state, "historyFeedback"), false);
    assert.deepEqual(redo.result.viewFeedback, {
      statusNotice: {
        kind: "history-replayed",
        direction: "redo",
        historyKind: record.kind,
        ...(record.editKind === undefined ? {} : {
          editKind: record.editKind,
        }),
      },
    });
  }
  assert.deepEqual(trace.edges, cases.flatMap(({ phase }) => (
    successfulHistoryFeedbackEdges({ phase })
  )));
});

// Class-b: empty history commands are still user actions. They should explain
// why nothing changed instead of silently leaving the user to infer disabled or
// stale state.
test("empty undo and redo expose status feedback without durability", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "empty undo and redo expose status feedback without durability",
  });

  const undo = witnessApplicationStatus({
    trace,
    state: loadedState(),
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
  });
  const redo = witnessApplicationStatus({
    trace,
    state: loadedState(),
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.REDO),
  });

  assert.equal(undo.status, "Nothing to undo.");
  assert.equal(redo.status, "Nothing to redo.");
  assert.deepEqual(trace.edges, [
    flowEdge("command.undo", "sink.application-state", {
      terminal: "state-result",
    }),
    flowEdge("command.undo", "inert.no-effects", {
      terminal: "intentionally-inert",
    }),
    flowEdge("command.undo", "sink.application-view.status", {
      terminal: "view-result",
    }),
    flowEdge("command.redo", "sink.application-state", {
      terminal: "state-result",
    }),
    flowEdge("command.redo", "inert.no-effects", {
      terminal: "intentionally-inert",
    }),
    flowEdge("command.redo", "sink.application-view.status", {
      terminal: "view-result",
    }),
  ]);
});

function witnessApplicationStatus({ trace, state, command, phase }) {
  const result = handleApplicationCommand({ state, command });
  traceApplicationResult({ trace, command, result, phase });
  const view = selectApplicationView(result.state, result.viewFeedback ?? null);
  trace.edge(flowEdge(`command.${command.kind}`, "sink.application-view.status", {
    ...(phase === undefined ? {} : { phase }),
    terminal: "view-result",
  }));
  return {
    result,
    status: view.status,
  };
}

function traceApplicationResult({ trace, command, result, phase }) {
  const commandNode = `command.${command.kind}`;
  trace.edge(flowEdge(commandNode, "sink.application-state", {
    ...(phase === undefined ? {} : { phase }),
    terminal: "state-result",
  }));
  if (result.effects.length === 0) {
    trace.edge(flowEdge(commandNode, "inert.no-effects", {
      ...(phase === undefined ? {} : { phase }),
      terminal: "intentionally-inert",
    }));
    return;
  }
  for (const effect of result.effects) {
    trace.edge(flowEdge(commandNode, `effect.${effect.kind}`, {
      ...(phase === undefined ? {} : { phase }),
      provider: "application",
    }));
  }
}

function successfulHistoryFeedbackEdges({ phase }) {
  return [
    flowEdge("command.undo", "sink.application-state", {
      phase,
      terminal: "state-result",
    }),
    flowEdge("command.undo", "effect.persist-durable-state", {
      phase,
      provider: "application",
    }),
    flowEdge("command.undo", "sink.application-view.status", {
      phase,
      terminal: "view-result",
    }),
    flowEdge("command.redo", "sink.application-state", {
      phase,
      terminal: "state-result",
    }),
    flowEdge("command.redo", "effect.persist-durable-state", {
      phase,
      provider: "application",
    }),
    flowEdge("command.redo", "sink.application-view.status", {
      phase,
      terminal: "view-result",
    }),
  ];
}

function imageCopy() {
  return ["Im", "age"].join("");
}

function loadImageHistoryRecord() {
  return {
    kind: "load-reference-image",
    before: null,
    after: loadedDurableState(),
  };
}

function loadedState() {
  return {
    session: loadedDurableState().session,
  };
}

function loadedDurableState() {
  return {
    session: {
      mode: "align",
      referenceImage: {
        imageDataRef: "image-data-ref:history",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
  };
}

function removedDurableState() {
  return null;
}

function oldLoadedDurableState() {
  return {
    session: {
      mode: "align",
      referenceImage: {
        imageDataRef: "image-data-ref:old",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
  };
}

function replacementDurableState() {
  return {
    session: {
      mode: "align",
      referenceImage: {
        imageDataRef: "image-data-ref:new",
        intrinsicSizePx: {
          width: 320,
          height: 240,
        },
      },
    },
  };
}

function removeImageHistoryRecord() {
  return {
    kind: "remove-reference-image",
    before: loadedDurableState(),
    after: removedDurableState(),
  };
}

function replaceImageHistoryRecord() {
  return {
    kind: "replace-reference-image",
    before: oldLoadedDurableState(),
    after: replacementDurableState(),
  };
}

function placementHistoryRecord({ editKind }) {
  return {
    kind: "overlay-placement-edit",
    editKind,
    before: {
      placement: null,
      solvedRegistration: null,
    },
    after: {
      placement: {
        x: 10,
        y: 20,
        scale: 1,
        rotationRad: 0,
      },
      solvedRegistration: null,
    },
  };
}

function registrationPinHistoryRecord() {
  return {
    kind: "registration-pin-edit",
    before: loadedDurableState(),
    after: {
      session: {
        ...loadedDurableState().session,
        registration: {
          pins: [{
            id: 1,
            imagePx: { x: 10, y: 20 },
            mapLatLon: { lat: 1, lon: 2 },
          }],
        },
      },
    },
  };
}

function clearPinsHistoryRecord() {
  return {
    kind: "clear-registration-pins",
    before: registrationPinHistoryRecord().after,
    after: loadedDurableState(),
  };
}

function fitHistoryRecord() {
  return {
    kind: "fit-registration-placement",
    before: registrationPinHistoryRecord().after,
    after: {
      session: {
        ...registrationPinHistoryRecord().after.session,
        mode: "trace",
        placement: {
          x: 10,
          y: 20,
          scale: 1,
          rotationRad: 0,
        },
      },
    },
  };
}
