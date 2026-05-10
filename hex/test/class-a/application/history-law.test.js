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

// Class-a: redo is the same durable-state replay in the other direction. The
// latest future record's `after` state becomes persisted state and the record
// moves back to the undo stack unchanged.
test("redo replays the latest history record after-state durably", () => {
  const record = {
    kind: "load-reference-image",
    undoLabel: "Remove image",
    redoLabel: "Reload image",
    before: null,
    after: referenceImageDurableState(),
  };
  const result = handleApplicationCommand({
    state: {
      history: {
        past: [],
        future: [record],
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.REDO),
  });

  assert.deepEqual(result, {
    state: {
      ...referenceImageLoadedState(),
      history: {
        past: [record],
        future: [],
      },
    },
    effects: [
      durableStateChangedEffect(referenceImageDurableState()),
    ],
  });
});

// Class-a: a new durable edit creates a new timeline branch. Even when that
// edit is not itself pushed onto undo history, the previous redo future is no
// longer reachable and must be discarded.
test("new durable edits clear redo future", () => {
  const redoRecord = {
    kind: "move-overlay",
    undoLabel: "Undo move overlay",
    redoLabel: "Redo move overlay",
    before: referenceImageDurableState(),
    after: referenceImageDurableState({
      placement: {
        x: 80,
        y: 40,
        scale: 1,
        rotationRad: 0,
      },
    }),
  };
  const result = handleApplicationCommand({
    state: {
      ...referenceImageLoadedState(),
      history: {
        past: [],
        future: [redoRecord],
      },
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
      history: {
        past: [],
        future: [],
      },
    },
    effects: [
      durableStateChangedEffect(referenceImageDurableState({
        opacity: 0.5,
      })),
    ],
  });
});

function referenceImageLoadedState({ opacity, placement } = {}) {
  return {
    session: normalizedReferenceImageSession({ opacity, placement }),
  };
}

function referenceImageDurableState({ opacity, placement } = {}) {
  return {
    session: normalizedReferenceImageSession({ opacity, placement }),
  };
}

function normalizedReferenceImageSession({ opacity, placement } = {}) {
  const session = {
    mode: "align",
    referenceImage: {
      imageDataRef: "reference-image-data-1",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  };
  if (opacity !== undefined) {
    session.opacity = opacity;
  }
  if (placement !== undefined) {
    session.placement = placement;
  }
  return session;
}

function durableStateChangedEffect(durableState) {
  return {
    kind: "durable-state-changed",
    durableState,
  };
}
