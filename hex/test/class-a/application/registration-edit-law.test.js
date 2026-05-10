import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Class-a: Align pins are stored projected facts, not adapter-local gestures.
// Adding a pin must persist the image/map coordinate pair with a stable identity;
// removing that identity must erase the registration facts without unloading.
test("Align pin toggle adds and removes registration facts durably", () => {
  const add = handleApplicationCommand({
    state: referenceImageLoadedState(),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
      pinTogglePayload(),
    ),
  });
  const [addedPin] = add.state.session.registration.pins;

  assert.equal(Number.isInteger(addedPin.id), true);
  assert.deepEqual(addedPin.imagePx, firstPin().imagePx);
  assert.deepEqual(addedPin.mapLatLon, firstPin().mapLatLon);
  assert.deepEqual(add.effects, [
    durableStateChangedEffect({
      session: add.state.session,
    }),
  ]);

  const remove = handleApplicationCommand({
    state: add.state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
      pinTogglePayload({ existingPinId: addedPin.id }),
    ),
  });

  assert.deepEqual(remove.state.session, {
    mode: "align",
    referenceImage: normalizedReferenceImage(),
  });
  assert.deepEqual(remove.effects, [
    durableStateChangedEffect({
      session: remove.state.session,
    }),
  ]);
});

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

// Class-a: a solved registration is the semantic bridge from Align pins to a
// Trace placement. Selecting Trace with a solved placement applies that product
// fact durably instead of treating the solved transform as adapter-local data.
test("switching to Trace applies solved registration placement durably", () => {
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({
      mode: "align",
      pins: [firstPin(), secondPin()],
    }),
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: "trace",
      solvedPlacement: solvedPlacement(),
    }),
  });

  assert.deepEqual(result.state.session, {
    mode: "trace",
    referenceImage: normalizedReferenceImage(),
    placement: solvedPlacement(),
    registration: {
      pins: [firstPin(), secondPin()],
      solvedPlacement: solvedPlacement(),
    },
  });
  assert.deepEqual(result.effects, [
    durableStateChangedEffect({
      session: result.state.session,
    }),
  ]);
});

// Class-a: Clear pins is destructive only to registration facts. It must not
// unload the reference image or leave hidden empty-registration state behind,
// and the durable effect must describe exactly the surviving session.
test("clearing Align registration pins keeps the image and clears registration durably", () => {
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({
      mode: "align",
      pins: [firstPin(), secondPin()],
    }),
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.CLEAR_REGISTRATION_PINS),
  });

  assert.deepEqual(result.state.session, {
    mode: "align",
    referenceImage: normalizedReferenceImage(),
  });
  assert.deepEqual(result.effects, [
    durableStateChangedEffect({
      session: result.state.session,
    }),
  ]);
});

function referenceImageLoadedState({ mode = "align", placement, pins } = {}) {
  const session = {
    mode,
    referenceImage: normalizedReferenceImage(),
  };
  if (placement !== undefined) {
    session.placement = placement;
  }
  if (pins !== undefined) {
    session.registration = {
      pins,
    };
  }
  return { session };
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

function solvedPlacement() {
  return {
    x: 100,
    y: 200,
    scale: 1,
    rotationRad: 0,
  };
}

function pinTogglePayload({
  existingPinId = null,
  imagePx = firstPin().imagePx,
  mapLatLon = firstPin().mapLatLon,
} = {}) {
  return {
    existingPinId,
    imagePx,
    mapLatLon,
  };
}

function durableStateChangedEffect(durableState) {
  return {
    kind: "durable-state-changed",
    durableState,
  };
}
