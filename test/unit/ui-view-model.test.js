import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveUiViewModel,
} from "../../src/core/ui-view-model.js";
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

test("resolveUiViewModel reflects the empty trace state without panel semantics drift", () => {
  const viewModel = resolveUiViewModel({
    uiState: createInitialUiState(),
  });

  assert.equal(viewModel.presentation.clearButtonLabel, "Paste");
  assert.equal(viewModel.presentation.clearButtonDisabled, false);
  assert.equal(viewModel.actionSemantics.canPasteImage, true);
  assert.equal(viewModel.actionSemantics.canClearPins, false);
  assert.equal(viewModel.actionSemantics.shouldReset, false);
  assert.equal(viewModel.presentation.modeSwitch.disabled, true);
});

test("resolveUiViewModel resets stale clear-image confirmation back onto the paste action", () => {
  const viewModel = resolveUiViewModel({
    uiState: createUiState({
      session: {
        mode: UI_MODE_KIND.ALIGN,
      },
      panel: {
        intent: UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM,
      },
    }),
  });

  assert.equal(viewModel.presentation.clearButtonLabel, "Paste");
  assert.equal(viewModel.presentation.clearButtonDisabled, false);
  assert.equal(viewModel.actionSemantics.shouldReset, true);
  assert.equal(viewModel.actionSemantics.canPasteImage, true);
  assert.equal(viewModel.presentation.modeSwitch.disabled, true);
});

test("resolveUiViewModel keeps paste arming and destructive labels on the same canonical basis", () => {
  const viewModel = resolveUiViewModel({
    uiState: createUiState({
      session: {
        mode: UI_MODE_KIND.ALIGN,
        image: { src: "x", width: 1, height: 1 },
        registration: {
          pins: [{ id: 1 }, { id: 2 }],
          solvedTransform: null,
          dirty: false,
        },
      },
      panel: {
        intent: UI_PANEL_INTENT_KIND.PASTE_ARMED,
      },
    }),
  });

  assert.equal(viewModel.presentation.clearButtonLabel, "Clear 2 pins");
  assert.equal(viewModel.actionSemantics.canPasteImage, true);
  assert.equal(viewModel.actionSemantics.canClearPins, true);
  assert.equal(viewModel.actionSemantics.shouldAttachPasteListener, true);
});

test("resolveUiViewModel keeps trace-mode registration affordances disabled without changing the primary action target", () => {
  const viewModel = resolveUiViewModel({
    uiState: createUiState({
      session: {
        mode: UI_MODE_KIND.TRACE,
        image: { src: "x", width: 1, height: 1 },
        registration: {
          pins: [{ id: 1 }, { id: 2 }],
          solvedTransform: null,
          dirty: false,
        },
      },
    }),
  });

  assert.equal(viewModel.actionSemantics.canPasteImage, false);
  assert.equal(viewModel.actionSemantics.canClearPins, false);
  assert.equal(viewModel.presentation.clearButtonLabel, "Clear 2 pins");
  assert.equal(viewModel.presentation.clearButtonDisabled, false);
  assert.equal(viewModel.presentation.modeSwitch.disabled, false);
});
