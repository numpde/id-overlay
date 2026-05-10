import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Class-a: editing registration pins must not disturb an explicitly placed
// overlay. Registration and placement are coupled facts, but pin edits carry
// current placement through state and durability instead of recomputing it.
test("registration pin edits preserve current visible placement", () => {
  const placement = {
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0,
  };
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({
      placement,
      pins: [firstPin()],
    }),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
      {
        existingPinId: null,
        imagePx: secondPin().imagePx,
        mapLatLon: secondPin().mapLatLon,
      },
    ),
  });

  assert.deepEqual(result.state.session.placement, placement);
  assert.deepEqual(result.effects, [
    durableStateChangedEffect({
      session: result.state.session,
    }),
  ]);
});

function referenceImageLoadedState({ placement, pins }) {
  return {
    session: {
      mode: "align",
      referenceImage: normalizedReferenceImage(),
      placement,
      registration: {
        pins,
      },
    },
  };
}

function normalizedReferenceImage() {
  return {
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

function firstPin() {
  return {
    id: 1,
    imagePx: {
      x: 320,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 36.84,
    },
  };
}

function secondPin() {
  return {
    id: 2,
    imagePx: {
      x: 520,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 38.84,
    },
  };
}

function durableStateChangedEffect(durableState) {
  return {
    kind: "durable-state-changed",
    durableState,
  };
}
