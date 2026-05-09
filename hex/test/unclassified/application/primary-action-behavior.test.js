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
  awaitingReferenceImagePasteState,
  durableStateChangedEffect,
  firstPin,
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./user-behavior-fixtures.js";

// Unclassified: primary action is the UI's semantic button. The precise command
// name is tentative; the invariant is that adapters report intent, not decide
// whether the app should paste, cancel, clear pins, or clear the image.
test("primary action with no session waits for a pasted reference image", () => {
  const result = handleApplicationCommand({
    state: createInitialApplicationState(),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assertApplicationResult(result, {
    state: awaitingReferenceImagePasteState(),
    effects: [],
  });
});

// Unclassified: pressing the same semantic button while paste is armed should
// cancel the user-facing prompt instead of starting a second overlapping input.
test("primary action while awaiting paste cancels the pending paste prompt", () => {
  const result = handleApplicationCommand({
    state: awaitingReferenceImagePasteState(),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assertApplicationResult(result, {
    state: {
      notice: {
        kind: "reference-image-paste-cancelled",
      },
    },
    effects: [],
  });
});

// Unclassified: the first click asks for confirmation because clearing pins is
// destructive but leaves the image. This belongs in application behavior, not
// in the panel adapter.
test("primary action with visible pins requests clear-pins confirmation", () => {
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({ pins: [firstPin()] }),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assertApplicationResult(result, {
    state: referenceImageLoadedState({
      pins: [firstPin()],
      panelIntent: {
        kind: "confirm-clear-pins",
      },
    }),
    effects: [],
  });
});

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
