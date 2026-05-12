import test from "node:test";
import assert from "node:assert/strict";

import {
  createInteractionRuntime,
} from "../../../bootstrap/interaction-runtime.js";

// Unclassified: proposal for the interaction vocabulary. Keyboard, pointer, and
// future controls may all ask for temporary native-map access; the interaction
// runtime maps that source-neutral fact to one application command and does not
// dispatch keydown/Space/pass-through mechanics.
test("candidate: interaction facts map temporary native-map access to semantic app commands", async () => {
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
      kind: "set-temporary-input-posture",
      posture: "native-map",
    },
    {
      kind: "set-temporary-input-posture",
      posture: "normal",
    },
  ]);
  assert.equal(JSON.stringify(commands).includes("Space"), false);
  assert.equal(JSON.stringify(commands).includes("keyboard"), false);
  assert.equal(JSON.stringify(commands).includes("pass-through"), false);
});
