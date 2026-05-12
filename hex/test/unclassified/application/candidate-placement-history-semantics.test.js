import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { selectApplicationView } from "../../../application/view-model.js";

// Unclassified: candidate product law for placement history semantics.
//
// Serious alternatives considered:
// - No placement undo. Rejected: move/rotate/scale are direct, visible overlay
//   edits; users reasonably expect them to be reversible.
// - Full durable snapshot replay for every history record. Rejected for
//   placement: undoing "move overlay" after a later Trace switch should not
//   unexpectedly switch mode back to Align or revert unrelated opacity/pins.
// - Bespoke inverse code per command. Rejected: it spreads history semantics
//   across transitions and makes undo/redo a second reducer.
// - Event sourcing by replaying original commands. Rejected for now: commands
//   are interpreted against current state, while undo needs stable before/after
//   facts.
//
// Preferred model: placement history records are semantic, scoped records. The
// app records the placement revision before/after a committed move/rotate/scale
// and generic history replay applies that scope over the current durable
// session, preserving unrelated durable facts.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const APPLICATION_DIR = path.join(REPO_ROOT, "hex/application");

const EFFECT_KIND = Object.freeze({
  PERSIST_DURABLE_STATE: "persist-durable-state",
});

const FORBIDDEN_HISTORY_SOURCE_PATTERNS = Object.freeze([
  // History records should carry semantic descriptors; user-facing copy belongs
  // in the view-model boundary so labels can improve without rewriting history.
  {
    label: "stored undo label field",
    pattern: /\bundoLabel\s*:/,
  },
  {
    label: "stored redo label field",
    pattern: /\bredoLabel\s*:/,
  },
]);

// Candidate: registration fit metadata is part of the placement revision, but
// only with its pin context. Manual placement clears solved metadata; undo
// restores it only while the current pins still match the recorded fit.
test("candidate: undoing manual placement restores solved registration placement metadata", () => {
  const record = placementHistoryRecord({
    editKind: "move",
    before: placementRevision({
      placement: originalPlacement(),
      solvedRegistration: solvedRegistration({
        pinIds: [1, 2],
        placement: originalPlacement(),
      }),
    }),
    after: placementRevision({
      placement: movedPlacement(),
      solvedRegistration: null,
    }),
  });

  assert.deepEqual(handleApplicationCommand({
    state: {
      session: referenceImageSession({
        mode: "align",
        pins: [firstPin(), secondPin()],
        placement: movedPlacement(),
      }),
      history: {
        past: [record],
        future: [],
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
  }), {
    state: {
      session: referenceImageSession({
        mode: "align",
        pins: [firstPin(), secondPin()],
        placement: originalPlacement(),
        solvedPlacement: originalPlacement(),
      }),
      history: {
        past: [],
        future: [record],
      },
    },
    effects: [{
      kind: EFFECT_KIND.PERSIST_DURABLE_STATE,
      durableState: durableImageState({
        mode: "align",
        pins: [firstPin(), secondPin()],
        placement: originalPlacement(),
        solvedPlacement: originalPlacement(),
      }),
    }],
  });
});

// Candidate: if the pin context changed after manual placement, undo still
// restores the visible placement but must not resurrect stale solved metadata.
// The user asked to undo a transform edit, not to assert that changed pins still
// solve to the old transform.
test("candidate: undoing placement does not restore solved metadata for changed pins", () => {
  const record = placementHistoryRecord({
    editKind: "move",
    before: placementRevision({
      placement: originalPlacement(),
      solvedRegistration: solvedRegistration({
        pinIds: [1, 2],
        placement: originalPlacement(),
      }),
    }),
    after: placementRevision({
      placement: movedPlacement(),
      solvedRegistration: null,
    }),
  });

  assert.deepEqual(handleApplicationCommand({
    state: {
      session: referenceImageSession({
        mode: "align",
        pins: [firstPin(), thirdPin()],
        placement: movedPlacement(),
      }),
      history: {
        past: [record],
        future: [],
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
  }), {
    state: {
      session: referenceImageSession({
        mode: "align",
        pins: [firstPin(), thirdPin()],
        placement: originalPlacement(),
      }),
      history: {
        past: [],
        future: [record],
      },
    },
    effects: [{
      kind: EFFECT_KIND.PERSIST_DURABLE_STATE,
      durableState: durableImageState({
        mode: "align",
        pins: [firstPin(), thirdPin()],
        placement: originalPlacement(),
      }),
    }],
  });
});

// Candidate: same-session non-placement edits create a new branch but should
// not erase still-valid past placement history. They clear redo future because
// future records no longer follow the current durable timeline.
test("candidate: opacity changes preserve past placement history and clear future", () => {
  const pastRecord = placementHistoryRecord({
    editKind: "move",
    before: placementRevision({
      placement: originalPlacement(),
      solvedRegistration: null,
    }),
    after: placementRevision({
      placement: movedPlacement(),
      solvedRegistration: null,
    }),
  });
  const futureRecord = placementHistoryRecord({
    editKind: "scale",
    before: placementRevision({
      placement: movedPlacement(),
      solvedRegistration: null,
    }),
    after: placementRevision({
      placement: scaledPlacement(),
      solvedRegistration: null,
    }),
  });

  assert.deepEqual(handleApplicationCommand({
    state: {
      session: referenceImageSession({
        mode: "align",
        placement: movedPlacement(),
      }),
      history: {
        past: [pastRecord],
        future: [futureRecord],
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SET_OPACITY, {
      opacity: 0.5,
    }),
  }), {
    state: {
      session: referenceImageSession({
        mode: "align",
        opacity: 0.5,
        placement: movedPlacement(),
      }),
      history: {
        past: [pastRecord],
        future: [],
      },
    },
    effects: [{
      kind: EFFECT_KIND.PERSIST_DURABLE_STATE,
      durableState: durableImageState({
        mode: "align",
        opacity: 0.5,
        placement: movedPlacement(),
      }),
    }],
  });
});

// Candidate: duplicate commit facts are adapter noise, not user edits. They
// must neither persist nor create empty history records.
test("candidate: unchanged placement edit is inert and leaves history untouched", () => {
  const state = {
    session: referenceImageSession({
      mode: "align",
      placement: movedPlacement(),
    }),
    history: {
      past: [placementHistoryRecord({
        editKind: "move",
        before: placementRevision({
          placement: originalPlacement(),
          solvedRegistration: null,
        }),
        after: placementRevision({
          placement: movedPlacement(),
          solvedRegistration: null,
        }),
      })],
      future: [],
    },
  };

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
      {
        editKind: "move",
        placement: movedPlacement(),
      },
    ),
  }), {
    state,
    effects: [],
  });
});

// Candidate: Trace/native-map mode is not an overlay editing mode. Stale
// placement commands cannot mutate placement, persistence, or history.
test("candidate: Trace placement edit is inert and leaves history untouched", () => {
  const state = {
    session: referenceImageSession({
      mode: "trace",
      placement: originalPlacement(),
    }),
    history: {
      past: [placementHistoryRecord({
        editKind: "move",
        before: placementRevision({
          placement: null,
          solvedRegistration: null,
        }),
        after: placementRevision({
          placement: originalPlacement(),
          solvedRegistration: null,
        }),
      })],
      future: [],
    },
  };

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
      {
        editKind: "move",
        placement: movedPlacement(),
      },
    ),
  }), {
    state,
    effects: [],
  });
});

// Candidate: history copy is derived from semantic records at the view-model
// boundary. The important law is not the exact prose; it is that a placement
// record without stored labels still yields specific, non-generic affordances.
test("candidate: view model labels placement history from semantic records", () => {
  const view = selectApplicationView({
    session: referenceImageSession({
      mode: "align",
      placement: movedPlacement(),
    }),
    history: {
      past: [placementHistoryRecord({
        editKind: "move",
        before: placementRevision({
          placement: originalPlacement(),
          solvedRegistration: null,
        }),
        after: placementRevision({
          placement: movedPlacement(),
          solvedRegistration: null,
        }),
      })],
      future: [placementHistoryRecord({
        editKind: "rotate",
        before: placementRevision({
          placement: movedPlacement(),
          solvedRegistration: null,
        }),
        after: placementRevision({
          placement: rotatedPlacement(),
          solvedRegistration: null,
        }),
      })],
    },
  });

  assert.equal(view.history.undo.enabled, true);
  assert.equal(view.history.redo.enabled, true);
  assertSemanticHistoryLabel(view.history.undo.label, ["move", "overlay"]);
  assertSemanticHistoryLabel(view.history.redo.label, ["rotate", "overlay"]);
});

// Candidate: production application code should not bake literal history labels
// into records. Semantic records plus view-model copy keep persistence/replay
// separate from UI wording.
test("candidate: application source stores no history label fields", () => {
  const violations = [];
  for (const filePath of listJavaScriptFiles(APPLICATION_DIR)) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const { label, pattern } of FORBIDDEN_HISTORY_SOURCE_PATTERNS) {
      if (pattern.test(source)) {
        violations.push(`${relativeToRepo(filePath)} contains ${label}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

function placementHistoryRecord({ editKind, before, after }) {
  return {
    kind: "overlay-placement-edit",
    editKind,
    before,
    after,
  };
}

function placementRevision({ placement, solvedRegistration }) {
  return {
    placement,
    solvedRegistration,
  };
}

function solvedRegistration({ pinIds, placement }) {
  return {
    pinIds,
    placement,
  };
}

function assertSemanticHistoryLabel(label, requiredWords) {
  assert.equal(typeof label, "string");
  for (const word of requiredWords) {
    assert.match(label, new RegExp(`\\b${word}\\b`, "i"));
  }
  assert.doesNotMatch(label, /^undo(?: change)?$/i);
  assert.doesNotMatch(label, /^redo(?: change)?$/i);
}

function referenceImageLoadedState({
  mode,
  placement,
  opacity,
  pins,
  solvedPlacement,
}) {
  return {
    session: referenceImageSession({
      mode,
      placement,
      opacity,
      pins,
      solvedPlacement,
    }),
  };
}

function durableImageState({
  mode,
  placement,
  opacity,
  pins,
  solvedPlacement,
}) {
  return referenceImageLoadedState({
    mode,
    placement,
    opacity,
    pins,
    solvedPlacement,
  });
}

function referenceImageSession({
  mode,
  placement = undefined,
  opacity = undefined,
  pins = [],
  solvedPlacement = undefined,
}) {
  const session = {
    mode,
    referenceImage: normalizedReferenceImage(),
  };
  if (placement !== undefined) {
    session.placement = placement;
  }
  if (opacity !== undefined) {
    session.opacity = opacity;
  }
  if (pins.length > 0 || solvedPlacement !== undefined) {
    session.registration = {
      pins,
    };
    if (solvedPlacement !== undefined) {
      session.registration.solvedPlacement = solvedPlacement;
    }
  }
  return session;
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
      x: 320,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 36.84,
    },
  };
}

function secondPin() {
  return {
    id: 2,
    imagePx: {
      x: 500,
      y: 260,
    },
    mapLatLon: {
      lat: -1.22,
      lon: 36.85,
    },
  };
}

function thirdPin() {
  return {
    id: 3,
    imagePx: {
      x: 420,
      y: 300,
    },
    mapLatLon: {
      lat: -1.21,
      lon: 36.86,
    },
  };
}

function originalPlacement() {
  return placement({
    x: 10,
    y: 20,
    scale: 1,
    rotationRad: 0,
  });
}

function movedPlacement() {
  return placement({
    x: 30,
    y: 50,
    scale: 1,
    rotationRad: 0,
  });
}

function rotatedPlacement() {
  return placement({
    x: 30,
    y: 50,
    scale: 1,
    rotationRad: 0.5,
  });
}

function scaledPlacement() {
  return placement({
    x: 30,
    y: 50,
    scale: 1.5,
    rotationRad: 0,
  });
}

function placement({
  x,
  y,
  scale,
  rotationRad,
}) {
  return {
    x,
    y,
    scale,
    rotationRad,
  };
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
