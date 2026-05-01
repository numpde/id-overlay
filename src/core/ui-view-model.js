import {
  UI_MODE_KIND,
} from "./ui-state-model.js";
import {
  resolveMainActionDescriptor,
} from "./ui-main-action-transition.js";
import {
  resolveHistoryControlPresentation,
} from "./presentation.js";

export const PANEL_TITLE = "Reference Overlay";
export const PANEL_REPO_URL = "https://github.com/numpde/id-overlay";

export function resolveUiViewModel({
  uiState,
  history = {},
}) {
  const mainAction = resolveMainActionDescriptor(uiState);

  return {
    opacityControl: {
      value: String(uiState.session.opacity),
      disabled: !mainAction.hasImage,
    },
    modeSwitch: resolveModeSwitchPresentation({
      mode: uiState.session.mode,
      hasImage: mainAction.hasImage,
    }),
    historyControls: resolveHistoryControlsPresentation(history),
    mainAction,
  };
}

function resolveHistoryControlsPresentation(history) {
  return {
    undo: resolveHistoryButtonPresentation({
      direction: "undo",
      disabled: !history.canUndo,
      descriptor: history.undoDescriptor,
    }),
    redo: resolveHistoryButtonPresentation({
      direction: "redo",
      disabled: !history.canRedo,
      descriptor: history.redoDescriptor,
    }),
  };
}

function resolveHistoryButtonPresentation({ direction, disabled, descriptor }) {
  return {
    disabled,
    ...resolveHistoryControlPresentation({ direction, descriptor }),
  };
}

function resolveModeSwitchPresentation({ mode, hasImage }) {
  const isAlign = mode === UI_MODE_KIND.ALIGN;
  const label = isAlign ? "Align" : "Trace";
  return {
    checked: isAlign,
    disabled: !hasImage,
    accessibleLabel: `Mode: ${label}`,
    mode: label.toLowerCase(),
  };
}
