import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Unclassified candidate: a registration fit is valid only for the exact pin
// identities selected by that fit. Pin edits may preserve visible placement,
// but they must clear the fit source so later Trace rendering does not derive
// from stale user intent.
test("editing registration pins invalidates registration fit source", () => {
  const state = referenceImageLoadedState({
    pins: [firstPin(), secondPin()],
    fit: {
      kind: "from-pins",
      pinIds: [1, 2],
    },
  });

  const result = handleApplicationCommand({
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
      {
        existingPinId: null,
        imagePx: thirdPin().imagePx,
        mapLatLon: thirdPin().mapLatLon,
      },
    ),
  });

  assert.deepEqual(result.state.session, {
    mode: "align",
    referenceImage: normalizedReferenceImage(),
    registration: {
      pins: [firstPin(), secondPin(), thirdPin()],
    },
  });
  assert.equal(JSON.stringify(result.state).includes("fit"), false);
  assert.deepEqual(result.effects, [
    persistDurableStateEffect({
      session: result.state.session,
    }),
  ]);
});

function referenceImageLoadedState({ pins, fit }) {
  return {
    session: {
      mode: "align",
      referenceImage: normalizedReferenceImage(),
      registration: {
        pins,
        fit,
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
      x: 0,
      y: 0,
    },
    mapLatLon: {
      lat: 0,
      lon: -180,
    },
  };
}

function secondPin() {
  return {
    id: 2,
    imagePx: {
      x: 100,
      y: 0,
    },
    mapLatLon: {
      lat: 0,
      lon: -178.59375,
    },
  };
}

function thirdPin() {
  return {
    id: 3,
    imagePx: {
      x: 50,
      y: 50,
    },
    mapLatLon: {
      lat: -1,
      lon: -179,
    },
  };
}

function persistDurableStateEffect(durableState) {
  return {
    kind: "persist-durable-state",
    durableState,
  };
}
