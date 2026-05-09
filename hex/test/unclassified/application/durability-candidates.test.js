import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import {
  selectDurableApplicationState,
} from "../../../application/view-model.js";
import {
  assertApplicationResult,
} from "../../class-b/application/application-result-assertions.js";
import {
  awaitingReferenceImagePasteState,
  referenceImageDurableState,
  referenceImageLoadedState,
} from "../../class-b/application/reference-image-fixtures.js";

// Unclassified candidate: durable state should be the session-shaped product
// snapshot only. Runtime input, notices, panel intent, and history should not
// cross the persistence boundary.
test("durable state excludes input notices panel intent and history", () => {
  const loadedState = referenceImageLoadedState();

  assert.deepEqual(selectDurableApplicationState({
    ...loadedState,
    referenceImageInput: awaitingReferenceImagePasteState().referenceImageInput,
    notice: {
      kind: "reference-image-paste-empty",
    },
    panelIntent: {
      kind: "confirm-clear-reference-image",
    },
    history: {
      past: [{
        kind: "load-reference-image",
      }],
      future: [],
    },
  }), referenceImageDurableState());
});

// Unclassified candidate: hydration should replace stale in-memory app state,
// not merge durable data with pending prompts, notices, or confirmations.
test("hydration replaces current transient state from durable input", () => {
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: referenceImageDurableState(),
  });

  assertApplicationResult(handleApplicationCommand({
    state: {
      ...awaitingReferenceImagePasteState(),
      notice: {
        kind: "reference-image-paste-cancelled",
      },
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    command,
  }), {
    state: referenceImageLoadedState(),
    effects: [],
  });
});
