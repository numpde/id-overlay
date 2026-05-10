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
