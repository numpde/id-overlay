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
//
// Classification note: the opacity/placement-history composition candidate was
// deleted as redundant. Class-a opacity already preserves existing past history,
// and class-a branch semantics already clear redo future for new durable edits.

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
