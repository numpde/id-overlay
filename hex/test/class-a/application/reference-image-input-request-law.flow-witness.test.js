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

// Class-a: a reference-image input request is self-contained product causality.
// The shell receives the same source-neutral intent that the app records for
// request correlation, so it never inspects app state to infer whether the user
// is loading the first image or replacing an existing one.
test("reference-image input request carries explicit source-neutral intent", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "reference-image input request carries explicit source-neutral intent",
  });
  assert.deepEqual(handleApplicationCommand({
    state: {},
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION),
  }), {
    state: {
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 1,
        intent: {
          kind: "load-reference-image",
        },
      },
    },
    effects: [{
      kind: "request-reference-image-input",
      requestId: 1,
      intent: {
        kind: "load-reference-image",
      },
    }],
  });
  trace.edge(flowEdge("source.application-command", "command.activate-primary-action", {
    phase: "initial-load",
    provider: "application-transition-witness",
  }));
  trace.edge(flowEdge("command.activate-primary-action", "sink.application-state", {
    phase: "initial-load",
    terminal: "state-result",
  }));
  trace.edge(flowEdge("command.activate-primary-action", "sink.declared-effects", {
    phase: "initial-load",
    terminal: "effect-result",
  }));
});

// Class-a: replacement is the same input lifecycle with a different product
// intent. The effect names the runtime work; the intent explains the product
// cause without leaking clipboard, paste, or DOM mechanics into application
// state.
test("replacement input request carries the replacement intent on the effect", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "replacement input request carries the replacement intent on the effect",
  });
  const state = {
    session: {
      mode: "trace",
      referenceImage: normalizedReferenceImage("old"),
    },
  };

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REQUEST_REFERENCE_IMAGE_REPLACEMENT,
    ),
  }), {
    state: {
      session: state.session,
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 1,
        intent: {
          kind: "replace-reference-image",
        },
      },
    },
    effects: [{
      kind: "request-reference-image-input",
      requestId: 1,
      intent: {
        kind: "replace-reference-image",
      },
    }],
  });
  trace.edge(flowEdge("source.application-command", "command.request-reference-image-replacement", {
    phase: "replacement",
    provider: "application-transition-witness",
  }));
  trace.edge(flowEdge("command.request-reference-image-replacement", "sink.application-state", {
    phase: "replacement",
    terminal: "state-result",
  }));
  trace.edge(flowEdge("command.request-reference-image-replacement", "sink.declared-effects", {
    phase: "replacement",
    terminal: "effect-result",
  }));
});

function normalizedReferenceImage(label) {
  return {
    imageDataRef: `reference-image-data-${label}`,
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}
