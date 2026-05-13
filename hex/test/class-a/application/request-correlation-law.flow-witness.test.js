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

// Class-a: asynchronous input is correlated by request identity. This is
// promoted because a stale host result must never overwrite newer user intent,
// regardless of which adapter produced the result.
test("stale reference-image input outcomes are ignored", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "stale reference-image input outcomes are ignored",
  });
  const state = {
    referenceImageInput: {
      status: "awaiting-input",
      requestId: 2,
    },
  };
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
    {
      requestId: 1,
      outcome: {
        kind: "accepted",
        referenceImage: {
          imageDataRef: "reference-image-data-1",
          intrinsicSizePx: {
            width: 640,
            height: 480,
          },
        },
      },
    },
  );

  assert.deepEqual(witnessApplicationCommand({ trace, state, command }), {
    state,
    effects: [],
  });
  assert.deepEqual(
    trace.edges,
    inertCommandEdges("command.report-reference-image-input-outcome"),
  );
});

// Class-a: cancelling input removes the active request. A later host result for
// that cancelled request must not resurrect a session or erase the cancellation
// notice, independent of which input adapter produced the late result.
test("cancelled reference-image input ignores later success", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "cancelled reference-image input ignores later success",
  });
  const armed = handleApplicationCommand({
    state: {},
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  }).state;
  const cancelled = handleApplicationCommand({
    state: armed,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  }).state;

  assert.deepEqual(witnessApplicationCommand({
    trace,
    state: cancelled,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: armed.referenceImageInput.requestId,
        outcome: {
          kind: "accepted",
          referenceImage: {
            imageDataRef: "reference-image-data-1",
            intrinsicSizePx: {
              width: 640,
              height: 480,
            },
          },
        },
      },
    ),
  }), {
    state: cancelled,
    effects: [],
  });
  assert.deepEqual(
    trace.edges,
    inertCommandEdges("command.report-reference-image-input-outcome"),
  );
});

// Class-a: delayed status clearing is also request-correlated. An older clear
// request must not erase a newer notice that reached the app after scheduling.
test("stale status clear requests are ignored", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "stale status clear requests are ignored",
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
    notice: {
      kind: "reference-image-input-empty",
      requestId: 2,
    },
  };

  assert.deepEqual(witnessApplicationCommand({
    trace,
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.CLEAR_STATUS_NOTICE,
      { requestId: 1 },
    ),
  }), {
    state,
    effects: [],
  });
  assert.deepEqual(
    trace.edges,
    inertCommandEdges("command.clear-status-notice"),
  );
});

function witnessApplicationCommand({ trace, state, command }) {
  const result = handleApplicationCommand({ state, command });
  const commandNode = `command.${command.kind}`;
  trace.edge(flowEdge(commandNode, "sink.application-state", {
    terminal: "state-result",
  }));
  if (result.effects.length === 0) {
    trace.edge(flowEdge(commandNode, "inert.no-effects", {
      terminal: "intentionally-inert",
    }));
  }
  return result;
}

function inertCommandEdges(commandNode) {
  return [
    flowEdge(commandNode, "sink.application-state", {
      terminal: "state-result",
    }),
    flowEdge(commandNode, "inert.no-effects", {
      terminal: "intentionally-inert",
    }),
  ];
}
