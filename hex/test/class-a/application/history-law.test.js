import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Class-a: undo is durable-state replay, not bespoke reverse code per action.
// The latest past record's `before` state becomes the persisted app state and
// the record moves to the redo stack unchanged.
test("undo replays the latest history record before-state durably", () => {
  const record = {
    kind: "load-reference-image",
    undoLabel: "Remove image",
    redoLabel: "Reload image",
    before: null,
    after: referenceImageDurableState(),
  };
  const result = handleApplicationCommand({
    state: {
      ...referenceImageLoadedState(),
      history: {
        past: [record],
        future: [],
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
  });

  assert.deepEqual(result, {
    state: {
      history: {
        past: [],
        future: [record],
      },
    },
    effects: [
      durableStateChangedEffect(null),
    ],
  });
});

function referenceImageLoadedState() {
  return {
    session: normalizedReferenceImageSession(),
  };
}

function referenceImageDurableState() {
  return {
    session: normalizedReferenceImageSession(),
  };
}

function normalizedReferenceImageSession() {
  return {
    mode: "align",
    referenceImage: {
      imageDataRef: "reference-image-data-1",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  };
}

function durableStateChangedEffect(durableState) {
  return {
    kind: "durable-state-changed",
    durableState,
  };
}
