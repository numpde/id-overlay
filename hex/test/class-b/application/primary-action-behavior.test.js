import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import {
  firstPin,
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";

// Class-b, deliberately not class-a: class-a owns the durable clear-pins
// transition; this notice is transient user feedback. Keep it here so the panel
// can report the actual completed action without freezing notice vocabulary as
// a non-negotiable product law.
test("primary action clear-pins confirmation emits cleared-pins notice", () => {
  const result = handleApplicationCommand({
    state: {
      ...referenceImageLoadedState({
        pins: [firstPin()],
      }),
      panelIntent: {
        kind: "confirm-clear-pins",
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assert.deepEqual(result.state.notice, {
    kind: "cleared-pins",
    count: 1,
  });
});

// Class-b, deliberately not class-a: class-a owns the undoable before/after
// history record for image removal. This test keeps only the weaker current
// product copy for the history affordance: Undo should say what it will do.
test("primary action clear-image confirmation labels reloadable history", () => {
  const result = handleApplicationCommand({
    state: {
      ...referenceImageLoadedState(),
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assert.equal(result.state.history.past[0].undoLabel, "Reload image");
  assert.equal(result.state.history.past[0].redoLabel, "Remove image");
});
