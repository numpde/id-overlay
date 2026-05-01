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

  assert.equal(viewModel.mainAction.label, "Paste");
  assert.equal(viewModel.mainAction.disabled, false);
  assert.equal(viewModel.mainAction.canPasteImage, true);
  assert.equal(viewModel.mainAction.canClearPins, false);
  assert.equal(viewModel.mainAction.shouldReset, false);
  assert.equal(viewModel.modeSwitch.disabled, true);
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

  assert.equal(viewModel.mainAction.label, "Paste");
  assert.equal(viewModel.mainAction.disabled, false);
  assert.equal(viewModel.mainAction.shouldReset, true);
  assert.equal(viewModel.mainAction.canPasteImage, true);
  assert.equal(viewModel.modeSwitch.disabled, true);
});

test("resolveUiViewModel exposes stale paste intent through the same canonical main-action descriptor", () => {
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

  assert.equal(viewModel.mainAction.intent, UI_PANEL_INTENT_KIND.IDLE);
  assert.equal(viewModel.mainAction.label, "Clear 2 pins");
  assert.equal(viewModel.mainAction.canPasteImage, true);
  assert.equal(viewModel.mainAction.canClearPins, true);
  assert.equal(viewModel.mainAction.shouldReset, true);
  assert.equal(viewModel.mainAction.shouldAttachPasteListener, false);
});

test("resolveUiViewModel advances the primary action to clear-image when pins are not clearable", () => {
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

  assert.equal(viewModel.mainAction.canPasteImage, false);
  assert.equal(viewModel.mainAction.canClearPins, false);
  assert.equal(viewModel.mainAction.intent, UI_PANEL_INTENT_KIND.IDLE);
  assert.equal(viewModel.mainAction.target, "clear-image");
  assert.equal(viewModel.mainAction.label, "Clear image");
  assert.equal(viewModel.mainAction.disabled, false);
  assert.equal(viewModel.modeSwitch.disabled, false);
});
