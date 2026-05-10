import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import {
  durableStateChangedEffect,
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";

// Class-b, deliberately not class-a: redo invalidation is a strong history
// principle, but this test proves it through opacity, whose durability and
// non-undoability remain product policy. If a pure history branch primitive
// appears, that primitive should carry the class-a law instead.
test("non-undoable opacity edits clear redo history", () => {
  const redoRecord = {
    kind: "move-overlay",
    undoLabel: "Undo move overlay",
    redoLabel: "Redo move overlay",
    before: {
      session: referenceImageLoadedState().session,
    },
    after: {
      session: {
        ...referenceImageLoadedState().session,
        placement: {
          x: 80,
          y: 40,
          scale: 1,
          rotationRad: 0,
        },
      },
    },
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
