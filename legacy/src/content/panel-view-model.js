import {
  selectPanelPrimaryAction,
  selectPanelPolicy,
} from "../core/machine/policy.js";
import {
  selectPanelStatusText,
  selectRedoRecord,
  selectUndoRecord,
} from "../core/machine/selectors.js";

export function selectPanelView(state) {
  const policy = selectPanelPolicy(state);
  const undoRecord = selectUndoRecord(state);
  const redoRecord = selectRedoRecord(state);
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
        tooltip: undoRecord?.undoLabel ?? "",
        disabled: !undoRecord,
      }),
      redo: createHistoryControl({
        fallbackLabel: "Redo",
        tooltip: redoRecord?.redoLabel ?? "",
        disabled: !redoRecord,
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
