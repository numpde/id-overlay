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

// Class-a: delayed product behavior leaves the app as an exact future
// application command. The runtime owns clocks; it must not infer which status
// or confirmation to clear by reading app state later.
test("status notices schedule an exact application command", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "status notices schedule an exact application command",
  });
  assert.deepEqual(handleApplicationCommand({
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
  }), {
    state: {
      notice: {
        kind: "reference-image-input-empty",
        requestId: 1,
      },
    },
    effects: [
      scheduleApplicationCommandEffect({
        scheduleId: "status-notice",
        delayMs: 2500,
        command: {
          kind: "clear-status-notice",
          requestId: 1,
        },
      }),
    ],
  });
  trace.edge(flowEdge("source.application-command", "command.report-reference-image-input-outcome", {
    phase: "status-notice",
    provider: "application-transition-witness",
  }));
  trace.edge(flowEdge("command.report-reference-image-input-outcome", "sink.application-state", {
    phase: "status-notice",
    terminal: "state-result",
  }));
  trace.edge(flowEdge("command.report-reference-image-input-outcome", "sink.declared-effects", {
    phase: "status-notice",
    terminal: "effect-result",
  }));
});

// Class-a: confirmation expiry uses the same delayed-command protocol as status
// expiry. The application still owns request matching and stale rejection when
// the scheduled command eventually re-enters.
test("destructive confirmations schedule an exact application command", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "destructive confirmations schedule an exact application command",
  });
  const state = referenceImageLoadedState();

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION),
  }), {
    state: {
      ...state,
      panelIntent: {
        kind: "confirm-clear-reference-image",
        requestId: 1,
      },
    },
    effects: [
      scheduleApplicationCommandEffect({
        scheduleId: "panel-intent",
        delayMs: 2500,
        command: {
          kind: "clear-panel-intent",
          requestId: 1,
          intentKind: "confirm-clear-reference-image",
        },
      }),
    ],
  });
  trace.edge(flowEdge("source.application-command", "command.activate-primary-action", {
    phase: "panel-intent",
    provider: "application-transition-witness",
  }));
  trace.edge(flowEdge("command.activate-primary-action", "sink.application-state", {
    phase: "panel-intent",
    terminal: "state-result",
  }));
  trace.edge(flowEdge("command.activate-primary-action", "sink.declared-effects", {
    phase: "panel-intent",
    terminal: "effect-result",
  }));
});

function scheduleApplicationCommandEffect({ scheduleId, delayMs, command }) {
  return {
    kind: "schedule-application-command",
    scheduleId,
    delayMs,
    command,
  };
}

function referenceImageLoadedState() {
  return {
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
  };
}
