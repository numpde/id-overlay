import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";
import { assertPlainData } from "../../class-b/application/plain-data-assertions.js";

// Unclassified candidate: this generalizes the class-a reducer-envelope law
// beyond one command. It should be promoted only if this exact broad contract
// stays useful once real commands exist.
test("successful command results are plain state/effects envelopes only", () => {
  for (const { state, command } of [
    {
      state: createInitialApplicationState(),
      command: createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
        durableState: null,
      }),
    },
    {
      state: createInitialApplicationState(),
      command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
        mode: "trace",
      }),
    },
    {
      state: createInitialApplicationState(),
      command: createApplicationCommand(
        APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
      ),
    },
  ]) {
    const result = handleApplicationCommand({ state, command });

    assertPlainData(result);
    assert.deepEqual(Object.keys(result).sort(), ["effects", "state"]);
    assert.equal(Array.isArray(result.effects), true);
  }
});

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
