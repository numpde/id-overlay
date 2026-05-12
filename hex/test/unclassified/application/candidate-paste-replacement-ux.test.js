import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { selectApplicationView } from "../../../application/view-model.js";

// Unclassified: candidate product law for paste/replacement UX.
//
// Serious alternatives considered:
// - "Clear, then Paste." Rejected as the replacement path: it destroys the
//   current overlay before the user has a new image, so empty/failure/cancel
//   strands the user in no-session.
// - Immediate replacement on button click. Rejected: browser image input is
//   asynchronous and may fail; the destructive moment must be accepted input.
// - Reuse Clear image confirmation as replacement. Rejected: clear and replace
//   have different user promises. Clear removes; replace keeps the old image
//   live until a new one exists.
// - Shell-managed replacement after observing image removal. Rejected: the app
//   would lose product causality, request correlation, and undo semantics.
//
// Preferred model: replacement is a distinct product intent. It requests an
// abstract reference image while keeping the current session visible and
// durable. Empty, failed, stale, or cancelled input leaves the old session
// intact. Accepted input starts a fresh Align session and records an undoable
// whole-session replacement history record.
//
// Classification note: a standalone command-vocabulary candidate was deleted.
// Command names are not independent product behavior; promoting the name alone
// would create a dangling API surface. The replacement behavior candidates below
// should own whatever command vocabulary they require.
//
// Classification note: a candidate requiring a `referenceImageActions` view
// shape was deleted. Replacement causality should be settled before button or
// view-model surface area; otherwise the UI harness becomes the design source of
// truth instead of the application behavior.
//
// Classification note: a replacement-history-label candidate was deleted as
// redundant. The replacement history record now owns the semantic label in
// class-a, and the generic view-model history projection is already class-b.

const COMMAND_KIND = Object.freeze({
  REQUEST_REFERENCE_IMAGE_REPLACEMENT: "request-reference-image-replacement",
  REPORT_REFERENCE_IMAGE_INPUT_OUTCOME: "report-reference-image-input-outcome",
});

const EFFECT_KIND = Object.freeze({
  REQUEST_REFERENCE_IMAGE_INPUT: "request-reference-image-input",
  PERSIST_DURABLE_STATE: "persist-durable-state",
  SCHEDULE_CLEAR_STATUS_NOTICE: "schedule-clear-status-notice",
});

const STATUS_NOTICE_DELAY_MS = 2500;

// Candidate: source-specific "paste" vocabulary must not be the product name of
// replacement state. Paste is one browser input route; replacement is the user
// intent.
test("candidate: replacement state is source-agnostic", () => {
  const state = handleApplicationCommand({
    state: loadedImageState(),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REQUEST_REFERENCE_IMAGE_REPLACEMENT,
    ),
  }).state;

  const serialized = JSON.stringify(state);
  assert.equal(serialized.includes("paste"), false);
  assert.equal(serialized.includes("clipboard"), false);
  assert.equal(serialized.includes("replace-reference-image"), true);
});

function loadedImageState({
  mode = "align",
  referenceImage = oldReferenceImage(),
  placement = undefined,
  pins = [],
  opacity = undefined,
} = {}) {
  const session = {
    mode,
    referenceImage,
  };
  if (placement !== undefined) {
    session.placement = placement;
  }
  if (pins.length > 0) {
    session.registration = {
      pins,
    };
  }
  if (opacity !== undefined) {
    session.opacity = opacity;
  }
  return {
    session,
  };
}

function durableStateFromLoadedState(state) {
  return {
    session: state.session,
  };
}

function replacementHistoryRecord({ before, after } = {}) {
  return {
    kind: "replace-reference-image",
    before,
    after,
  };
}

function placementHistoryRecord({ editKind = "move" } = {}) {
  return {
    kind: "overlay-placement-edit",
    editKind,
    before: {
      placement: null,
      solvedRegistration: null,
    },
    after: {
      placement: oldPlacement(),
      solvedRegistration: null,
    },
  };
}

function oldReferenceImage() {
  return {
    imageDataRef: "data:image/png;base64,old-reference-image",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

function newReferenceImage() {
  return {
    imageDataRef: "data:image/png;base64,new-reference-image",
    intrinsicSizePx: {
      width: 800,
      height: 600,
    },
  };
}

function oldPlacement() {
  return {
    x: 30,
    y: 40,
    scale: 1.5,
    rotationRad: 0.25,
  };
}

function firstPin() {
  return {
    id: 1,
    imagePx: {
      x: 320,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 36.84,
    },
  };
}

function assertSemanticLabel(label, requiredWords) {
  assert.equal(typeof label, "string");
  for (const word of requiredWords) {
    assert.match(label, new RegExp(`\\b${word}\\b`, "i"));
  }
}
