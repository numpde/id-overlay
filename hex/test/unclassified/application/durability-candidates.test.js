import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";
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
import {
  movedPlacement,
} from "../../class-b/application/placement-fixtures.js";

// Unclassified candidate: no image means there is no durable session to save.
// This is likely class-a, but keep it here until durable selection is built.
test("no image has no durable state", () => {
  assert.equal(selectDurableApplicationState(createInitialApplicationState()), null);
});

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

// Unclassified candidate: placement preview is runtime-only. Drag previews
// should not be persisted before the user commits the edit.
test("transient placement preview is not durable state", () => {
  assert.deepEqual(selectDurableApplicationState({
    ...referenceImageLoadedState(),
    placementPreview: {
      beforePlacement: null,
      previewPlacement: movedPlacement(),
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
