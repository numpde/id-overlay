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

// Candidate: while replacement is awaiting input, the existing overlay remains
// the visible/editable product state. The user should not see the image vanish
// because an asynchronous paste/read operation is in flight.
test("candidate: replacement-pending view still renders the old image", () => {
  const state = {
    ...loadedImageState({
      mode: "align",
      placement: oldPlacement(),
      pins: [firstPin()],
    }),
    referenceImageInput: {
      status: "awaiting-input",
      requestId: 1,
      intent: {
        kind: "replace-reference-image",
      },
    },
  };

  const view = selectApplicationView(state);

  assert.deepEqual(view.overlay, {
    visible: true,
    imageDataRef: oldReferenceImage().imageDataRef,
    intrinsicSizePx: oldReferenceImage().intrinsicSizePx,
    placement: oldPlacement(),
    opacity: 1,
    pins: [firstPin()],
  });
  assert.match(view.primaryAction.label, /cancel/i);
  assert.doesNotMatch(view.primaryAction.label, /clear/i);
});

// Candidate: accepted replacement starts a fresh image session. Image-specific
// alignment state from the old image is intentionally not inherited by the new
// image.
test("candidate: accepted replacement creates fresh Align session and persists it", () => {
  const oldState = loadedImageState({
    mode: "trace",
    placement: oldPlacement(),
    pins: [firstPin()],
    opacity: 0.5,
  });
  const newSession = {
    mode: "align",
    referenceImage: newReferenceImage(),
  };

  assert.deepEqual(handleApplicationCommand({
    state: {
      ...oldState,
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 4,
        intent: {
          kind: "replace-reference-image",
        },
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: 4,
        outcome: {
          kind: "accepted",
          referenceImage: newReferenceImage(),
        },
      },
    ),
  }), {
    state: {
      session: newSession,
      history: {
        past: [replacementHistoryRecord({
          before: durableStateFromLoadedState(oldState),
          after: {
            session: newSession,
          },
        })],
        future: [],
      },
    },
    effects: [{
      kind: EFFECT_KIND.PERSIST_DURABLE_STATE,
      durableState: {
        session: newSession,
      },
    }],
  });
});

// Candidate: replacement composes with existing history like any other new
// undoable durable edit. It appends a whole-session replacement record and
// clears redo because the timeline has branched.
test("candidate: accepted replacement appends history and clears redo future", () => {
  const oldState = loadedImageState({
    mode: "align",
    placement: oldPlacement(),
  });
  const pastRecord = placementHistoryRecord();
  const futureRecord = placementHistoryRecord({
    editKind: "scale",
  });
  const newSession = {
    mode: "align",
    referenceImage: newReferenceImage(),
  };

  const result = handleApplicationCommand({
    state: {
      ...oldState,
      history: {
        past: [pastRecord],
        future: [futureRecord],
      },
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 5,
        intent: {
          kind: "replace-reference-image",
        },
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: 5,
        outcome: {
          kind: "accepted",
          referenceImage: newReferenceImage(),
        },
      },
    ),
  });

  assert.deepEqual(result.state.history, {
    past: [
      pastRecord,
      replacementHistoryRecord({
        before: durableStateFromLoadedState(oldState),
        after: {
          session: newSession,
        },
      }),
    ],
    future: [],
  });
  assert.deepEqual(result.effects, [{
    kind: EFFECT_KIND.PERSIST_DURABLE_STATE,
    durableState: {
      session: newSession,
    },
  }]);
});

// Candidate: empty and failed replacement input are non-destructive outcomes.
// They end the pending input, retain the old session and old history, schedule
// status expiry, and do not write durable state.
test("candidate: empty or failed replacement leaves old image intact", () => {
  for (const outcome of [
    {
      kind: "empty",
    },
    {
      kind: "failed",
      reason: "source-unavailable",
    },
  ]) {
    const state = {
      ...loadedImageState({
        mode: "align",
        placement: oldPlacement(),
        pins: [firstPin()],
      }),
      history: {
        past: [placementHistoryRecord()],
        future: [],
      },
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 6,
        intent: {
          kind: "replace-reference-image",
        },
      },
    };

    const result = handleApplicationCommand({
      state,
      command: createApplicationCommand(
        APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
        {
          requestId: 6,
          outcome,
        },
      ),
    });

    assert.deepEqual(result.state.session, state.session);
    assert.deepEqual(result.state.history, state.history);
    assert.equal(result.state.referenceImageInput, undefined);
    assert.equal(result.state.notice.requestId, 6);
    assert.match(result.state.notice.kind, /reference-image-replacement/);
    assert.deepEqual(result.effects, [{
      kind: EFFECT_KIND.SCHEDULE_CLEAR_STATUS_NOTICE,
      requestId: 6,
      delayMs: STATUS_NOTICE_DELAY_MS,
    }]);
  }
});

// Candidate: cancelling replacement is non-destructive for the same reason
// empty/failure are non-destructive. Cancel means "keep what I had", not "clear
// the image".
test("candidate: cancelling replacement leaves old image intact", () => {
  const state = {
    ...loadedImageState({
      mode: "trace",
      placement: oldPlacement(),
    }),
    referenceImageInput: {
      status: "awaiting-input",
      requestId: 7,
      intent: {
        kind: "replace-reference-image",
      },
    },
  };

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION),
  }), {
    state: {
      session: state.session,
      notice: {
        kind: "reference-image-replacement-cancelled",
        requestId: 7,
      },
    },
    effects: [{
      kind: EFFECT_KIND.SCHEDULE_CLEAR_STATUS_NOTICE,
      requestId: 7,
      delayMs: STATUS_NOTICE_DELAY_MS,
    }],
  });
});

// Candidate: request correlation matters more during replacement because a late
// accepted image could otherwise overwrite a visible session the user chose to
// keep. Stale outcomes are inert.
test("candidate: stale replacement outcome cannot replace current image", () => {
  const state = {
    ...loadedImageState({
      mode: "align",
      placement: oldPlacement(),
    }),
    referenceImageInput: {
      status: "awaiting-input",
      requestId: 9,
      intent: {
        kind: "replace-reference-image",
      },
    },
  };

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: 8,
        outcome: {
          kind: "accepted",
          referenceImage: newReferenceImage(),
        },
      },
    ),
  }), {
    state,
    effects: [],
  });
});

// Candidate: replacement and removal have different history descriptions. The
// view should describe undoing a replacement as restoring the previous image,
// not as generic Undo or as Clear/Reload copy borrowed from image removal.
test("candidate: replacement history has specific non-clear labels", () => {
  const view = selectApplicationView({
    session: {
      mode: "align",
      referenceImage: newReferenceImage(),
    },
    history: {
      past: [replacementHistoryRecord({
        before: durableStateFromLoadedState(loadedImageState()),
        after: {
          session: {
            mode: "align",
            referenceImage: newReferenceImage(),
          },
        },
      })],
      future: [],
    },
  });

  assert.equal(view.history.undo.enabled, true);
  assertSemanticLabel(view.history.undo.label, ["image"]);
  assert.match(view.history.undo.label, /previous|old|restore/i);
  assert.doesNotMatch(view.history.undo.label, /^undo(?: change)?$/i);
  assert.doesNotMatch(view.history.undo.label, /clear/i);
});

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
