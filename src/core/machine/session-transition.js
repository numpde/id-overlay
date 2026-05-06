import {
  MACHINE_HISTORY_KIND,
  MACHINE_MODE,
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
  createEmptyRegistration,
  isKnownMachineMode,
  normalizeOpacity,
  replaceSession,
} from "./state.js";
import { shouldFitOnTrace } from "./policy.js";
import {
  canLoadImageForRequest,
  clearInvalidPanelIntent,
  clearPanelIntent,
} from "./panel-status-transition.js";
import { clearPlacementEditRuntime } from "./placement-transition.js";
import { fitOverlay } from "./registration-transition.js";
import { resetInputRuntimeState } from "./runtime-transition.js";
import {
  createTransitionResult,
} from "./transition-result.js";

export function loadImage(state, command = {}) {
  return loadImageSession(state, {
    image: command.image,
    placement: command.placement,
    requestId: command.requestId,
  });
}

export function loadImageSession(state, {
  image,
  placement = null,
  requestId = null,
} = {}) {
  if (!image || !canLoadImageForRequest(state, { requestId })) {
    return createTransitionResult({
      state,
    });
  }
  const nextSession = {
    mode: MACHINE_MODE.ALIGN,
    image,
    placement,
    registration: createEmptyRegistration(),
  };
  return commitSessionPatch(state, nextSession, {
    resetOptions: { pointerScreenPx: null },
    buildStatusNotice: (nextState) => createStatusNotice(MACHINE_STATUS_NOTICE_KIND.IMAGE_LOADED, {
      image: nextState.session.image,
    }),
    buildHistoryRecord: (nextState) => createSemanticHistoryRecord({
      kind: MACHINE_HISTORY_KIND.LOAD_IMAGE,
      label: "Loaded image",
      undoLabel: "Remove image",
      redoLabel: "Reload image",
      undo: { operation: MACHINE_HISTORY_REPLAY_OPERATION.CLEAR_IMAGE },
      redo: {
        operation: MACHINE_HISTORY_REPLAY_OPERATION.RESTORE_IMAGE_SESSION,
        session: nextState.session,
      },
    }),
  });
}

export function clearImage(state) {
  if (!state.session.image) {
    return createTransitionResult({
      state,
    });
  }
  const previousSession = state.session;
  return commitSessionPatch(state, {
    mode: MACHINE_MODE.TRACE,
    image: null,
    placement: null,
    registration: createEmptyRegistration(),
  }, {
    resetOptions: { pointerScreenPx: null },
    statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.IMAGE_CLEARED),
    historyRecord: createSemanticHistoryRecord({
      kind: MACHINE_HISTORY_KIND.CLEAR_IMAGE,
      label: "Cleared image",
      undoLabel: "Reload image",
      redoLabel: "Clear image",
      undo: {
        operation: MACHINE_HISTORY_REPLAY_OPERATION.RESTORE_IMAGE_SESSION,
        session: previousSession,
      },
      redo: { operation: MACHINE_HISTORY_REPLAY_OPERATION.CLEAR_IMAGE },
    }),
  });
}

export function restoreImageSession(state, event) {
  return commitSessionPatch(state, event.session ?? {}, {
    statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.IMAGE_RESTORED),
  });
}

export function selectMode(state, event) {
  if (!isKnownMachineMode(event.mode)) {
    return createTransitionResult({
      state,
    });
  }
  const mode = event.mode;
  if (!state.session.image && mode === MACHINE_MODE.ALIGN) {
    return createTransitionResult({
      state,
    });
  }
  if (mode === state.session.mode && !(mode === MACHINE_MODE.TRACE && shouldFitOnTrace(state))) {
    return createTransitionResult({
      state,
    });
  }
  if (mode === MACHINE_MODE.TRACE && shouldFitOnTrace(state)) {
    return fitOverlay(state);
  }
  return commitSessionPatch(state, { mode }, {
    settlePanel: clearInvalidPanelIntent,
    statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.MODE_SELECTED, { mode }),
  });
}

export function setOpacity(state, event) {
  if (!Number.isFinite(event.opacity)) {
    return createTransitionResult({
      state,
    });
  }
  return createTransitionResult({
    state: replaceSession(state, { opacity: normalizeOpacity(event.opacity) }),
  });
}

function replaceSessionAndResetInteraction(state, sessionPatch, resetOptions = {}) {
  return resetInputRuntimeState(
    clearPlacementEditRuntime(replaceSession(state, sessionPatch)),
    resetOptions,
  );
}

function commitSessionPatch(state, sessionPatch, {
  resetOptions = {},
  settlePanel = clearPanelIntent,
  statusNotice = null,
  buildStatusNotice = null,
  historyRecord = null,
  buildHistoryRecord = null,
} = {}) {
  const nextState = replaceSessionAndResetInteraction(state, sessionPatch, resetOptions);
  const panelTransition = settlePanel(state, nextState);
  return createTransitionResult({
    state: panelTransition.state,
    effects: panelTransition.effects,
    statusNotice: buildStatusNotice?.(nextState) ?? statusNotice,
    historyRecord: buildHistoryRecord?.(nextState) ?? historyRecord,
  });
}
