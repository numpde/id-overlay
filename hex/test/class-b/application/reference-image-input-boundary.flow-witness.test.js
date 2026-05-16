import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import {
  assertApplicationResult,
} from "./application-result-assertions.js";
import { assertPlainData } from "./plain-data-assertions.js";
import {
  acceptedReferenceImageInputPayload,
  normalizedReferenceImage,
} from "./reference-image-fixtures.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: this is command-factory API shape. Class-a
// owns the behavior: async input outcomes are request-correlated and stale
// results are ignored. This harness only keeps the current command boundary
// from dropping correlation before the command reaches the app.
test("reference-image input outcome command is correlated plain data", () => {
  const trace = createReferenceImageInputBoundaryTrace(
    "reference-image input outcome command is correlated plain data",
  );
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
    acceptedReferenceImageInputPayload(),
  );
  trace.edge(flowEdge(
    "check.reference-image-input-outcome-command",
    "command.report-reference-image-input-outcome",
    {
      provider: "application-command-vocabulary",
    },
  ));

  assertPlainData(command);
  assert.deepEqual(command, {
    kind: APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
    requestId: 1,
    outcome: {
      kind: "accepted",
      referenceImage: normalizedReferenceImage(),
    },
  });
  assert.deepEqual(trace.edges, [
    flowEdge(
      "check.reference-image-input-outcome-command",
      "command.report-reference-image-input-outcome",
      {
        provider: "application-command-vocabulary",
      },
    ),
  ]);
});

// Class-b, deliberately not class-a: class-a owns the empty-input product law.
// This keeps only the current transient notice vocabulary, status-expiry
// request, and correlation id shape used by the panel/status boundary.
test("empty reference-image input outcome becomes a correlated notice", () => {
  const trace = createReferenceImageInputBoundaryTrace(
    "empty reference-image input outcome becomes a correlated notice",
  );
  const result = witnessApplicationCommand({
    trace,
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

  assertApplicationResult(result, {
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
  assert.deepEqual(trace.edges, correlatedNoticeEdges());
});

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

// Class-b, deliberately not class-a: class-a owns failed input as a normal
// non-durable outcome. This keeps only the current transient notice vocabulary,
// including the data-only reason, request id, and status-expiry effect shape.
test("failed reference-image input outcome becomes a correlated notice", () => {
  const trace = createReferenceImageInputBoundaryTrace(
    "failed reference-image input outcome becomes a correlated notice",
  );
  const result = witnessApplicationCommand({
    trace,
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

  assertApplicationResult(result, {
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
  assert.deepEqual(trace.edges, correlatedNoticeEdges());
});

function createReferenceImageInputBoundaryTrace(test) {
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

function correlatedNoticeEdges() {
  return [
    flowEdge("command.report-reference-image-input-outcome", "sink.application-state", {
      terminal: "state-result",
    }),
    flowEdge("command.report-reference-image-input-outcome", "effect.schedule-application-command", {
      provider: "application",
    }),
  ];
}
