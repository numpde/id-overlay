import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";

// Unclassified candidate: empty durable hydration is probably the universal
// "no prior session" contract, but keep it proposal-level until hydration
// replacement semantics are implemented.
test("empty durable hydration returns canonical initial state with no effects", () => {
  assert.deepEqual(handleApplicationCommand({
    state: createInitialApplicationState(),
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
      durableState: null,
    }),
  }), {
    state: createInitialApplicationState(),
    effects: [],
  });
});
