import {
  MACHINE_HISTORY_KIND,
  MACHINE_PLACEMENT_EDIT_KIND,
} from "./events.js";
import {
  MACHINE_STATUS_NOTICE_KIND,
  createStatusNotice,
} from "./status-notices.js";
import {
  MACHINE_HISTORY_REPLAY_OPERATION,
  createSemanticHistoryRecord,
} from "./history.js";
import {
  replacePlacementEdit,
  replaceRegistration,
  replaceSession,
} from "./state.js";
import {
  normalizePlacement,
} from "../session.js";
import { createPlacementEditedRegistration } from "../registration.js";
import { placementsEqual } from "../session-keys.js";
import {
  createTransitionResult,
} from "./transition-result.js";
import {
  canEditPlacement,
  clearPlacementEditRuntime,
  normalizePlacementEditKind,
} from "./placement-edit-runtime-transition.js";

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
    historyRecord: createSemanticHistoryRecord({
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
    }),
  });
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
