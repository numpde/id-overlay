import {
  UI_MODE_KIND,
} from "./ui-state-model.js";
import {
  resolveMainActionDescriptor,
} from "./ui-main-action-transition.js";
import {
  resolveHistoryControlPresentation,
} from "./presentation.js";
export {
  PANEL_REPO_URL,
  PANEL_TITLE,
} from "./panel-metadata.js";

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
  // Final semantic-history shape: history input should expose pending
  // transition records, not store-level descriptors. Button presentation
  // should reflect the semantic undoEvent/redoEvent that will run.
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
  const isTrace = mode === UI_MODE_KIND.TRACE;
  const label = isTrace ? "Trace" : "Align";
  return {
    checked: isTrace,
    disabled: !hasImage,
    accessibleLabel: `Mode: ${label}`,
    mode: label.toLowerCase(),
  };
}
