import test from "node:test";
import assert from "node:assert/strict";

import {
  describeUiStatusCase,
  resolveUiStatusBaseline,
  resolveUiStatusCase,
  UI_STATUS_CASE,
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
    describeUiStatusCase(UI_STATUS_CASE.PANEL_PASTE_ARMED),
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
    describeUiStatusCase(UI_STATUS_CASE.PANEL_CLEAR_PINS_CONFIRM),
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
    describeUiStatusCase(UI_STATUS_CASE.PANEL_CLEAR_IMAGE_CONFIRM),
  );
});

test("resolveUiStatusCase derives canonical semantic status cases", () => {
  assert.equal(
    resolveUiStatusCase(createUiState()),
    UI_STATUS_CASE.EMPTY_SESSION,
  );

  assert.equal(
    resolveUiStatusCase(createUiState({
      session: {
        mode: UI_MODE_KIND.ALIGN,
        image: { src: "x", width: 1, height: 1 },
        registration: {
          pins: [{ id: 1 }, { id: 2 }],
          solvedTransform: null,
          dirty: true,
        },
      },
    })),
    UI_STATUS_CASE.ALIGN_REGISTRATION_NEEDS_FIT,
  );

  assert.equal(
    resolveUiStatusCase(createUiState({
      session: {
        mode: UI_MODE_KIND.TRACE,
        image: { src: "x", width: 1, height: 1 },
        registration: {
          pins: [{ id: 1 }, { id: 2 }],
          solvedTransform: null,
          dirty: true,
        },
      },
    })),
    UI_STATUS_CASE.TRACE_REGISTRATION_NEEDS_FIT,
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
    describeUiStatusCase(UI_STATUS_CASE.ALIGN_REGISTRATION_NEEDS_FIT),
  );

  assert.equal(
    resolveUiStatusBaseline({
      uiState: createUiState({
        session: {
          mode: UI_MODE_KIND.TRACE,
          image: { src: "x", width: 1, height: 1 },
          registration: {
            pins: [{ id: 1 }, { id: 2 }],
            solvedTransform: null,
            dirty: true,
          },
        },
      }),
    }),
    describeUiStatusCase(UI_STATUS_CASE.TRACE_REGISTRATION_NEEDS_FIT),
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

test("describeUiStatusCase is the single source for status copy", () => {
  for (const statusCase of Object.values(UI_STATUS_CASE)) {
    assert.notEqual(describeUiStatusCase(statusCase), "");
  }

  assert.equal(
    describeUiStatusCase(UI_STATUS_CASE.ALIGN_REGISTRATION_NEEDS_FIT),
    "Switch to Trace to fit the overlay from the current pins.",
  );
  assert.equal(
    describeUiStatusCase(UI_STATUS_CASE.TRACE_REGISTRATION_NEEDS_FIT),
    "Fitting overlay from pins…",
  );
  assert.equal(describeUiStatusCase("unknown-case"), "");
});
