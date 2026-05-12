import test from "node:test";
import assert from "node:assert/strict";

import {
  createInteractionRuntime,
} from "../../../bootstrap/interaction-runtime.js";

const SET_TEMPORARY_INPUT_POSTURE = "set-temporary-input-posture";

// Class-c: this is the right product pressure but not yet a settled boundary.
// Temporary native-map access must eventually be one visible application
// posture, not an unobservable browser side channel. This candidate deliberately
// uses posture vocabulary (`native-map`/`normal`) instead of device mechanics
// (`Space`, keyboard, pass-through). Keep quarantined until that state shape and
// command vocabulary are explicit end-to-end.
test("temporary native-map access facts map to semantic posture commands", async () => {
  const commands = [];
  const runtime = createInteractionRuntime({
    dispatchApplicationCommand(command) {
      commands.push(command);
    },
  });

  await runtime.handleInteractionFact({
    kind: "temporary-native-map-access-started",
  });
  await runtime.handleInteractionFact({
    kind: "temporary-native-map-access-ended",
  });

  assert.deepEqual(commands, [
    {
      kind: SET_TEMPORARY_INPUT_POSTURE,
      posture: "native-map",
    },
    {
      kind: SET_TEMPORARY_INPUT_POSTURE,
      posture: "normal",
    },
  ]);
  assert.equal(JSON.stringify(commands).includes("Space"), false);
  assert.equal(JSON.stringify(commands).includes("keyboard"), false);
  assert.equal(JSON.stringify(commands).includes("pass-through"), false);
});
