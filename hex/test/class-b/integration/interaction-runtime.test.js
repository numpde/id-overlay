import test from "node:test";
import assert from "node:assert/strict";

import {
  createInteractionRuntime,
} from "../../../bootstrap/interaction-runtime.js";

// Class-b, deliberately not class-a: this names today's composition seam, not a
// complete future interaction vocabulary. Adapter facts may call projection
// ports while becoming application commands, but they must not inspect product
// state.
test("interaction runtime maps adapter facts into application commands without reading state", async () => {
  const commands = [];
  const facts = [];
  const runtime = createInteractionRuntime({
    dispatchApplicationCommand(command) {
      commands.push(command);
    },
    projectRegistrationPinToggle(fact) {
      facts.push(fact);
      return {
        kind: "projected",
        existingPinId: null,
        imagePx: {
          x: 320,
          y: 240,
        },
        mapLatLon: {
          lat: -1.23,
          lon: 36.84,
        },
      };
    },
    readApplicationState() {
      assert.fail("interaction runtime must not inspect product state");
    },
  });

  await runtime.handleInteractionFact({
    kind: "registration-pin-toggle-requested",
    source: "shortcut",
  });

  assert.deepEqual(facts, [{
    kind: "registration-pin-toggle-requested",
    source: "shortcut",
  }]);
  assert.deepEqual(commands, [{
    kind: "toggle-registration-pin",
    existingPinId: null,
    imagePx: {
      x: 320,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 36.84,
    },
  }]);
  assertNoAdapterVocabulary(commands);
});

// Class-b: this is the composition seam for source-neutral transient input
// facts. The application owns the resulting visible posture; the mapper only
// translates interaction facts into replayable semantic commands.
test("interaction runtime maps temporary native-map access facts to posture commands", async () => {
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

// Class-b: projection misses are inert at the interaction seam. They are not
// application errors and the mapper must not guess a fallback command or forward
// a page gesture when it cannot form semantic product input.
test("interaction runtime dispatches nothing when pin projection misses", async () => {
  const commands = [];
  const runtime = createInteractionRuntime({
    dispatchApplicationCommand(command) {
      commands.push(command);
    },
    projectRegistrationPinToggle() {
      return {
        kind: "not-projectable",
        reason: "pointer-outside-reference-image",
      };
    },
  });

  await runtime.handleInteractionFact({
    kind: "registration-pin-toggle-requested",
    source: "overlay",
  });

  assert.deepEqual(commands, []);
});

// Class-b: the stable product rule is that placement changes enter the app as
// committed placement edits, never raw drag/wheel deltas. This stays class-b
// because the exact fact name and `projectPlacementEdit` port are harness
// vocabulary for today's shell, not a 99%-certain product law.
test("interaction runtime maps placement facts through projection to committed edits", async () => {
  const commands = [];
  const facts = [];
  const runtime = createInteractionRuntime({
    dispatchApplicationCommand(command) {
      commands.push(command);
    },
    projectPlacementEdit(fact) {
      facts.push(fact);
      return {
        kind: "committed",
        editKind: "rotate",
        placement: rotatedPlacement(),
      };
    },
  });

  await runtime.handleInteractionFact({
    kind: "placement-edit-requested",
    editKind: "rotate",
    inputDelta: {
      y: -100,
    },
  });

  assert.deepEqual(facts, [{
    kind: "placement-edit-requested",
    editKind: "rotate",
    inputDelta: {
      y: -100,
    },
  }]);
  assert.deepEqual(commands, [{
    kind: "commit-placement-edit",
    editKind: "rotate",
    placement: rotatedPlacement(),
  }]);
  assertNoAdapterVocabulary(commands);
});

// Class-b: opacity changes are product commands, but the browser interaction
// that chooses the next opacity is not. The mapper may ask a selection port for
// the semantic value; history/durability policy stays inside `set-opacity`.
test("interaction runtime maps opacity facts through selection to set-opacity", async () => {
  const commands = [];
  const facts = [];
  const runtime = createInteractionRuntime({
    dispatchApplicationCommand(command) {
      commands.push(command);
    },
    selectOpacity(fact) {
      facts.push(fact);
      return {
        kind: "selected",
        opacity: 0.5,
      };
    },
  });

  await runtime.handleInteractionFact({
    kind: "opacity-adjustment-requested",
    inputDelta: {
      y: 100,
    },
  });

  assert.deepEqual(facts, [{
    kind: "opacity-adjustment-requested",
    inputDelta: {
      y: 100,
    },
  }]);
  assert.deepEqual(commands, [{
    kind: "set-opacity",
    opacity: 0.5,
  }]);
  assertNoAdapterVocabulary(commands);
});

// Class-b: the exact interaction-fact names can still evolve, but the boundary
// rule is stable enough to guard here. Browser/adapter source words may enter
// the mapper as facts; they must not leak into application commands, otherwise
// the application command vocabulary stops being source-neutral.
function assertNoAdapterVocabulary(commands) {
  const serializedCommands = JSON.stringify(commands);

  assert.equal(serializedCommands.includes("keyboard"), false);
  assert.equal(serializedCommands.includes("pointer"), false);
  assert.equal(serializedCommands.includes("wheel"), false);
  assert.equal(serializedCommands.includes("overlay"), false);
}

function rotatedPlacement() {
  return {
    x: 10,
    y: 20,
    scale: 1,
    rotationRad: 0.25,
  };
}
