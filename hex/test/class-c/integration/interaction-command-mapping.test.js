import test from "node:test";
import assert from "node:assert/strict";

import {
  createInteractionRuntime,
} from "../../../bootstrap/interaction-runtime.js";

const SET_TEMPORARY_PASS_THROUGH = "set-temporary-pass-through";

// Class-c: this is the right product pressure but not yet a settled boundary.
// Temporary pass-through must eventually be one visible application posture, not
// an unobservable browser side channel. The open design question is whether the
// transient posture belongs in the same application command vocabulary as
// durable edits, or in a separate runtime-intent channel with the same reducer
// ownership. Keep this quarantined until that state shape is explicit.
test("temporary pass-through facts map to semantic posture commands", async () => {
  const commands = [];
  const runtime = createInteractionRuntime({
    dispatchApplicationCommand(command) {
      commands.push(command);
    },
  });

  await runtime.handleInteractionFact({
    kind: "temporary-pass-through-started",
  });
  await runtime.handleInteractionFact({
    kind: "temporary-pass-through-ended",
  });

  assert.deepEqual(commands, [
    {
      kind: SET_TEMPORARY_PASS_THROUGH,
      active: true,
    },
    {
      kind: SET_TEMPORARY_PASS_THROUGH,
      active: false,
    },
  ]);
});
