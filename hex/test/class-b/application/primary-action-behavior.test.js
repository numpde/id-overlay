import test from "node:test";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";
import { assertApplicationResult } from "./application-result-assertions.js";
import {
  awaitingReferenceImagePasteState,
  durableStateChangedEffect,
  firstPin,
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";

// Class-b, not class-a: while paste is armed, the same semantic button cancels
// the prompt instead of starting an overlapping input flow. Class-a owns the
// request-correlation consequence; this test keeps the current cancellation
// notice vocabulary coherent with the button behavior.
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

// Class-b, not class-a: with an image loaded and no visible pins, the current
// primary-button ladder asks before removing the image. This is product policy
// plus confirmation vocabulary, not an invariant application law.
test("primary action without pins requests clear-image confirmation", () => {
  const result = handleApplicationCommand({
    state: referenceImageLoadedState(),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assertApplicationResult(result, {
    state: {
      ...referenceImageLoadedState(),
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    effects: [],
  });
});

// Class-b, not class-a: a new visible clear-image intent replaces stale status,
// but this is still tied to the current confirmation branch and vocabulary.
// The useful harness pressure is that confirmation UI is not composed with an
// old notice from an earlier action.
test("primary action clear-image confirmation clears stale notice", () => {
  const result = handleApplicationCommand({
    state: {
      ...referenceImageLoadedState(),
      notice: {
        kind: "reference-image-paste-empty",
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assertApplicationResult(result, {
    state: {
      ...referenceImageLoadedState(),
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    effects: [],
  });
});

// Class-b, not class-a: the main-button ladder is product policy, but the
// application/view-model contract must be coherent. When Align pins are visible,
// the view model labels the primary action as Clear pins, so activation must ask
// for clear-pins confirmation rather than jump to clear-image confirmation.
test("primary action with visible Align pins requests clear-pins confirmation", () => {
  const loadedWithPins = referenceImageLoadedState({
    pins: [firstPin()],
  });

  const result = handleApplicationCommand({
    state: loadedWithPins,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assertApplicationResult(result, {
    state: {
      ...loadedWithPins,
      panelIntent: {
        kind: "confirm-clear-pins",
      },
    },
    effects: [],
  });
});

// Class-b, not class-a: clear-pins is part of the current primary-button ladder
// and its notice vocabulary is product policy. The durable requirement is still
// important: confirming must persist the registration-free session and remove
// the destructive confirmation.
test("primary action confirms clear-pins when clear-pins confirmation is active", () => {
  const result = handleApplicationCommand({
    state: {
      ...referenceImageLoadedState({
        pins: [firstPin()],
      }),
      panelIntent: {
        kind: "confirm-clear-pins",
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assertApplicationResult(result, {
    state: {
      ...referenceImageLoadedState(),
      notice: {
        kind: "cleared-pins",
        count: 1,
      },
    },
    effects: [
      durableStateChangedEffect(referenceImageDurableState()),
    ],
  });
});

// Class-b, not class-a: confirming image removal currently records a reloadable
// undo point, clears durable state, and collapses the visible session. The exact
// confirmation and history labels remain product/API vocabulary.
test("primary action confirms clear-image when clear-image confirmation is active", () => {
  const record = {
    kind: "remove-reference-image",
    undoLabel: "Reload image",
    redoLabel: "Remove image",
    before: referenceImageDurableState(),
    after: null,
  };
  const result = handleApplicationCommand({
    state: {
      ...referenceImageLoadedState(),
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assertApplicationResult(result, {
    state: {
      ...createInitialApplicationState(),
      history: {
        past: [record],
        future: [],
      },
    },
    effects: [
      durableStateChangedEffect(null),
    ],
  });
});

// Class-b: destructive confirmations are tied to the current visible intention.
// A different semantic action clears the armed confirmation instead of leaving a
// stale second-click active.
test("unrelated semantic action clears pending clear-image confirmation", () => {
  const result = handleApplicationCommand({
    state: {
      ...referenceImageLoadedState(),
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: "trace",
    }),
  });

  assertApplicationResult(result, {
    state: referenceImageLoadedState({
      mode: "trace",
    }),
    effects: [
      durableStateChangedEffect(referenceImageDurableState({
        mode: "trace",
      })),
    ],
  });
});
