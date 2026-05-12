import test from "node:test";
import assert from "node:assert/strict";

import {
  createInteractionRuntime,
} from "../../../bootstrap/interaction-runtime.js";

// Unclassified: proposal for the runtime mapper. It receives only canonical
// interaction facts, delegates geometry/value decisions to ports, and emits
// semantic application commands. It does not branch on product state or remember
// whether an adapter was keyboard, pointer, wheel, or drag based.
test("candidate: interaction runtime maps canonical facts to application commands", async () => {
  const commands = [];
  const projectedFacts = [];
  const selectedFacts = [];
  const runtime = createInteractionRuntime({
    dispatchApplicationCommand(command) {
      commands.push(command);
    },
    projectRegistrationPinToggle(fact) {
      projectedFacts.push(fact);
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
    projectPlacementEdit(fact) {
      projectedFacts.push(fact);
      return {
        kind: "committed",
        editKind: fact.editKind,
        placement: movedPlacement(),
      };
    },
    selectOpacity(fact) {
      selectedFacts.push(fact);
      return {
        kind: "selected",
        opacity: 0.5,
      };
    },
  });

  await runtime.handleInteractionFact({
    kind: "registration-pin-toggle-requested",
    screenPx: {
      x: 120,
      y: 90,
    },
  });
  await runtime.handleInteractionFact({
    kind: "placement-edit-requested",
    editKind: "move",
    screenDeltaPx: {
      x: 30,
      y: 20,
    },
    anchorScreenPx: {
      x: 120,
      y: 90,
    },
  });
  await runtime.handleInteractionFact({
    kind: "opacity-adjustment-requested",
    adjustment: {
      y: -100,
    },
    anchorScreenPx: {
      x: 120,
      y: 90,
    },
  });

  assert.deepEqual(projectedFacts, [
    {
      kind: "registration-pin-toggle-requested",
      screenPx: {
        x: 120,
        y: 90,
      },
    },
    {
      kind: "placement-edit-requested",
      editKind: "move",
      screenDeltaPx: {
        x: 30,
        y: 20,
      },
      anchorScreenPx: {
        x: 120,
        y: 90,
      },
    },
  ]);
  assert.deepEqual(selectedFacts, [{
    kind: "opacity-adjustment-requested",
    adjustment: {
      y: -100,
    },
    anchorScreenPx: {
      x: 120,
      y: 90,
    },
  }]);
  assert.deepEqual(commands, [
    {
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
    },
    {
      kind: "commit-placement-edit",
      editKind: "move",
      placement: movedPlacement(),
    },
    {
      kind: "set-opacity",
      opacity: 0.5,
    },
  ]);
  assert.equal(JSON.stringify(commands).includes("keyboard"), false);
  assert.equal(JSON.stringify(commands).includes("pointer"), false);
  assert.equal(JSON.stringify(commands).includes("wheel"), false);
  assert.equal(JSON.stringify(commands).includes("overlay"), false);
});

function movedPlacement() {
  return {
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0,
  };
}
