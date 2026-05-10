import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Unclassified: this file codifies the target effect vocabulary only. The
// authority claim is still pending because nearby implementation uses the older
// `durable-state-changed` effect and still leaves paste/timer workflows partly
// implicit in the shell. Keep these tests as candidate evidence until the
// vocabulary is accepted and the old effect names are deliberately migrated.

const EFFECT_KIND = Object.freeze({
  PERSIST_DURABLE_STATE: "persist-durable-state",
  REQUEST_REFERENCE_IMAGE_INPUT: "request-reference-image-input",
  SCHEDULE_CLEAR_STATUS_NOTICE: "schedule-clear-status-notice",
  SCHEDULE_CLEAR_PANEL_INTENT: "schedule-clear-panel-intent",
});

const DEFAULT_STATUS_NOTICE_DELAY_MS = 2500;
const DEFAULT_PANEL_INTENT_DELAY_MS = 2500;

// Candidate: Paste is product causality. The app should declare reference-image
// input work as an effect; the shell should not infer clipboard/manual-paste
// work by watching `referenceImageInput` appear in state.
test("candidate: activating Paste emits a reference-image input request effect", () => {
  assert.deepEqual(handleApplicationCommand({
    state: {},
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION),
  }), {
    state: {
      referenceImageInput: {
        status: "awaiting-paste",
        requestId: 1,
      },
    },
    effects: [{
      kind: EFFECT_KIND.REQUEST_REFERENCE_IMAGE_INPUT,
      requestId: 1,
    }],
  });
});

// Candidate: persistence is product-declared work. The application should emit
// one canonical persistence effect name instead of the transitional
// `durable-state-changed` wording.
test("candidate: accepted reference image emits canonical durable persistence effect", () => {
  const referenceImage = normalizedReferenceImage();
  const session = {
    mode: "align",
    referenceImage,
  };

  assert.deepEqual(handleApplicationCommand({
    state: {
      referenceImageInput: {
        status: "awaiting-paste",
        requestId: 1,
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
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
    effects: [{
      kind: EFFECT_KIND.PERSIST_DURABLE_STATE,
      durableState: {
        session,
      },
    }],
  });
});

// Candidate: status expiry is product causality because request correlation and
// stale-timeout rejection are application rules. The shell should execute a
// declared timer effect, not notice state changes and start timers on its own.
test("candidate: empty reference-image input schedules status notice expiry", () => {
  assert.deepEqual(handleApplicationCommand({
    state: {
      referenceImageInput: {
        status: "awaiting-paste",
        requestId: 1,
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
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
        kind: "reference-image-paste-empty",
        requestId: 1,
      },
    },
    effects: [{
      kind: EFFECT_KIND.SCHEDULE_CLEAR_STATUS_NOTICE,
      requestId: 1,
      delayMs: DEFAULT_STATUS_NOTICE_DELAY_MS,
    }],
  });
});

// Candidate: destructive confirmation expiry is product causality. If the app
// arms "Clear image?", it should also declare the matching expiry work so the
// shell does not become a hidden confirmation state machine.
test("candidate: arming clear-image confirmation schedules panel intent expiry", () => {
  assert.deepEqual(handleApplicationCommand({
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
    effects: [{
      kind: EFFECT_KIND.SCHEDULE_CLEAR_PANEL_INTENT,
      requestId: 1,
      intentKind: "confirm-clear-reference-image",
      delayMs: DEFAULT_PANEL_INTENT_DELAY_MS,
    }],
  });
});

// Candidate: the vocabulary should stay small and product-named. These samples
// cover the first accepted effects; browser mechanics such as clipboard reads,
// paste listener setup, setTimeout handles, map gesture forwarding, and object
// URL release are adapter mechanics or later strategy decisions, not baseline
// effect names.
test("candidate: first effect vocabulary contains only product-declared work", () => {
  const effects = [
    ...handleApplicationCommand({
      state: {},
      command: createApplicationCommand(APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION),
    }).effects,
    ...handleApplicationCommand({
      state: {
        referenceImageInput: {
          status: "awaiting-paste",
          requestId: 1,
        },
      },
      command: createApplicationCommand(
        APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
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
      state: {
        referenceImageInput: {
          status: "awaiting-paste",
          requestId: 2,
        },
      },
      command: createApplicationCommand(
        APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
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
    effects.map((effect) => effect.kind).sort(),
    Object.values(EFFECT_KIND).sort(),
  );
  assert.deepEqual(
    effects.filter((effect) => BROWSER_MECHANIC_EFFECT_KINDS.has(effect.kind)),
    [],
  );
});

const BROWSER_MECHANIC_EFFECT_KINDS = new Set([
  "read-clipboard-image",
  "start-manual-paste-capture",
  "forward-map-gesture",
  "release-image-data-ref",
  "durable-state-changed",
]);

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
