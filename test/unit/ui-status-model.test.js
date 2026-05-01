import test from "node:test";
import assert from "node:assert/strict";

import {
  CLEAR_IMAGE_CONFIRMATION_MESSAGE,
  CLEAR_PINS_CONFIRMATION_MESSAGE,
  DIRTY_PINS_STATUS_MESSAGE,
  MANUAL_PASTE_PROMPT,
  resolveUiStatusBaseline,
} from "../../src/core/ui-status-model.js";
import {
  createInitialUiState,
  UI_MODE_KIND,
  UI_PANEL_INTENT_KIND,
} from "../../src/core/ui-state-model.js";

function createUiState(overrides = {}) {
  const initial = createInitialUiState();
  return {
    ...initial,
    ...overrides,
    session: {
      ...initial.session,
      ...overrides.session,
      registration: {
        ...initial.session.registration,
        ...overrides.session?.registration,
      },
    },
    runtime: {
      ...initial.runtime,
      ...overrides.runtime,
      pointer: {
        ...initial.runtime.pointer,
        ...overrides.runtime?.pointer,
      },
    },
    panel: {
      ...initial.panel,
      ...overrides.panel,
    },
  };
}

test("resolveUiStatusBaseline derives canonical panel prompts from panel intent", () => {
  assert.equal(
    resolveUiStatusBaseline({
      uiState: createUiState({
        session: { mode: UI_MODE_KIND.ALIGN },
        panel: { intent: UI_PANEL_INTENT_KIND.PASTE_ARMED },
      }),
    }),
    MANUAL_PASTE_PROMPT,
  );

  assert.equal(
    resolveUiStatusBaseline({
      uiState: createUiState({
        session: {
          mode: UI_MODE_KIND.ALIGN,
          image: { src: "x", width: 1, height: 1 },
        },
        panel: { intent: UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM },
      }),
    }),
    CLEAR_PINS_CONFIRMATION_MESSAGE,
  );

  assert.equal(
    resolveUiStatusBaseline({
      uiState: createUiState({
        session: {
          mode: UI_MODE_KIND.ALIGN,
          image: { src: "x", width: 1, height: 1 },
        },
        panel: { intent: UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM },
      }),
    }),
    CLEAR_IMAGE_CONFIRMATION_MESSAGE,
  );
});

test("resolveUiStatusBaseline derives steady workflow guidance from canonical state and runtime", () => {
  assert.equal(
    resolveUiStatusBaseline({
      uiState: createUiState(),
    }),
    "Paste a screenshot to begin.",
  );

  assert.equal(
    resolveUiStatusBaseline({
      uiState: createUiState({
        session: {
          mode: UI_MODE_KIND.ALIGN,
          image: { src: "x", width: 1, height: 1 },
          registration: {
            pins: [{ id: 1 }, { id: 2 }],
            solvedTransform: null,
            dirty: true,
          },
        },
      }),
    }),
    DIRTY_PINS_STATUS_MESSAGE,
  );

  assert.equal(
    resolveUiStatusBaseline({
      uiState: createUiState({
        session: {
          mode: UI_MODE_KIND.ALIGN,
          image: { src: "x", width: 1, height: 1 },
          registration: {
            pins: [],
            solvedTransform: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0 },
            dirty: false,
          },
        },
        runtime: {
          activeGesture: "map-pan",
        },
      }),
    }),
    "Panning the map while the overlay follows.",
  );
});
