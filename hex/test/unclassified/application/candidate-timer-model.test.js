import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { selectDurableApplicationState } from "../../../application/view-model.js";

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

const STATUS_NOTICE_DELAY_MS = 2500;
const PANEL_INTENT_DELAY_MS = 2500;

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

// Candidate: destructive confirmation expiry is also product causality. Arming
// the confirmation and scheduling expiry must happen in the same transition, so
// the shell cannot watch `panelIntent` and start timers on its own.
test("candidate: panel confirmations emit named clear-intent timer effects", () => {
  const result = handleApplicationCommand({
    state: referenceImageLoadedState(),
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION),
  });

  assert.deepEqual(result, {
    state: {
      ...referenceImageLoadedState(),
      panelIntent: {
        kind: "confirm-clear-reference-image",
        requestId: 1,
      },
    },
    effects: [{
      kind: EFFECT_KIND.SCHEDULE_CLEAR_PANEL_INTENT,
      requestId: 1,
      intentKind: "confirm-clear-reference-image",
      delayMs: PANEL_INTENT_DELAY_MS,
    }],
  });
  assert.deepEqual(result.effects.flatMap(validateTimerEffect), []);
});

// Candidate: clear-panel-intent is a product command, not a timer adapter event.
// It must be request-scoped and intent-scoped so a late timer cannot cancel a
// newer or different confirmation.
test("candidate: clear-panel-intent timer outcome is stale-safe", () => {
  const state = {
    ...referenceImageLoadedState(),
    panelIntent: {
      kind: "confirm-clear-reference-image",
      requestId: 2,
    },
  };

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.CLEAR_PANEL_INTENT, {
      requestId: 1,
      intentKind: "confirm-clear-reference-image",
    }),
  }), {
    state,
    effects: [],
  });

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.CLEAR_PANEL_INTENT, {
      requestId: 2,
      intentKind: "confirm-clear-pins",
    }),
  }), {
    state,
    effects: [],
  });

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.CLEAR_PANEL_INTENT, {
      requestId: 2,
      intentKind: "confirm-clear-reference-image",
    }),
  }), {
    state: referenceImageLoadedState(),
    effects: [],
  });
});

// Candidate: timer effects are transient work declarations. They must never
// appear in durable state and must never smuggle browser timer handles into app
// state.
test("candidate: timer requests are transient and browser-handle-free", () => {
  const statusResult = handleApplicationCommand({
    state: awaitingReferenceImageInputState({ requestId: 3 }),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: 3,
        outcome: {
          kind: "failed",
          reason: "decode-failed",
        },
      },
    ),
  });
  const panelResult = handleApplicationCommand({
    state: referenceImageLoadedState(),
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION),
  });

  for (const result of [statusResult, panelResult]) {
    assert.equal(JSON.stringify(result.state).includes("timeout"), false);
    assert.equal(JSON.stringify(result.state).includes("timer"), false);
    assert.equal(JSON.stringify(selectDurableApplicationState(result.state)).includes("timer"), false);
    assert.deepEqual(result.effects.flatMap(validateTimerEffect), []);
  }
});

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
