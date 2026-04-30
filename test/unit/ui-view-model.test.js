import test from "node:test";
import assert from "node:assert/strict";

import {
  MANUAL_PASTE_PROMPT,
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
    status: {
      ...initial.status,
      ...overrides.status,
    },
  };
}

test("resolveUiViewModel reflects the empty trace state without panel semantics drift", () => {
  const viewModel = resolveUiViewModel({
    uiState: createInitialUiState(),
    statusMessage: "Paste a screenshot to begin.",
  });

  assert.equal(viewModel.presentation.pasteLabel, "Paste");
  assert.equal(viewModel.presentation.clearButtonLabel, "Paste");
  assert.equal(viewModel.presentation.clearButtonDisabled, true);
  assert.equal(viewModel.presentation.canPasteImage, false);
  assert.equal(viewModel.presentation.canClearPins, false);
  assert.equal(viewModel.actionSemantics.shouldReset, false);
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
    statusMessage: "Ready.",
  });

  assert.equal(viewModel.presentation.clearButtonLabel, "Paste");
  assert.equal(viewModel.presentation.clearButtonDisabled, false);
  assert.equal(viewModel.actionSemantics.shouldReset, true);
  assert.equal(viewModel.actionSemantics.canPasteImage, true);
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
    statusMessage: "Ready.",
  });

  assert.equal(viewModel.presentation.pasteLabel, "Paste…");
  assert.equal(viewModel.presentation.clearButtonLabel, "Clear 2 pins");
  assert.equal(viewModel.presentation.canPasteImage, true);
  assert.equal(viewModel.presentation.canClearPins, true);
  assert.equal(viewModel.presentation.statusMessage, MANUAL_PASTE_PROMPT);
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
    statusMessage: "Ready.",
  });

  assert.equal(viewModel.presentation.canPasteImage, false);
  assert.equal(viewModel.presentation.canClearPins, false);
  assert.equal(viewModel.presentation.clearButtonLabel, "Clear 2 pins");
  assert.equal(viewModel.presentation.clearButtonDisabled, false);
});

test("resolveUiViewModel prefers canonical status overrides over fallback status text", () => {
  const viewModel = resolveUiViewModel({
    uiState: createUiState({
      status: {
        messageOverride: "Pinned 2 points.",
      },
    }),
    statusMessage: "Ready.",
  });

  assert.equal(viewModel.presentation.statusMessage, "Pinned 2 points.");
});
