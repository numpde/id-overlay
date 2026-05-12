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

// Unclassified: these tests are candidate law for the desired effect boundary.
// They are intentionally sharper than the current implementation. A passing
// implementation must make product causality explicit through a tiny set of
// application-emitted effects, and must fail the old shell-watcher shape where
// browser code infers work from state changes.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const APPLICATION_DIR = path.join(REPO_ROOT, "hex/application");

const COMMAND_KIND = Object.freeze({
  REPORT_REFERENCE_IMAGE_INPUT_OUTCOME: "report-reference-image-input-outcome",
});

const EFFECT_KIND = Object.freeze({
  PERSIST_DURABLE_STATE: "persist-durable-state",
  REQUEST_REFERENCE_IMAGE_INPUT: "request-reference-image-input",
  SCHEDULE_CLEAR_STATUS_NOTICE: "schedule-clear-status-notice",
  SCHEDULE_CLEAR_PANEL_INTENT: "schedule-clear-panel-intent",
});

const FORBIDDEN_EFFECT_KINDS = Object.freeze([
  // Transitional/internal vocabulary: persistence is product-declared work, not
  // a notification that some shell watcher should interpret.
  "durable-state-changed",

  // Browser mechanics: the reference-image input adapter may use these, but the
  // application effect vocabulary should not choose browser implementation.
  "read-clipboard-image",
  "start-manual-paste-capture",
  "cancel-manual-paste-capture",

  // Interaction/page mechanics: these are shell adapter responsibilities.
  "forward-map-gesture",
  "dispatch-pointer-event",

  // Image-ref lifetime is not part of the baseline vocabulary until the image
  // reference strategy is decided.
  "release-image-data-ref",
]);

const DEFAULT_STATUS_NOTICE_DELAY_MS = 2500;
const DEFAULT_PANEL_INTENT_DELAY_MS = 2500;

// Candidate: accepted input commits a product session and declares persistence
// through the canonical effect name. It should not emit the transitional
// `durable-state-changed` effect or any browser-source-specific work.
test("candidate: accepted reference-image input emits canonical persistence effect", () => {
  const referenceImage = normalizedReferenceImage();
  const session = {
    mode: "align",
    referenceImage,
  };

  assertApplicationResult(handleApplicationCommand({
    state: awaitingReferenceImageInputState({ requestId: 1 }),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: 1,
        outcome: {
          kind: "accepted",
          referenceImage,
        },
      },
    ),
  }), {
    state: {
      session,
    },
    effects: [
      effect({
        kind: EFFECT_KIND.PERSIST_DURABLE_STATE,
        durableState: {
          session,
        },
      }),
    ],
  });
});

// Candidate: status expiry is product causality because request correlation and
// stale-timeout rejection are application rules. The app should declare the
// timeout; the shell should not watch notices and start timers on its own.
test("candidate: empty reference-image input schedules status notice expiry", () => {
  assertApplicationResult(handleApplicationCommand({
    state: awaitingReferenceImageInputState({ requestId: 1 }),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: 1,
        outcome: {
          kind: "empty",
        },
      },
    ),
  }), {
    state: {
      notice: {
        kind: "reference-image-input-empty",
        requestId: 1,
      },
    },
    effects: [
      effect({
        kind: EFFECT_KIND.SCHEDULE_CLEAR_STATUS_NOTICE,
        requestId: 1,
        delayMs: DEFAULT_STATUS_NOTICE_DELAY_MS,
      }),
    ],
  });
});

// Candidate: destructive confirmation expiry is product causality. Arming the
// confirmation and scheduling its expiry must be one application transition so
// the shell cannot become the confirmation state machine.
test("candidate: arming clear-image confirmation schedules panel intent expiry", () => {
  assertApplicationResult(handleApplicationCommand({
    state: referenceImageLoadedState(),
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION),
  }), {
    state: {
      ...referenceImageLoadedState(),
      panelIntent: {
        kind: "confirm-clear-reference-image",
        requestId: 1,
      },
    },
    effects: [
      effect({
        kind: EFFECT_KIND.SCHEDULE_CLEAR_PANEL_INTENT,
        requestId: 1,
        intentKind: "confirm-clear-reference-image",
        delayMs: DEFAULT_PANEL_INTENT_DELAY_MS,
      }),
    ],
  });
});

// Candidate: this is the baseline vocabulary, not a sampling convenience. If a
// use case needs another effect, it should be added here deliberately with a
// product-causality explanation. Browser mechanics should never sneak in as
// effect names.
test("candidate: baseline effect vocabulary is exact and product-named", () => {
  const observedEffects = [
    ...handleApplicationCommand({
      state: {},
      command: createApplicationCommand(APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION),
    }).effects,
    ...handleApplicationCommand({
      state: awaitingReferenceImageInputState({ requestId: 1 }),
      command: createApplicationCommand(
        APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
        {
          requestId: 1,
          outcome: {
            kind: "accepted",
            referenceImage: normalizedReferenceImage(),
          },
        },
      ),
    }).effects,
    ...handleApplicationCommand({
      state: awaitingReferenceImageInputState({ requestId: 2 }),
      command: createApplicationCommand(
        APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
        {
          requestId: 2,
          outcome: {
            kind: "empty",
          },
        },
      ),
    }).effects,
    ...handleApplicationCommand({
      state: referenceImageLoadedState(),
      command: createApplicationCommand(APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION),
    }).effects,
  ];

  assert.deepEqual(
    observedEffects.map((observedEffect) => observedEffect.kind).sort(),
    Object.values(EFFECT_KIND).sort(),
  );
  assert.deepEqual(
    observedEffects.flatMap(validateEffectShape),
    [],
  );
});

// Candidate: even before runtime wiring exists, production application source
// should not contain the rejected effect names. This catches the undesired shape
// directly instead of relying only on the sampled transitions above.
test("candidate: application source contains no forbidden effect vocabulary", () => {
  const violations = [];
  for (const filePath of listJavaScriptFiles(APPLICATION_DIR)) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const forbiddenKind of FORBIDDEN_EFFECT_KINDS) {
      if (source.includes(forbiddenKind)) {
        violations.push(`${relativeToRepo(filePath)} contains ${forbiddenKind}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

function assertApplicationResult(actual, expected) {
  assert.deepEqual(actual, expected);
  assertPlainData(actual);
  assert.deepEqual(actual.effects.flatMap(validateEffectShape), []);
}

function effect(payload) {
  assert.deepEqual(validateEffectShape(payload), []);
  return payload;
}

function validateEffectShape(candidateEffect) {
  const violations = [];
  if (!Object.values(EFFECT_KIND).includes(candidateEffect.kind)) {
    violations.push(`unknown effect kind: ${candidateEffect.kind}`);
  }
  if (FORBIDDEN_EFFECT_KINDS.includes(candidateEffect.kind)) {
    violations.push(`forbidden effect kind: ${candidateEffect.kind}`);
  }
  if (!isPlainData(candidateEffect)) {
    violations.push(`non-plain effect: ${candidateEffect.kind}`);
  }
  for (const forbiddenKey of [
    "callback",
    "promise",
    "handle",
    "timerHandle",
    "imageHandle",
    "storageKey",
    "element",
    "event",
  ]) {
    if (Object.hasOwn(candidateEffect, forbiddenKey)) {
      violations.push(`forbidden effect field: ${candidateEffect.kind}.${forbiddenKey}`);
    }
  }
  return violations;
}

function awaitingReferenceImageInputState({ requestId }) {
  return {
    referenceImageInput: {
      status: "awaiting-input",
      requestId,
    },
  };
}

function referenceImageLoadedState() {
  return {
    session: {
      mode: "align",
      referenceImage: normalizedReferenceImage(),
    },
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

function assertPlainData(value) {
  assert.equal(isPlainData(value), true);
}

function isPlainData(value) {
  if (value === null) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isPlainData);
  }

  const valueType = typeof value;
  if (["string", "boolean"].includes(valueType)) {
    return true;
  }
  if (valueType === "number") {
    return Number.isFinite(value);
  }
  if (valueType !== "object") {
    return false;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return false;
  }
  return Object.values(value).every(isPlainData);
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
