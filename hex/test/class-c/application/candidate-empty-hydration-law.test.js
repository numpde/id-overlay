import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";

// Class-c candidate for class-a: startup with no durable data is a pure
// canonicalization step. It must not ask the outside world to do anything.

test("hydrating no durable state returns canonical empty state with no effects", () => {
  for (const durableState of [null, {}]) {
    const result = handleApplicationCommand({
      state: createInitialApplicationState(),
      command: createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
        durableState,
      }),
    });

    assert.deepEqual(result, {
      state: {},
      effects: [],
    });
  }
});
