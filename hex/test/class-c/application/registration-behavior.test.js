import test from "node:test";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import {
  assertApplicationResult,
} from "../../class-b/application/application-result-assertions.js";
import { durableStateChangedEffect } from "./durable-state-fixtures.js";
import {
  firstPin,
  pinTogglePayload,
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";

// Class-c: pin toggling belongs in the application, but exact pin IDs, notices,
// and durable registration shape need more implementation evidence.
test("pin toggle adds and removes projected registration facts in Align mode", () => {
  const add = handleApplicationCommand({
    state: referenceImageLoadedState(),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
      pinTogglePayload(),
    ),
  });

  assertApplicationResult(add, {
    state: referenceImageLoadedState({
      pins: [firstPin()],
      notice: {
        kind: "added-pin",
        pinId: 1,
      },
    }),
    effects: [
      durableStateChangedEffect(referenceImageDurableState({
        pins: [firstPin()],
      })),
    ],
  });

  const remove = handleApplicationCommand({
    state: add.state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
      pinTogglePayload({ existingPinId: 1 }),
    ),
  });

  assertApplicationResult(remove, {
    state: referenceImageLoadedState({
      notice: {
        kind: "removed-pin",
        pinId: 1,
      },
    }),
    effects: [
      durableStateChangedEffect(referenceImageDurableState()),
    ],
  });
});
