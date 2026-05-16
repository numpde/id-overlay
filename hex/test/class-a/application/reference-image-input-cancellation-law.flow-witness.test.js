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

// Class-a: app correlation makes late outcomes inert, but host input resources
// still need an explicit cleanup signal. Cancellation is therefore both a
// product transition and correlated runtime work; bootstrap must route this
// effect to the input port instead of silently abandoning host state.
test("cancelling initial reference-image input emits a correlated cancel effect", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "cancelling initial reference-image input emits a correlated cancel effect",
  });
  const witness = witnessApplicationCommand({
    trace,
    state: awaitingInputState({
      intent: {
        kind: "load-reference-image",
      },
    }),
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION),
  });

  assert.deepEqual(witness.result, {
    state: {
      notice: {
        kind: "reference-image-input-cancelled",
        requestId: 1,
      },
    },
    effects: [
      {
        kind: "cancel-reference-image-input",
        requestId: 1,
      },
      scheduleClearStatusNoticeEffect(1),
    ],
  });
  assert.deepEqual(trace.edges, cancellationEdges());
});

// Class-a: replacement cancellation has the same cleanup boundary as initial
// input. The old image stays visible, and the matching host input flow is
// cancelled by request id.
test("cancelling replacement input preserves the old image and cancels host input", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "cancelling replacement input preserves the old image and cancels host input",
  });
  const state = {
    session: {
      mode: "align",
      referenceImage: normalizedReferenceImage(),
    },
    referenceImageInput: {
      status: "awaiting-input",
      requestId: 1,
      intent: {
        kind: "replace-reference-image",
      },
    },
  };
  const witness = witnessApplicationCommand({
    trace,
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION),
  });

  assert.deepEqual(witness.result, {
    state: {
      session: state.session,
      notice: {
        kind: "reference-image-replacement-cancelled",
        requestId: 1,
      },
    },
    effects: [
      {
        kind: "cancel-reference-image-input",
        requestId: 1,
      },
      scheduleClearStatusNoticeEffect(1),
    ],
  });
  assert.deepEqual(trace.edges, cancellationEdges());
});

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
  return {
    result,
    trace,
  };
}

function cancellationEdges() {
  return [
    flowEdge("command.activate-primary-action", "sink.application-state", {
      terminal: "state-result",
    }),
    flowEdge("command.activate-primary-action", "effect.cancel-reference-image-input", {
      provider: "application",
    }),
    flowEdge("command.activate-primary-action", "effect.schedule-application-command", {
      provider: "application",
    }),
  ];
}

function awaitingInputState({ intent }) {
  return {
    referenceImageInput: {
      status: "awaiting-input",
      requestId: 1,
      intent,
    },
  };
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
