import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Unclassified candidate: app correlation already makes late outcomes inert,
// but that is not enough for browser resources. Manual paste listeners, file
// pickers, and pending decoder work need an explicit product-named cancellation
// effect instead of a shell that infers cleanup by watching state disappear.
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

// Unclassified candidate: replacement cancellation has the same resource
// boundary as initial input, but a different product result: keep the old image.
// The cancel effect is still source-neutral; it cancels reference-image input,
// not a clipboard or paste implementation detail.
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
    kind: "schedule-clear-status-notice",
    requestId,
    delayMs: 2500,
  };
}
