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
import {
  APPLICATION_MODE,
  durableStateChangedEffect,
  firstPin,
  pinTogglePayload,
  referenceImageDurableState,
  referenceImageLoadedState,
  secondPin,
  solvedPlacement,
  twoPins,
} from "./user-behavior-fixtures.js";

// Unclassified: pin toggling is a semantic transition over projected facts. The
// adapter supplies image/map coordinates; the application owns add/remove rules.
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

// Unclassified: pins are invisible in Trace, so pin-destructive controls and
// pin mutation commands are invalid there from the user's perspective.
test("pin edits and clear-pins are no-ops in Trace mode", () => {
  const state = referenceImageLoadedState({
    mode: APPLICATION_MODE.TRACE,
    pins: [firstPin()],
  });

  for (const command of [
    createApplicationCommand(
      APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
      pinTogglePayload({ imagePx: secondPin().imagePx, mapLatLon: secondPin().mapLatLon }),
    ),
    createApplicationCommand(APPLICATION_COMMAND_KIND.CLEAR_REGISTRATION_PINS),
  ]) {
    assertApplicationResult(handleApplicationCommand({ state, command }), {
      state,
      effects: [],
    });
  }
});

// Unclassified: selecting Trace with enough pins causes a visible fit. This is
// not "mode restored by snapshot"; the semantic action changes the viewed map.
test("switching to Trace with two pins fits the overlay from registration", () => {
  const state = referenceImageLoadedState({
    mode: APPLICATION_MODE.ALIGN,
    pins: twoPins(),
  });
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
    mode: APPLICATION_MODE.TRACE,
    solvedPlacement: solvedPlacement(),
  });

  const result = handleApplicationCommand({ state, command });

  assertApplicationResult(result, {
    state: referenceImageLoadedState({
      mode: APPLICATION_MODE.TRACE,
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
        mode: APPLICATION_MODE.TRACE,
        placement: solvedPlacement(),
        pins: twoPins(),
        solved: solvedPlacement(),
      })),
    ],
  });

  assert.equal(selectApplicationView(result.state).mode, APPLICATION_MODE.TRACE);
});
