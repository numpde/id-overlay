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
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";

// Class-b: the primary action is the UI's semantic button. Adapters report the
// user intent; the application decides that no-session activation waits for a
// pasted reference image.
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

// Class-b: while paste is armed, the same semantic button cancels the prompt
// instead of starting an overlapping input flow. Exact notice vocabulary remains
// application API shape.
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

// Class-b: with an image loaded and no visible pins, the primary action should
// ask before removing the image. The confirmation payload is application API
// vocabulary, so this is not class-a.
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

// Class-b: confirming image removal collapses the whole session back to startup
// posture and requests durable clearing. Exact confirmation/effect vocabulary is
// still application API shape.
test("primary action confirms clear-image when clear-image confirmation is active", () => {
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
    state: createInitialApplicationState(),
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
