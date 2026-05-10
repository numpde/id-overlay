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
