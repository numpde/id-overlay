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

// Class-b, not class-a: opacity policy could still be retuned, but the current
// product choice is deliberate. Opacity is a durable visual setting, not a
// semantic undo step, so changing it persists the session while preserving the
// existing undo past without appending a new record.
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

// Class-b for the same reason: if opacity is persisted, hydration must accept
// it as part of the durable reference-image session. Otherwise opacity would be
// a write-only setting that breaks on the next extension start.
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
