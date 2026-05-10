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
  referenceImageLoadedState,
  secondPin,
} from "./reference-image-fixtures.js";

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
