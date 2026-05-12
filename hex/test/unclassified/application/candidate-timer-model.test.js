import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Unclassified: candidate product law for timer causality.
// Rejected alternatives:
// - generic `start-timer { purpose }`, because it makes the shell/runtime
//   interpret product reasons;
// - shell state watchers, because they create a second state machine;
// - timer handles in application state, because they are browser mechanics;
// - broad cancel effects, unless a real external resource must be actively freed.
//
// Preferred model: named product timer effects and request-id staleness.

const EFFECT_KIND = Object.freeze({
  SCHEDULE_CLEAR_STATUS_NOTICE: "schedule-clear-status-notice",
  SCHEDULE_CLEAR_PANEL_INTENT: "schedule-clear-panel-intent",
});

const FORBIDDEN_TIMER_EFFECT_FIELDS = Object.freeze([
  "callback",
  "promise",
  "handle",
  "timerHandle",
  "timeoutId",
  "purpose",
]);

const FORBIDDEN_TIMER_EFFECT_KINDS = Object.freeze([
  "start-timer",
  "cancel-timer",
  "timer-fired",
  "set-timeout",
  "clear-timeout",
]);

// Candidate: generic timer vocabulary is forbidden at the application boundary.
// Adding a new timer use case should introduce a named product effect, not a
// new `purpose` string.
test("candidate: application timer effects reject generic timer routers", () => {
  const effects = [
    ...handleApplicationCommand({
      state: awaitingReferenceImageInputState({ requestId: 4 }),
      command: createApplicationCommand(
        APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
        {
          requestId: 4,
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
    effects.map((effect) => effect.kind).sort(),
    [
      EFFECT_KIND.SCHEDULE_CLEAR_PANEL_INTENT,
      EFFECT_KIND.SCHEDULE_CLEAR_STATUS_NOTICE,
    ].sort(),
  );
  assert.deepEqual(effects.flatMap(validateTimerEffect), []);
});

function validateTimerEffect(effect) {
  const violations = [];
  if (FORBIDDEN_TIMER_EFFECT_KINDS.includes(effect.kind)) {
    violations.push(`forbidden generic timer effect: ${effect.kind}`);
  }
  if (effect.kind.includes("timer")) {
    violations.push(`effect kind names mechanism instead of product: ${effect.kind}`);
  }
  for (const field of FORBIDDEN_TIMER_EFFECT_FIELDS) {
    if (Object.hasOwn(effect, field)) {
      violations.push(`forbidden timer field: ${effect.kind}.${field}`);
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
