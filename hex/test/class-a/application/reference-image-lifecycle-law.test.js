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
        status: "awaiting-paste",
        requestId: 1,
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
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
      durableStateChangedEffect({
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
        status: "awaiting-paste",
        requestId: 1,
      },
      notice: {
        kind: "reference-image-paste-empty",
      },
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
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
      durableStateChangedEffect({
        session,
      }),
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
      durableStateChangedEffect(null),
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

function durableStateChangedEffect(durableState) {
  return {
    kind: "durable-state-changed",
    durableState,
  };
}
