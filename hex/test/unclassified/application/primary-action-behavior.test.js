import test from "node:test";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";
import {
  assertApplicationResult,
} from "../../class-b/application/application-result-assertions.js";
import {
  APPLICATION_MODE,
  durableStateChangedEffect,
  firstPin,
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./user-behavior-fixtures.js";

// Unclassified: the second click performs the pending destructive action. The
// durability effect should describe the new session, not panel implementation.
test("primary action confirms clear-pins when clear-pins confirmation is active", () => {
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({
      pins: [firstPin()],
      panelIntent: {
        kind: "confirm-clear-pins",
      },
    }),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assertApplicationResult(result, {
    state: referenceImageLoadedState({
      notice: {
        kind: "cleared-pins",
        count: 1,
      },
    }),
    effects: [
      durableStateChangedEffect(referenceImageDurableState()),
    ],
  });
});

// Unclassified: when no pins are visible, the same button escalates to clearing
// the image itself. This keeps the panel dumb and the app flow inspectable.
test("primary action without pins requests clear-image confirmation", () => {
  const result = handleApplicationCommand({
    state: referenceImageLoadedState(),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assertApplicationResult(result, {
    state: referenceImageLoadedState({
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    }),
    effects: [],
  });
});

// Unclassified: confirming image removal should collapse the whole session back
// to startup posture. Pins, placement, mode, and image data leave together.
test("primary action confirms clear-image when clear-image confirmation is active", () => {
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    }),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assertApplicationResult(result, {
    state: createInitialApplicationState(),
    effects: [
      durableStateChangedEffect(null),
    ],
  });
});

// Unclassified: confirmations are tied to the current visible intention. A
// different semantic action should clear the confirmation instead of leaving a
// stale destructive second-click armed.
test("unrelated semantic action clears pending clear-image confirmation", () => {
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    }),
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: APPLICATION_MODE.TRACE,
    }),
  });

  assertApplicationResult(result, {
    state: referenceImageLoadedState({
      mode: APPLICATION_MODE.TRACE,
    }),
    effects: [
      durableStateChangedEffect(referenceImageDurableState({
        mode: APPLICATION_MODE.TRACE,
      })),
    ],
  });
});
