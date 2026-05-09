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

// This file defines the smallest executable application seam before product
// vocabulary exists: explicit commands in, explicit results out, no implicit
// effects or hidden platform work.
// It is intentionally not a product state-machine spec. Product state enters
// only when a real use case forces it.

test("application command vocabulary starts with an explicit no-op command", () => {
  assert.equal(Object.isFrozen(APPLICATION_COMMAND_KIND), true);
  assert.deepEqual(APPLICATION_COMMAND_KIND, {
    NOOP: "noop",
  });

  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.NOOP);

  assertPlainData(command);
  assert.deepEqual(command, { kind: "noop" });
});

// Commands are closed vocabulary records. The boundary should reject misspelled
// or speculative commands before any transition code can accidentally treat
// them as product behavior.
test("application command construction rejects implicit command vocabulary", () => {
  assert.throws(
    () => createApplicationCommand("unknown-command"),
    /unknown application command/i,
  );
  assert.throws(
    () => createApplicationCommand(),
    /unknown application command/i,
  );
});

// The first state is deliberately empty as a guard against speculative product
// fields. The first real use case should replace this with the smallest needed
// product state, not layer behavior around an abstract placeholder.
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

  assertPlainData(result);
  assert.deepEqual(result.state, state);
  assert.deepEqual(result.effects, []);
});

// Unknown commands are errors at the application boundary. Silent no-ops would
// hide misspelled product intents and weaken the command vocabulary.
test("application boundary rejects malformed commands", () => {
  const state = createInitialApplicationState();

  assert.throws(
    () => handleApplicationCommand({ state }),
    /application command/i,
  );
  assert.throws(
    () => handleApplicationCommand({
      state,
      command: { kind: "unknown-command" },
    }),
    /unknown application command/i,
  );
});

// Command handling is also a state boundary. The transition layer should never
// be asked to reason from an implicit or runtime-object state.
test("application boundary rejects malformed state", () => {
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.NOOP);

  assert.throws(
    () => handleApplicationCommand({ command }),
    /plain application state/i,
  );
  assert.throws(
    () => handleApplicationCommand({
      state: new Map(),
      command,
    }),
    /plain application state/i,
  );
});

// Results are the one application exit shape. Effects are data for the shell to
// execute later, never callbacks, promises, or adapter handles.
test("application results are explicit plain state plus effect request list", () => {
  const state = createInitialApplicationState();

  const result = createApplicationResult({
    state,
    effects: [],
  });

  assertPlainData(result);
  assert.deepEqual(result.state, state);
  assert.deepEqual(result.effects, []);
});

// The result constructor is the choke point for data leaving the application.
// Rejecting malformed effects here keeps every future use case on the same
// serializable effect path instead of inventing local escape hatches.
test("application results require an effect request list", () => {
  const state = createInitialApplicationState();

  assert.throws(
    () => createApplicationResult({ state }),
    /effect request list/i,
  );
  assert.throws(
    () => createApplicationResult({ state, effects: null }),
    /effect request list/i,
  );
  assert.throws(
    () => createApplicationResult({ state, effects: {} }),
    /effect request list/i,
  );
});

// State is allowed to grow into any future product shape, but it must be
// explicit JSON-shaped data. Missing state and runtime objects are both invalid
// because either would make the result boundary ambiguous.
test("application results reject non-data state", () => {
  assert.throws(
    () => createApplicationResult({
      effects: [],
    }),
    /plain application state/i,
  );
  assert.throws(
    () => createApplicationResult({
      state: new Map(),
      effects: [],
    }),
    /plain application state/i,
  );
});

// Empty vocabulary is still vocabulary. The first real effect should extend
// this object deliberately instead of smuggling ad hoc effect names in results.
test("effect request vocabulary is explicit even before product effects exist", () => {
  assert.equal(Object.isFrozen(EFFECT_REQUEST_KIND), true);
  assert.deepEqual(EFFECT_REQUEST_KIND, {});
});

// Rejecting unknown effects keeps the shell from becoming an accidental dynamic
// dispatcher for undeclared behavior.
test("application results reject implicit effect request vocabulary", () => {
  const state = createInitialApplicationState();

  assert.throws(
    () => createApplicationResult({
      state,
      effects: [{ kind: "unknown-effect" }],
    }),
    /unknown effect request/i,
  );
});

// Effect requests must be plain records with explicit vocabulary even after real
// effect kinds exist. Shape failures should be caught before the shell can
// interpret an accidental object as executable work.
test("application results reject non-data effect requests", () => {
  const state = createInitialApplicationState();

  assert.throws(
    () => createApplicationResult({
      state,
      effects: [new Map()],
    }),
    /plain effect request/i,
  );
  assert.throws(
    () => createApplicationResult({
      state,
      effects: [{}],
    }),
    /unknown effect request/i,
  );
});

// Plain data here means JSON-shaped data: primitives, arrays, and plain objects
// only. structuredClone alone would allow Maps, Sets, Dates, and other runtime
// objects that are too rich for the application boundary.
function assertPlainData(value) {
  assertJsonShape(value);
}

function assertJsonShape(value) {
  if (value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const nestedValue of value) {
      assertJsonShape(nestedValue);
    }
    return;
  }

  const valueType = typeof value;
  if (["string", "boolean"].includes(valueType)) {
    return;
  }
  if (valueType === "number") {
    assert.equal(Number.isFinite(value), true);
    return;
  }

  assert.equal(valueType, "object");
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const [key, nestedValue] of Object.entries(value)) {
    assert.equal(typeof key, "string");
    assertJsonShape(nestedValue);
  }
}
