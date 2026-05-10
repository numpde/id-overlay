import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Class-a: opacity is durable visual state, not semantic history. Changing it
// persists the session and preserves the existing undo past without appending a
// new history record.
test("opacity changes are durable but not undoable", () => {
  const history = {
    past: [{
      kind: "remove-reference-image",
      undoLabel: "Reload image",
      redoLabel: "Remove image",
      before: referenceImageDurableState(),
      after: null,
    }],
    future: [],
  };
  const result = handleApplicationCommand({
    state: {
      ...referenceImageLoadedState(),
      history,
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SET_OPACITY, {
      opacity: 0.5,
    }),
  });

  assert.deepEqual(result, {
    state: {
      ...referenceImageLoadedState({
        opacity: 0.5,
      }),
      history,
    },
    effects: [
      durableStateChangedEffect(referenceImageDurableState({
        opacity: 0.5,
      })),
    ],
  });
});

// Class-a: because opacity is durable visual state, hydration must restore it.
// Otherwise opacity would be a write-only setting that disappears across
// extension restarts.
test("durable opacity hydrates into the session", () => {
  const durableState = referenceImageDurableState({
    opacity: 0.5,
  });

  assert.deepEqual(handleApplicationCommand({
    state: {},
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
      durableState,
    }),
  }), {
    state: referenceImageLoadedState({
      opacity: 0.5,
    }),
    effects: [],
  });
});

function referenceImageLoadedState({ opacity } = {}) {
  const session = normalizedReferenceImageSession();
  if (opacity !== undefined) {
    session.opacity = opacity;
  }
  return {
    session,
  };
}

function referenceImageDurableState({ opacity } = {}) {
  return {
    session: referenceImageLoadedState({ opacity }).session,
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
