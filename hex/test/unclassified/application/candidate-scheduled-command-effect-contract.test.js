import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Unclassified candidate: timer effects should carry the exact future
// application command. The shell owns clocks only; it must not translate a
// generic `timer-fired` fact into product meaning after the delay.
test("status notices schedule an exact application command", () => {
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
});

// Unclassified candidate: confirmations use the same delayed-command protocol
// as status notices. The only difference is the future app command payload,
// which includes the product intent identity needed for stale rejection.
test("destructive confirmations schedule an exact application command", () => {
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
