import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Class-c: app correlation already makes late outcomes inert, but host input
// resources may still need an explicit cancellation protocol. This test assumes
// that protocol is a new `cancel-reference-image-input` application effect,
// which currently conflicts with the class-a effect vocabulary.
//
// Decision: keep quarantined. The cleanup problem is real, but promotion needs
// a deliberate effect-vocabulary revision, not a local assertion inside input
// cancellation behavior.
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

// Class-c: replacement cancellation has the same unresolved resource boundary
// as initial input. The product result is settled, but the host cleanup effect
// shape is not.
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
