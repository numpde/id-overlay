import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { isPlainData } from "../../../application/plain-data.js";

// Class-a: application effects are the complete app-to-runtime work contract.
// This is intentionally exact: adding a new effect kind means adding a product
// cause, a runtime handler, and a test update that explains why the new host
// work belongs in the application vocabulary.
test("baseline effect vocabulary is exact and product-named", () => {
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

const EFFECT_KIND = Object.freeze({
  PERSIST_DURABLE_STATE: "persist-durable-state",
  REQUEST_REFERENCE_IMAGE_INPUT: "request-reference-image-input",
  SCHEDULE_CLEAR_STATUS_NOTICE: "schedule-clear-status-notice",
  SCHEDULE_CLEAR_PANEL_INTENT: "schedule-clear-panel-intent",
});

const FORBIDDEN_EFFECT_KINDS = Object.freeze([
  "durable-state-changed",
  "read-clipboard-image",
  "start-manual-paste-capture",
  "cancel-manual-paste-capture",
  "forward-map-gesture",
  "dispatch-pointer-event",
  "release-image-data-ref",
]);

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
