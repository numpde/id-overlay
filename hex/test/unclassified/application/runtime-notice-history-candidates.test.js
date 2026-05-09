import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import {
  assertApplicationResult,
} from "../../class-b/application/application-result-assertions.js";
import {
  movedPlacement,
  placementEditPayload,
} from "../../class-b/application/placement-fixtures.js";
import {
  firstPin,
  pinTogglePayload,
  referenceImageDurableState,
  referenceImageLoadedState,
} from "../../class-b/application/reference-image-fixtures.js";
import {
  historyWithPast,
  identityPlacement,
} from "../../class-c/application/placement-fixtures.js";
import {
  durableStateChangedEffect,
} from "../../class-c/application/durable-state-fixtures.js";

// Unclassified candidate: registration edits after a fit should preserve the
// current visible placement instead of making the overlay jump.
test("adding a registration pin can preserve current visible placement", () => {
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({
      pins: [firstPin()],
    }),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
      pinTogglePayload({
        imagePx: {
          x: 300,
          y: 150,
        },
        mapLatLon: {
          lat: -1.1,
          lon: 37.1,
        },
        preservedPlacement: movedPlacement(),
      }),
    ),
  });

  assert.deepEqual(result.state.session.placement, movedPlacement());
});

// Unclassified candidate: a new durable edit should invalidate redo history.
// The exact history shape is not stable enough for class-b yet.
test("new durable edit clears redo history", () => {
  const state = {
    ...referenceImageLoadedState(),
    history: {
      past: [],
      future: [{
        kind: "move-overlay",
      }],
    },
  };
  const result = handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SET_OPACITY, {
      opacity: 0.5,
    }),
  });

  assert.deepEqual(result.state.history.future, []);
});

// Unclassified candidate: a new user intent should clear stale notice state so
// status copy cannot be composed from an old outcome and a new prompt.
test("new user intent clears stale notice", () => {
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

  assert.equal(result.state.notice, null);
});

// Unclassified candidate: request-bound status clearing prevents older timeout
// results from erasing newer notices.
test("status clear is request-bound", () => {
  const state = {
    ...referenceImageLoadedState(),
    notice: {
      kind: "reference-image-paste-empty",
      requestId: 2,
    },
  };

  assertApplicationResult(handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.CLEAR_STATUS_NOTICE, {
      requestId: 1,
    }),
  }), {
    state,
    effects: [],
  });
});

// Unclassified candidate: committing a placement edit that makes no visible
// change should clear preview runtime but not record history or persist.
test("unchanged placement edit does not create history or durability effect", () => {
  const state = {
    ...referenceImageLoadedState(),
    history: historyWithPast(),
  };

  assertApplicationResult(handleApplicationCommand({
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
      placementEditPayload({ kind: "move", placement: identityPlacement() }),
    ),
  }), {
    state,
    effects: [],
  });
});

// Unclassified candidate: abandoning a placement edit should drop preview state
// while preserving the committed durable session.
test("interrupted placement edit drops preview without changing durable session", () => {
  const state = {
    ...referenceImageLoadedState(),
    placementPreview: {
      beforePlacement: identityPlacement(),
      previewPlacement: movedPlacement(),
    },
  };

  assertApplicationResult(handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: "trace",
    }),
  }), {
    state: referenceImageLoadedState({ mode: "trace" }),
    effects: [
      durableStateChangedEffect(referenceImageDurableState({ mode: "trace" })),
    ],
  });
});
