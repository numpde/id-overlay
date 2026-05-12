import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import {
  ApplicationBoundaryError,
  APPLICATION_BOUNDARY_ERROR_CODE,
} from "../../../application/errors.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Unclassified: candidate product law for registration solve ownership.
// Rejected alternatives:
// - shell pre-solves placement and passes `solvedPlacement` into select-mode;
// - application emits `solve-registration-placement` as an effect;
// - bootstrap owns a `registrationSolverPort`;
// - rendering derives hidden placement from pins without a product transition.
//
// Preferred model: registration solve is pure domain/application work over
// normalized registration facts already in application state. The shell may
// normalize pointer/page facts when pins are created, but it must not decide
// when or whether a Trace transition fits the overlay.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const HEX_ROOT = path.join(REPO_ROOT, "hex");

const EFFECT_KIND = Object.freeze({
  PERSIST_DURABLE_STATE: "persist-durable-state",
  SCHEDULE_CLEAR_STATUS_NOTICE: "schedule-clear-status-notice",
});

const STATUS_NOTICE_DELAY_MS = 2500;

// Candidate: shell-solved placement payloads are forbidden. They are a second
// product decision path because the shell would choose when the fit happens and
// which placement enters history/durability.
test("candidate: select-mode rejects shell-supplied solved placement", () => {
  assertApplicationBoundaryError(() => createApplicationCommand(
    APPLICATION_COMMAND_KIND.SELECT_MODE,
    {
      mode: "trace",
      solvedPlacement: solvedPlacement(),
    },
  ), APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND);
});

// Candidate: solve failure is also product-owned. If the user asks for Trace as
// the fitted overlay mode but pins cannot produce a transform, stay in Align and
// show a transient product notice. Switching to Trace without placement would be
// a confusing visible mode change with no fit.
test("candidate: failed registration solve stays in Align with a transient notice", () => {
  const state = referenceImageLoadedState({
    mode: "align",
    pins: [degenerateFirstPin(), degenerateSecondPin()],
  });

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: "trace",
    }),
  }), {
    state: {
      ...state,
      notice: {
        kind: "registration-fit-failed",
        reason: "degenerate-pins",
        requestId: 1,
      },
    },
    effects: [{
      kind: EFFECT_KIND.SCHEDULE_CLEAR_STATUS_NOTICE,
      requestId: 1,
      delayMs: STATUS_NOTICE_DELAY_MS,
    }],
  });
});

// Candidate: insufficient pins are not an error if the user simply switches
// modes. Without enough registration facts, Trace remains a native-map posture
// and no placement is fabricated.
test("candidate: selecting Trace with insufficient pins changes mode only", () => {
  const expectedState = referenceImageLoadedState({
    mode: "trace",
    pins: [firstPin()],
  });

  assert.deepEqual(handleApplicationCommand({
    state: referenceImageLoadedState({
      mode: "align",
      pins: [firstPin()],
    }),
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: "trace",
    }),
  }), {
    state: expectedState,
    effects: [{
      kind: EFFECT_KIND.PERSIST_DURABLE_STATE,
      durableState: {
        session: expectedState.session,
      },
    }],
  });
});

// Candidate: solved placement is derived from the current pin set. Editing pins
// preserves current visible placement but clears stale solved metadata so a later
// Trace transition recomputes instead of trusting old fit facts.
test("candidate: registration pin edits invalidate solved placement metadata", () => {
  const placement = solvedPlacement();
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({
      mode: "align",
      placement,
      pins: [firstPin(), secondPin()],
      solvedPlacement: placement,
    }),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
      {
        existingPinId: null,
        imagePx: thirdPin().imagePx,
        mapPx: thirdPin().mapPx,
      },
    ),
  });

  assert.deepEqual(result.state.session.placement, placement);
  assert.deepEqual(result.state.session.registration, {
    pins: [firstPin(), secondPin(), thirdPin()],
  });
  assert.deepEqual(result.effects, [{
    kind: EFFECT_KIND.PERSIST_DURABLE_STATE,
    durableState: {
      session: result.state.session,
    },
  }]);
});

// Candidate: manual overlay placement is the current visible placement, not a
// solved registration fact. Committing a manual placement should clear stale
// solved metadata while preserving pins for future fit attempts.
test("candidate: manual placement edits invalidate solved placement metadata", () => {
  const manualPlacement = {
    x: 40,
    y: 50,
    scale: 2,
    rotationRad: 0.5,
  };
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({
      mode: "align",
      placement: solvedPlacement(),
      pins: [firstPin(), secondPin()],
      solvedPlacement: solvedPlacement(),
    }),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
      {
        editKind: "move",
        placement: manualPlacement,
      },
    ),
  });

  assert.deepEqual(result.state.session, {
    mode: "align",
    referenceImage: normalizedReferenceImage(),
    placement: manualPlacement,
    registration: {
      pins: [firstPin(), secondPin()],
    },
  });
  assert.deepEqual(result.effects, [{
    kind: EFFECT_KIND.PERSIST_DURABLE_STATE,
    durableState: {
      session: result.state.session,
    },
  }]);
});

// Candidate: the codebase should have no registration solver port or solve
// effect. Pure solve belongs in domain/application imports, not at the browser
// adapter boundary.
test("candidate: registration solve has no shell port or effect vocabulary", () => {
  const violations = [];
  for (const filePath of listJavaScriptFiles(HEX_ROOT)) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const forbidden of [
      "registrationSolverPort",
      "solve-registration-placement",
      "command.solvedPlacement",
      "solvedPlacement:",
    ]) {
      if (source.includes(forbidden)) {
        violations.push(`${relativeToRepo(filePath)} contains ${forbidden}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

function referenceImageLoadedState({
  mode,
  placement = undefined,
  pins = undefined,
  solvedPlacement: solvedPlacementData = undefined,
}) {
  const session = {
    mode,
    referenceImage: normalizedReferenceImage(),
  };
  if (placement !== undefined) {
    session.placement = placement;
  }
  if (pins !== undefined) {
    session.registration = {
      pins,
    };
    if (solvedPlacementData !== undefined) {
      session.registration.solvedPlacement = solvedPlacementData;
    }
  }
  return {
    session,
  };
}

function normalizedReferenceImage() {
  return {
    imageDataRef: "data:image/png;base64,reference-image",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

function firstPin() {
  return {
    id: 1,
    imagePx: {
      x: 0,
      y: 0,
    },
    mapPx: {
      x: 100,
      y: 200,
    },
  };
}

function secondPin() {
  return {
    id: 2,
    imagePx: {
      x: 100,
      y: 0,
    },
    mapPx: {
      x: 200,
      y: 200,
    },
  };
}

function thirdPin() {
  return {
    id: 3,
    imagePx: {
      x: 50,
      y: 100,
    },
    mapPx: {
      x: 150,
      y: 300,
    },
  };
}

function degenerateFirstPin() {
  return {
    ...firstPin(),
    imagePx: {
      x: 0,
      y: 0,
    },
  };
}

function degenerateSecondPin() {
  return {
    ...secondPin(),
    imagePx: {
      x: 0,
      y: 0,
    },
  };
}

function solvedPlacement() {
  return {
    x: 100,
    y: 200,
    scale: 1,
    rotationRad: 0,
  };
}

function assertApplicationBoundaryError(run, expectedCode) {
  assert.throws(
    run,
    (error) => (
      error instanceof ApplicationBoundaryError
        && error.name === "ApplicationBoundaryError"
        && error.code === expectedCode
    ),
  );
}

function listJavaScriptFiles(directoryPath) {
  const files = [];
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const filePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJavaScriptFiles(filePath));
      continue;
    }
    if (entry.isFile() && filePath.endsWith(".js")) {
      files.push(filePath);
    }
  }
  return files.sort();
}

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath);
}
