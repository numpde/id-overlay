import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { selectApplicationView } from "../../../application/view-model.js";
import {
  assertApplicationResult,
} from "../../class-b/application/application-result-assertions.js";
import { durableStateChangedEffect } from "./durable-state-fixtures.js";
import {
  firstPin,
  pinTogglePayload,
  referenceImageDurableState,
  referenceImageLoadedState,
  secondPin,
  solvedPlacement,
  twoPins,
} from "./reference-image-fixtures.js";
import {
  movedPlacement,
} from "./placement-fixtures.js";

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

// Class-c: registration edits after a fit should not make the overlay jump, but
// the exact placement/registration coupling is still proposal-level shape.
test("adding a registration pin preserves current visible placement", () => {
  const placement = movedPlacement();
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

  assert.deepEqual(result.state.session.placement, placement);
});

// Class-c: auto-fitting on Trace switch is user-visible and likely right, but
// solved-placement payloads and fit notices are still unsettled product shape.
test("switching to Trace with two pins fits the overlay from registration", () => {
  const state = referenceImageLoadedState({
    mode: "align",
    pins: twoPins(),
  });
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
    mode: "trace",
    solvedPlacement: solvedPlacement(),
  });

  const result = handleApplicationCommand({ state, command });

  assertApplicationResult(result, {
    state: referenceImageLoadedState({
      mode: "trace",
      placement: solvedPlacement(),
      pins: twoPins(),
      solved: solvedPlacement(),
      notice: {
        kind: "fit-reference-image-from-pins",
        pinCount: 2,
      },
    }),
    effects: [
      durableStateChangedEffect(referenceImageDurableState({
        mode: "trace",
        placement: solvedPlacement(),
        pins: twoPins(),
        solved: solvedPlacement(),
      })),
    ],
  });

  assert.equal(selectApplicationView(result.state).mode, "trace");
});
