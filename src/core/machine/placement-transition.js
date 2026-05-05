import {
  MACHINE_HISTORY_KIND,
  MACHINE_PLACEMENT_EDIT_KIND,
} from "./events.js";
import { MACHINE_STATUS_NOTICE_KIND } from "./status-notices.js";
import {
  MACHINE_HISTORY_REPLAY_OPERATION,
} from "./history.js";
import {
  replacePlacementEdit,
  replaceRegistration,
  replaceSession,
} from "./state.js";
import {
  createPlacementEditedRegistration,
  normalizePlacement,
  placementsEqual,
} from "../session.js";
import { selectPanelPolicy } from "./policy.js";
import {
  createStatusNotice,
  createTransitionResult,
} from "./transition-result.js";

export function beginPlacementEdit(state, event) {
  // TODO(smell): Placement transition owns both the transient preview lifecycle
  // and committed history replay shape. Split preview state updates from
  // committed placement edits so one-shot wheel edits and drag commits share
  // the same semantic commit path.
  if (!canEditPlacement(state)) {
    return createTransitionResult({
      state,
    });
  }
  const kind = normalizePlacementEditKind(event.editKind);
  const renderedPlacement = normalizePlacement(event.renderedPlacement);
  if (!kind || !renderedPlacement) {
    return createTransitionResult({
      state,
    });
  }
  return createTransitionResult({
    state: replacePlacementEdit(state, {
      kind,
      beforePlacement: renderedPlacement,
      beforeRegistration: state.session.registration,
      previewPlacement: renderedPlacement,
    }),
  });
}

export function previewPlacementEdit(state, event) {
  if (!state.runtime.placementEdit) {
    return createTransitionResult({
      state,
    });
  }
  if (!canEditPlacement(state)) {
    return createTransitionResult({
      state: clearPlacementEditRuntime(state),
    });
  }
  const previewPlacement = normalizePlacement(event.placement);
  if (!previewPlacement) {
    return createTransitionResult({
      state,
    });
  }
  return createTransitionResult({
    state: replacePlacementEdit(state, {
      ...state.runtime.placementEdit,
      previewPlacement,
    }),
  });
}

export function commitPlacementEdit(state) {
  const edit = state.runtime.placementEdit;
  if (!edit) {
    return createTransitionResult({
      state,
    });
  }
  if (!canEditPlacement(state)) {
    return createTransitionResult({
      state: clearPlacementEditRuntime(state),
    });
  }
  const stateWithoutPreview = replacePlacementEdit(state, null);
  if (placementsEqual(edit.beforePlacement, edit.previewPlacement)) {
    return createTransitionResult({
      state: stateWithoutPreview,
    });
  }
  return commitPlacementChange(stateWithoutPreview, {
    placement: edit.previewPlacement,
    previousPlacement: edit.beforePlacement,
    previousRegistration: edit.beforeRegistration,
    editKind: edit.kind,
  });
}

export function cancelPlacementEdit(state) {
  if (!state.runtime.placementEdit) {
    return createTransitionResult({
      state,
    });
  }
  return createTransitionResult({
    state: replacePlacementEdit(state, null),
  });
}

export function applyPlacementEdit(state, event) {
  if (!canEditPlacement(state)) {
    return createTransitionResult({
      state: clearPlacementEditRuntime(state),
    });
  }
  const kind = normalizePlacementEditKind(event.editKind);
  const renderedPlacement = normalizePlacement(event.renderedPlacement);
  const nextPlacement = normalizePlacement(event.placement);
  if (!kind || !renderedPlacement || !nextPlacement) {
    return createTransitionResult({
      state,
    });
  }
  if (placementsEqual(renderedPlacement, nextPlacement)) {
    return createTransitionResult({
      state: replacePlacementEdit(state, null),
    });
  }
  return commitPlacementChange(replacePlacementEdit(state, null), {
    placement: nextPlacement,
    previousPlacement: renderedPlacement,
    previousRegistration: state.session.registration,
    editKind: kind,
  });
}

export function restorePlacement(state, event) {
  if (!state.session.image || !Object.hasOwn(event, "placement")) {
    return createTransitionResult({
      state,
    });
  }
  const nextRegistration = event.registration ?? state.session.registration;
  return createTransitionResult({
    state: replacePlacementEdit(replaceRegistration(replaceSession(state, {
      placement: event.placement,
    }), nextRegistration), null),
  });
}

export function clearPlacementEditRuntime(state) {
  return state.runtime.placementEdit ? replacePlacementEdit(state, null) : state;
}

function commitPlacementChange(state, event) {
  if (!state.session.image || !Object.hasOwn(event, "placement")) {
    return createTransitionResult({
      state,
    });
  }
  const previousPlacement = Object.hasOwn(event, "previousPlacement")
    ? event.previousPlacement
    : state.session.placement;
  const previousRegistration = event.previousRegistration ?? state.session.registration;
  const nextPlacement = event.placement;
  const nextRegistration = event.registration ?? createPlacementEditedRegistration(state.session.registration);
  const nextState = replacePlacementEdit(replaceRegistration(replaceSession(state, {
    placement: nextPlacement,
  }), nextRegistration), null);
  const historyMetadata = resolvePlacementHistoryMetadata(event.editKind);
  return createTransitionResult({
    state: nextState,
    statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.PLACEMENT_CHANGED, {
      editKind: event.editKind,
    }),
    historyRecord: {
      kind: historyMetadata.kind,
      label: historyMetadata.label,
      undoLabel: historyMetadata.undoLabel,
      redoLabel: historyMetadata.redoLabel,
      undo: {
        operation: MACHINE_HISTORY_REPLAY_OPERATION.RESTORE_PLACEMENT,
        placement: previousPlacement,
        registration: previousRegistration,
      },
      redo: {
        operation: MACHINE_HISTORY_REPLAY_OPERATION.RESTORE_PLACEMENT,
        placement: nextPlacement,
        registration: nextRegistration,
      },
    },
  });
}

function canEditPlacement(state) {
  return selectPanelPolicy(state).canEditOverlay;
}

function normalizePlacementEditKind(kind) {
  return Object.values(MACHINE_PLACEMENT_EDIT_KIND).includes(kind) ? kind : null;
}

const PLACEMENT_HISTORY_METADATA = Object.freeze({
  [MACHINE_PLACEMENT_EDIT_KIND.MOVE]: Object.freeze({
    kind: MACHINE_HISTORY_KIND.MOVE_OVERLAY,
    label: "Moved overlay",
    undoLabel: "Undo move overlay",
    redoLabel: "Redo move overlay",
  }),
  [MACHINE_PLACEMENT_EDIT_KIND.ROTATE]: Object.freeze({
    kind: MACHINE_HISTORY_KIND.ROTATE_OVERLAY,
    label: "Rotated overlay",
    undoLabel: "Undo rotate overlay",
    redoLabel: "Redo rotate overlay",
  }),
  [MACHINE_PLACEMENT_EDIT_KIND.SCALE]: Object.freeze({
    kind: MACHINE_HISTORY_KIND.SCALE_OVERLAY,
    label: "Scaled overlay",
    undoLabel: "Undo scale overlay",
    redoLabel: "Redo scale overlay",
  }),
});

function resolvePlacementHistoryMetadata(editKind) {
  return PLACEMENT_HISTORY_METADATA[editKind] ?? PLACEMENT_HISTORY_METADATA[MACHINE_PLACEMENT_EDIT_KIND.MOVE];
}
