import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import {
  durableStateChangedEffect,
  firstPin,
  normalizedReferenceImage,
  pinTogglePayload,
  referenceImageLoadedState,
  secondPin,
  solvedPlacement,
  twoPins,
} from "./reference-image-fixtures.js";

// Class-b, not class-a: exact notice vocabulary and pin id allocation can still
// change, but Align-mode pin toggling is core product behavior. Removing the
// last pin must collapse to the same registration-free session shape used by
// clear-pins, keeping one canonical empty-registration representation.
test("pin toggle adds and removes projected registration facts in Align mode", () => {
  const add = handleApplicationCommand({
    state: referenceImageLoadedState(),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
      pinTogglePayload(),
    ),
  });

  assert.deepEqual(add, {
    state: {
      session: {
        mode: "align",
        referenceImage: normalizedReferenceImage(),
        registration: {
          pins: [firstPin()],
        },
      },
      notice: {
        kind: "added-pin",
        pinId: 1,
      },
    },
    effects: [
      durableStateChangedEffect({
        session: {
          mode: "align",
          referenceImage: normalizedReferenceImage(),
          registration: {
            pins: [firstPin()],
          },
        },
      }),
    ],
  });

  const remove = handleApplicationCommand({
    state: add.state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
      pinTogglePayload({ existingPinId: 1 }),
    ),
  });

  assert.deepEqual(remove, {
    state: {
      session: {
        mode: "align",
        referenceImage: normalizedReferenceImage(),
      },
      notice: {
        kind: "removed-pin",
        pinId: 1,
      },
    },
    effects: [
      durableStateChangedEffect({
        session: {
          mode: "align",
          referenceImage: normalizedReferenceImage(),
        },
      }),
    ],
  });
});

// Class-b, not class-a: exact fit/solve policy can still evolve, but editing
// registration pins must not disturb an explicitly placed overlay. Pin toggles
// update registration facts while carrying the current visible placement through
// both state and durability.
test("adding a registration pin preserves current visible placement", () => {
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
      pinTogglePayload({
        imagePx: secondPin().imagePx,
        mapLatLon: secondPin().mapLatLon,
      }),
    ),
  });

  assert.deepEqual(result, {
    state: {
      session: {
        mode: "align",
        referenceImage: normalizedReferenceImage(),
        placement,
        registration: {
          pins: [firstPin(), secondPin()],
        },
      },
      notice: {
        kind: "added-pin",
        pinId: 2,
      },
    },
    effects: [
      durableStateChangedEffect({
        session: {
          mode: "align",
          referenceImage: normalizedReferenceImage(),
          placement,
          registration: {
            pins: [firstPin(), secondPin()],
          },
        },
      }),
    ],
  });
});

// Class-b, not class-a: the exact notice vocabulary and solved-placement field
// may still evolve, but this transition is user-visible. When Trace selection
// arrives with a solved placement for visible pins, the application accepts that
// solved product fact, fits the overlay, and persists the fitted Trace session.
test("switching to Trace with solved pins fits the overlay from registration", () => {
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({
      mode: "align",
      pins: twoPins(),
    }),
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: "trace",
      solvedPlacement: solvedPlacement(),
    }),
  });

  assert.deepEqual(result, {
    state: {
      session: {
        mode: "trace",
        referenceImage: normalizedReferenceImage(),
        placement: solvedPlacement(),
        registration: {
          pins: twoPins(),
          solvedPlacement: solvedPlacement(),
        },
      },
      notice: {
        kind: "fit-reference-image-from-pins",
        pinCount: 2,
      },
    },
    effects: [
      durableStateChangedEffect({
        session: {
          mode: "trace",
          referenceImage: normalizedReferenceImage(),
          placement: solvedPlacement(),
          registration: {
            pins: twoPins(),
            solvedPlacement: solvedPlacement(),
          },
        },
      }),
    ],
  });
});

// Class-b, not class-a: the exact user-facing notice and the absent-vs-empty
// registration representation may still change. The application boundary is
// settled enough: clearing pins in Align is a product transition, keeps the
// reference image loaded, and persists the registration-free session.
test("clearing registration pins in Align keeps the image and persists the cleared session", () => {
  const state = referenceImageLoadedState({
    mode: "align",
    pins: [firstPin(), secondPin()],
  });

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.CLEAR_REGISTRATION_PINS),
  }), {
    state: {
      session: {
        mode: "align",
        referenceImage: normalizedReferenceImage(),
      },
      notice: {
        kind: "cleared-pins",
        count: 2,
      },
    },
    effects: [
      durableStateChangedEffect({
        session: {
          mode: "align",
          referenceImage: normalizedReferenceImage(),
        },
      }),
    ],
  });
});
