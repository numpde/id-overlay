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

// Class-a: the application API receives a normalized reference-image input
// outcome, not a source-specific outcome. Paste is one adapter route; making it
// the product command name would bake an input tactic into every caller,
// history replay, and future non-clipboard input path.
test("reference-image input outcome command is source-agnostic", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "reference-image input outcome command is source-agnostic",
  });
  trace.edge(flowEdge(
    "check.reference-image-input-outcome",
    "command.report-reference-image-input-outcome",
    {
      provider: "application-command-vocabulary",
    },
  ));

  assert.equal(
    APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
    "report-reference-image-input-outcome",
  );
  assert.equal(
    Object.values(APPLICATION_COMMAND_KIND).includes("report-reference-image-paste-outcome"),
    false,
  );
  assert.deepEqual(trace.edges, [
    flowEdge("check.reference-image-input-outcome", "command.report-reference-image-input-outcome", {
      provider: "application-command-vocabulary",
    }),
  ]);
});

// Class-a: source neutrality is not just command naming. The state/effects
// emitted by the input lifecycle must not leak paste or clipboard vocabulary;
// those are adapter tactics, not product facts.
test("reference-image input lifecycle emits no paste or clipboard vocabulary", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "reference-image input lifecycle emits no paste or clipboard vocabulary",
  });
  const lifecycleResults = [
    witnessApplicationCommand({
      trace,
      phase: "request-input",
      state: {},
      command: createApplicationCommand(APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION),
    }),
    witnessApplicationCommand({
      trace,
      phase: "empty-outcome",
      state: awaitingInputState({ requestId: 1 }),
      command: createApplicationCommand(
        APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
        {
          requestId: 1,
          outcome: {
            kind: "empty",
          },
        },
      ),
    }),
    witnessApplicationCommand({
      trace,
      phase: "failed-outcome",
      state: awaitingInputState({ requestId: 2 }),
      command: createApplicationCommand(
        APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
        {
          requestId: 2,
          outcome: {
            kind: "failed",
            reason: "decode-failed",
          },
        },
      ),
    }),
  ];

  const serialized = JSON.stringify(lifecycleResults);
  assert.equal(serialized.includes("paste"), false);
  assert.equal(serialized.includes("clipboard"), false);
  assert.deepEqual(trace.edges, [
    flowEdge("command.activate-primary-action", "sink.application-state", {
      phase: "request-input",
      terminal: "state-result",
    }),
    flowEdge("command.activate-primary-action", "effect.request-reference-image-input", {
      phase: "request-input",
      provider: "application",
    }),
    flowEdge("command.report-reference-image-input-outcome", "sink.application-state", {
      phase: "empty-outcome",
      terminal: "state-result",
    }),
    flowEdge("command.report-reference-image-input-outcome", "effect.schedule-application-command", {
      phase: "empty-outcome",
      provider: "application",
    }),
    flowEdge("command.report-reference-image-input-outcome", "sink.application-state", {
      phase: "failed-outcome",
      terminal: "state-result",
    }),
    flowEdge("command.report-reference-image-input-outcome", "effect.schedule-application-command", {
      phase: "failed-outcome",
      provider: "application",
    }),
  ]);
});

function witnessApplicationCommand({ trace, phase, state, command }) {
  const result = handleApplicationCommand({ state, command });
  const commandNode = `command.${command.kind}`;
  trace.edge(flowEdge(commandNode, "sink.application-state", {
    phase,
    terminal: "state-result",
  }));
  for (const effect of result.effects) {
    trace.edge(flowEdge(commandNode, `effect.${effect.kind}`, {
      phase,
      provider: "application",
    }));
  }
  return result;
}

function awaitingInputState({ requestId }) {
  return {
    referenceImageInput: {
      status: "awaiting-input",
      requestId,
    },
  };
}
