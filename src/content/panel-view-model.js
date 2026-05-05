import {
  selectPanelPrimaryAction,
  selectPanelPolicy,
} from "../core/machine/policy.js";
import {
  selectCanRedo,
  selectCanUndo,
  selectPanelStatusText,
  selectRedoRecord,
  selectUndoRecord,
} from "../core/machine/selectors.js";

export function selectPanelView(state) {
  const policy = selectPanelPolicy(state);
  return {
    mode: state.session.mode,
    opacityControl: {
      value: String(state.session.opacity),
      disabled: !policy.canSetOpacity,
    },
    modeSwitch: {
      checked: policy.isTrace,
      disabled: !policy.canSelectAlign,
      accessibleLabel: `Mode: ${policy.isTrace ? "Trace" : "Align"}`,
      mode: state.session.mode,
    },
    mainAction: selectPanelPrimaryAction(state),
    status: selectPanelStatusText(state),
    historyControls: {
      undo: createHistoryControl({
        fallbackLabel: "Undo",
        tooltip: selectUndoRecord(state)?.undoLabel ?? "",
        disabled: !selectCanUndo(state),
      }),
      redo: createHistoryControl({
        fallbackLabel: "Redo",
        tooltip: selectRedoRecord(state)?.redoLabel ?? "",
        disabled: !selectCanRedo(state),
      }),
    },
  };
}

function createHistoryControl({ fallbackLabel, tooltip, disabled }) {
  return {
    disabled,
    title: tooltip,
    accessibleLabel: tooltip || fallbackLabel,
  };
}
