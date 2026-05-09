import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";
import {
  selectApplicationView,
  selectDurableApplicationState,
} from "../../../application/view-model.js";
import {
  assertApplicationResult,
} from "../../class-b/application/application-result-assertions.js";
import {
  APPLICATION_MODE,
  acceptedReferenceImagePastePayload,
  awaitingReferenceImagePasteState,
  durableStateChangedEffect,
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./user-behavior-fixtures.js";

// Unclassified: this is the desired user posture, but the exact view-model key
// names should not become authoritative until the application boundary exists.
test("no-session view is native Trace with Paste as the primary action", () => {
  assert.deepEqual(selectApplicationView(createInitialApplicationState()), {
    status: "Paste a screenshot to begin.",
    mode: APPLICATION_MODE.TRACE,
    overlayInput: {
      kind: "native-map",
      canEditOverlay: false,
      arePinsVisible: false,
    },
    modeSwitch: {
      selected: APPLICATION_MODE.TRACE,
      trace: {
        enabled: true,
      },
      align: {
        enabled: false,
      },
    },
    primaryAction: {
      kind: "request-reference-image-input",
      label: "Paste",
      enabled: true,
    },
    history: {
      undo: null,
      redo: null,
    },
  });
});

// Unclassified: the user rule is stable, but the command vocabulary may change.
// Align without an image would expose an impossible editing mode.
test("selecting Align with no reference image is a no-op", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
    mode: APPLICATION_MODE.ALIGN,
  });

  assertApplicationResult(handleApplicationCommand({ state, command }), {
    state,
    effects: [],
  });
});

// Unclassified: accepted paste should create the first visible session and
// request durability; adapter details of image decoding are intentionally absent.
test("accepted reference image creates an Align session and durability effect", () => {
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
    acceptedReferenceImagePastePayload(),
  );

  assertApplicationResult(handleApplicationCommand({
    state: awaitingReferenceImagePasteState(),
    command,
  }), {
    state: referenceImageLoadedState(),
    effects: [
      durableStateChangedEffect(referenceImageDurableState()),
    ],
  });
});

// Unclassified: deleting the overlay should return to the same user posture as
// startup, not leave a hidden Align-capable session behind.
test("clearing the reference image returns to no-session Trace", () => {
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.CLEAR_REFERENCE_IMAGE,
  );

  assertApplicationResult(handleApplicationCommand({
    state: referenceImageLoadedState(),
    command,
  }), {
    state: createInitialApplicationState(),
    effects: [
      durableStateChangedEffect(null),
    ],
  });
});

// Unclassified: pending input is application runtime state. Persisting it would
// resurrect stale paste prompts after reload and blur durable/session ownership.
test("transient reference-image input is not durable state", () => {
  assert.equal(
    selectDurableApplicationState(awaitingReferenceImagePasteState()),
    null,
  );
  assert.deepEqual(
    selectDurableApplicationState(referenceImageLoadedState()),
    referenceImageDurableState(),
  );
});
