import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";

// Class-a: accepting a reference image creates the first visible overlay
// session. The canonical first posture is Align, and the new durable session is
// emitted as host work rather than written by the application.
test("accepted reference image creates an Align session and durability effect", () => {
  const referenceImage = normalizedReferenceImage();
  const session = {
    mode: "align",
    referenceImage,
  };

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
          kind: "accepted",
          referenceImage,
        },
      },
    ),
  }), {
    state: {
      session,
    },
    effects: [
      persistDurableStateEffect({
        session,
      }),
    ],
  });
});

// Class-a: accepting an image starts a new loaded session. Stale input prompts,
// notices, and destructive confirmations must not carry into that session.
test("accepted reference image clears pending input notice and panel intent", () => {
  const referenceImage = normalizedReferenceImage();
  const session = {
    mode: "align",
    referenceImage,
  };

  assert.deepEqual(handleApplicationCommand({
    state: {
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 1,
      },
      notice: {
        kind: "reference-image-input-empty",
      },
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: 1,
        outcome: {
          kind: "accepted",
          referenceImage,
        },
      },
    ),
  }), {
    state: {
      session,
    },
    effects: [
      persistDurableStateEffect({
        session,
      }),
    ],
  });
});

// Class-a: empty reference-image input is a normal user-world outcome, not a
// boundary failure. It must end the transient input without creating a session
// or durable work, and the application must declare the correlated status
// expiry rather than making the shell infer timers from notice shape.
test("empty reference-image input outcome ends input without durability", () => {
  const result = handleApplicationCommand({
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

  assert.deepEqual(result, {
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
});

// Class-a: a declared input failure is also a normal user-world outcome. It
// ends the transient input flow without creating an image session or durable
// work, keeps source-neutral failure vocabulary, and schedules status expiry.
test("failed reference-image input outcome ends input without durability", () => {
  const result = handleApplicationCommand({
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

  assert.deepEqual(result, {
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
});

// Class-a: clearing the reference image collapses the app back to no session
// and emits durable clearing. There is no hidden overlay state after removal.
test("clearing the reference image returns to no-session Trace", () => {
  assert.deepEqual(handleApplicationCommand({
    state: referenceImageLoadedState(),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.CLEAR_REFERENCE_IMAGE,
    ),
  }), {
    state: createInitialApplicationState(),
    effects: [
      persistDurableStateEffect(null),
    ],
  });
});

function normalizedReferenceImage() {
  return {
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

function referenceImageLoadedState() {
  return {
    session: {
      mode: "align",
      referenceImage: normalizedReferenceImage(),
    },
  };
}

function persistDurableStateEffect(durableState) {
  return {
    kind: "persist-durable-state",
    durableState,
  };
}

function scheduleClearStatusNoticeEffect(requestId) {
  return {
    kind: "schedule-clear-status-notice",
    requestId,
    delayMs: 2500,
  };
}
