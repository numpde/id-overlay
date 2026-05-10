import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { selectApplicationView } from "../../../application/view-model.js";
import {
  durableStateChangedEffect,
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";

// Class-b, not class-a: record fields and copy may still tighten, but the
// history boundary is principled. Undo/redo replays a semantic record's durable
// before/after states, while the view model exposes that record's user-facing
// labels instead of inventing generic Undo/Redo copy.
test("undoing a load-image history record removes the image and exposes reload", () => {
  const record = {
    kind: "load-reference-image",
    undoLabel: "Remove image",
    redoLabel: "Reload image",
    before: null,
    after: referenceImageDurableState(),
  };
  const state = {
    ...referenceImageLoadedState(),
    history: {
      past: [record],
      future: [],
    },
  };

  assert.deepEqual(selectApplicationView(state).history.undo, {
    enabled: true,
    label: "Remove image",
  });

  const undo = handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
  });

  assert.deepEqual(undo, {
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
  assert.deepEqual(selectApplicationView(undo.state).history.redo, {
    enabled: true,
    label: "Reload image",
  });
});
