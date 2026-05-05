import {
  MACHINE_HISTORY_KIND,
  MACHINE_MODE,
} from "./events.js";
import { MACHINE_STATUS_NOTICE_KIND } from "./status-notices.js";
import {
  MACHINE_HISTORY_REPLAY_OPERATION,
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
  createStatusNotice,
  createTransitionResult,
} from "./transition-result.js";

export function loadImage(state, event) {
  // TODO(smell): Image/session transitions repeat the same transaction
  // choreography: replace durable session, clear edit/runtime state, clear the
  // panel request, then author status/history. The final shape should expose a
  // tiny session-change transaction helper so branches state only semantic
  // before/after sessions and labels.
  if (!event.image || !canLoadImageForRequest(state, event)) {
    return createTransitionResult({
      state,
    });
  }
  const nextSession = {
    mode: MACHINE_MODE.ALIGN,
    image: event.image,
    placement: event.placement ?? null,
    registration: createEmptyRegistration(),
  };
  const nextState = resetInputRuntimeState(
    clearPlacementEditRuntime(replaceSession(state, nextSession)),
    { pointerScreenPx: null },
  );
  const panelTransition = clearPanelIntent(state, nextState);
  return createTransitionResult({
    state: panelTransition.state,
    effects: panelTransition.effects,
    statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.IMAGE_LOADED, {
      image: nextState.session.image,
    }),
    historyRecord: {
      kind: MACHINE_HISTORY_KIND.LOAD_IMAGE,
      label: "Loaded image",
      undoLabel: "Remove image",
      redoLabel: "Reload image",
      undo: { operation: MACHINE_HISTORY_REPLAY_OPERATION.CLEAR_IMAGE },
      redo: {
        operation: MACHINE_HISTORY_REPLAY_OPERATION.RESTORE_IMAGE_SESSION,
        session: nextState.session,
      },
    },
  });
}

export function clearImage(state) {
  if (!state.session.image) {
    return createTransitionResult({
      state,
    });
  }
  const previousSession = state.session;
  const nextState = resetInputRuntimeState(
    clearPlacementEditRuntime(replaceSession(state, {
      mode: MACHINE_MODE.TRACE,
      image: null,
      placement: null,
      registration: createEmptyRegistration(),
    })),
    { pointerScreenPx: null },
  );
  const panelTransition = clearPanelIntent(state, nextState);
  return createTransitionResult({
    state: panelTransition.state,
    effects: panelTransition.effects,
    statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.IMAGE_CLEARED),
    historyRecord: {
      kind: MACHINE_HISTORY_KIND.CLEAR_IMAGE,
      label: "Cleared image",
      undoLabel: "Reload image",
      redoLabel: "Clear image",
      undo: {
        operation: MACHINE_HISTORY_REPLAY_OPERATION.RESTORE_IMAGE_SESSION,
        session: previousSession,
      },
      redo: { operation: MACHINE_HISTORY_REPLAY_OPERATION.CLEAR_IMAGE },
    },
  });
}

export function restoreImageSession(state, event) {
  const nextState = resetInputRuntimeState(
    clearPlacementEditRuntime(replaceSession(state, event.session ?? {})),
  );
  const panelTransition = clearPanelIntent(
    state,
    nextState,
  );
  return createTransitionResult({
    state: panelTransition.state,
    effects: panelTransition.effects,
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
  const nextState = resetInputRuntimeState(
    clearPlacementEditRuntime(replaceSession(state, { mode })),
  );
  const panelTransition = clearInvalidPanelIntent(
    state,
    nextState,
  );
  return createTransitionResult({
    state: panelTransition.state,
    effects: panelTransition.effects,
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
