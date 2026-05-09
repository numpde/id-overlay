import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../application/command.js";
import { handleApplicationCommand } from "../../application/handle-command.js";
import { createApplicationResult } from "../../application/result.js";
import { createInitialApplicationState } from "../../application/state.js";
import { EFFECT_REQUEST_KIND } from "../../ports/effect-request.js";
import { assertApplicationResult } from "./application-result-assertions.js";
import { assertPlainData } from "./plain-data-assertions.js";

// This file defines the behavior-independent application seam: explicit
// commands in, explicit results out, no implicit effects or hidden platform
// work. Product-specific behavior belongs in focused use-case tests.

test("application command vocabulary starts with an explicit no-op command", () => {
  assert.equal(Object.isFrozen(APPLICATION_COMMAND_KIND), true);
  assert.equal(APPLICATION_COMMAND_KIND.NOOP, "noop");

  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.NOOP);

  assertPlainData(command);
  assert.deepEqual(command, { kind: "noop" });
});

// The first state is deliberately empty as a no-session baseline. Product
// fields should appear only after a use case actually needs them.
test("initial application state is plain data", () => {
  const state = createInitialApplicationState();

  assertPlainData(state);
  assert.deepEqual(state, {});
});

// No-op defines the zero-behavior baseline: it should not invent state changes
// or effect work before product commands exist.
test("no-op command returns unchanged state and no effect requests", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.NOOP);

  const result = handleApplicationCommand({ state, command });

  assertApplicationResult(result, {
    state,
    effects: [],
  });
});

// Results are the one application exit shape. Effects are data for the shell to
// execute later, never callbacks, promises, or adapter handles.
test("application results are explicit plain state plus effect request list", () => {
  const state = createInitialApplicationState();

  const result = createApplicationResult({
    state,
    effects: [],
  });

  assertApplicationResult(result, {
    state,
    effects: [],
  });
});

// Empty vocabulary is still vocabulary. The first real effect should extend
// this object deliberately instead of smuggling ad hoc effect names in results.
test("effect request vocabulary is explicit even before product effects exist", () => {
  assert.equal(Object.isFrozen(EFFECT_REQUEST_KIND), true);
  assert.deepEqual(EFFECT_REQUEST_KIND, {});
});
