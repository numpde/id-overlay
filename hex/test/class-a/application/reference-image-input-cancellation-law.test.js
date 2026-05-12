import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Class-a: app correlation makes late outcomes inert, but host input resources
// still need an explicit cleanup signal. Cancellation is therefore both a
// product transition and correlated runtime work; bootstrap must route this
// effect to the input port instead of silently abandoning host state.
test("cancelling initial reference-image input emits a correlated cancel effect", () => {
  assert.deepEqual(handleApplicationCommand({
    state: awaitingInputState({
      intent: {
        kind: "load-reference-image",
      },
    }),
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION),
  }), {
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
});

// Class-a: replacement cancellation has the same cleanup boundary as initial
// input. The old image stays visible, and the matching host input flow is
// cancelled by request id.
test("cancelling replacement input preserves the old image and cancels host input", () => {
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

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION),
  }), {
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
});

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
