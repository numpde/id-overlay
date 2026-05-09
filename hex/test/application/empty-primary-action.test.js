import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../application/command.js";
import { handleApplicationCommand } from "../../application/handle-command.js";
import { createInitialApplicationState } from "../../application/state.js";
import { assertApplicationResult } from "./application-result-assertions.js";
import { assertPlainData } from "./plain-data-assertions.js";

// First real use case: with no session, the primary action starts the smallest
// observable product flow. The UI reports "primary action activated"; the
// application, not the UI adapter, decides that this means waiting for a pasted
// reference image.

test("application command vocabulary includes primary action activation", () => {
  assert.equal(
    APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    "activate-primary-action",
  );

  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
  );

  assertPlainData(command);
  assert.deepEqual(command, {
    kind: "activate-primary-action",
  });
});

// Starting this flow is state, not an effect. The shell can observe the state
// and translate a later paste into another application command; the application
// should not invent a platform port just to arm the UI.
test("activating the primary action with no session waits for a pasted reference image", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
  );

  const result = handleApplicationCommand({ state, command });

  assertApplicationResult(result, {
    state: {
      referenceImageInput: {
        status: "awaiting-paste",
      },
    },
    effects: [],
  });
});
