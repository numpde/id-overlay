import {
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
  MACHINE_PLACEMENT_EDIT_KIND,
} from "./events.js";
import { MACHINE_STATUS_NOTICE_KIND } from "./status-notices.js";
import { createMachineEffectRunner } from "./effect-runner.js";
import {
  createPanelTimeoutElapsedResult,
  createStatusTimeoutElapsedResult,
} from "./effect-results.js";
import { createRequestTimerRegistry } from "./request-timers.js";
import { transitionMachineEffectResult } from "./effect-result-transition.js";
import {
  applyMachineStatusNotice,
  cancelPanelIntentWithStatusNotice,
  createStatusNoticeResult,
} from "./panel-status-transition.js";
import {
  MACHINE_PANEL_PRIMARY_ACTION_KIND,
  selectPanelPrimaryAction,
} from "./policy.js";
import {
  toPersistedMachineSessionSnapshot,
  fromPersistedMachineSession,
} from "./persistence.js";
import {
  needsPageContextReconciliation,
  reconcilePageContext,
} from "./page-context.js";
import { createMachineRuntime } from "./runtime.js";
import { transitionRuntimeFact } from "./runtime-transition.js";
import {
  transitionActivateRedo,
  transitionActivateUndo,
  transitionApplyPlacementEdit,
  transitionBeginPlacementEdit,
  transitionClearImage,
  transitionClearPins,
  transitionCommitPlacementEdit,
  transitionCancelPanelIntent,
  transitionFitOverlay,
  transitionLoadImage,
  transitionPreviewPlacementEdit,
  transitionRequestPanelIntent,
  transitionSelectMode,
  transitionSetOpacity,
  transitionTogglePin,
} from "./transition.js";
import { clampOpacity, opacityFromWheelDelta } from "../opacity.js";

const DEFAULT_PANEL_TIMEOUT_MS = 1800;
const DEFAULT_STATUS_TIMEOUT_MS = 1800;

export function createMachineHost({
  persistedSession = null,
  savePersistedSession = null,
  readPasteImage = null,
  startManualPasteCapture = null,
  cancelManualPasteCapture = null,
  setPanelTimeout = null,
  clearPanelTimeout = null,
  panelTimeoutMs = DEFAULT_PANEL_TIMEOUT_MS,
  setStatusTimeout = null,
  clearStatusTimeout = null,
  statusTimeoutMs = DEFAULT_STATUS_TIMEOUT_MS,
  onError = null,
} = {}) {
  // TODO(smell): Host owns runtime lifecycle, persistence, effect adapter
  // wiring, and external subscribers. Split effect host services from durable
  // persistence so machine hosting is not the catch-all boundary for every side
  // effect.
  let destroyed = false;
  const subscriberUnsubscribes = new Set();
  let runtime = null;
  let unsubscribePersistence = null;
  let lastPersistedKey = "";
  let pendingPageContextPersistedSession = persistedSession;

  const runEffect = createMachineEffectRunner({
    readPasteImage,
    startManualPasteCapture,
    cancelManualPasteCapture,
    startPanelTimeout,
    cancelPanelTimeout,
    startStatusTimeout,
    cancelStatusTimeout,
    completeEffect: ingestEffectResult,
    onError: reportError,
  });
  const panelTimers = createRequestTimerRegistry({
    setTimer: setPanelTimeout,
    clearTimer: clearPanelTimeout,
    delayMs: panelTimeoutMs,
    createElapsedResult: createPanelTimeoutElapsedResult,
    completeElapsed: ingestEffectResult,
  });
  const statusTimers = createRequestTimerRegistry({
    setTimer: setStatusTimeout,
    clearTimer: clearStatusTimeout,
    delayMs: statusTimeoutMs,
    createElapsedResult: createStatusTimeoutElapsedResult,
    completeElapsed: ingestEffectResult,
  });

  runtime = createMachineRuntime({
    initialState: fromPersistedMachineSession(persistedSession),
    executeEffect: runEffect,
    onEffectError: reportError,
  });
  lastPersistedKey = toPersistedMachineSessionSnapshot(runtime.getState()).key;
  unsubscribePersistence = runtime.subscribe(persistState, {
    emitCurrent: false,
  });

  function getState() {
    return runtime.getState();
  }

  function subscribe(listener, options) {
    if (destroyed) {
      return () => {};
    }
    const unsubscribeRuntime = runtime.subscribe(listener, options);
    function unsubscribe() {
      subscriberUnsubscribes.delete(unsubscribe);
      unsubscribeRuntime();
    }
    subscriberUnsubscribes.add(unsubscribe);
    return unsubscribe;
  }

  function commitMachineTransition(transition, context = {}) {
    if (destroyed) {
      return createDestroyedDispatchResult(runtime.getState());
    }
    return runtime.commitMachineResult(transition(runtime.getState()), context);
  }

  function ingestEffectResult(result) {
    if (destroyed) {
      return createDestroyedDispatchResult(runtime.getState());
    }
    return runtime.commitMachineResult(transitionMachineEffectResult(runtime.getState(), result), {
      effectResult: result,
    });
  }

  function ingestPageContext(pageContext) {
    if (destroyed) {
      return createDestroyedDispatchResult(runtime.getState());
    }
    const currentState = runtime.getState();
    const result = runtime.commitMachineResult(reconcilePageContext(currentState, {
      persistedSession: pendingPageContextPersistedSession,
      pageContext,
    }), {
      pageContext,
    });
    if (
      result.state !== currentState ||
      !needsPageContextReconciliation(currentState, pendingPageContextPersistedSession)
    ) {
      pendingPageContextPersistedSession = null;
    }
    return result;
  }

  function activatePanelPrimary() {
    const state = runtime.getState();
    const action = selectPanelPrimaryAction(state);
    if (action.disabled) {
      return createNoopDispatchResult(state);
    }
    switch (action.kind) {
      case MACHINE_PANEL_PRIMARY_ACTION_KIND.PASTE:
        return requestPanelIntent(MACHINE_PANEL_INTENT.PASTE_ARMED);
      case MACHINE_PANEL_PRIMARY_ACTION_KIND.PASTE_ARMED:
        return cancelCurrentPanelIntentWithStatusNotice({
          requestId: state.panel.requestId,
          noticeKind: MACHINE_STATUS_NOTICE_KIND.PASTE_CANCELLED,
        });
      case MACHINE_PANEL_PRIMARY_ACTION_KIND.CLEAR_PINS:
        return requestPanelIntent(MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM);
      case MACHINE_PANEL_PRIMARY_ACTION_KIND.CONFIRM_CLEAR_PINS:
        return clearPins();
      case MACHINE_PANEL_PRIMARY_ACTION_KIND.CLEAR_IMAGE:
        return requestPanelIntent(MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM);
      case MACHINE_PANEL_PRIMARY_ACTION_KIND.CONFIRM_CLEAR_IMAGE:
        return clearImage();
      default:
        return createNoopDispatchResult(state);
    }
  }

  function activatePanelMode({ checked }) {
    return selectMode(checked ? MACHINE_MODE.TRACE : MACHINE_MODE.ALIGN);
  }

  function activatePanelModeStep({ deltaY }) {
    return selectMode(deltaY < 0 ? MACHINE_MODE.ALIGN : MACHINE_MODE.TRACE);
  }

  function changePanelOpacity(value) {
    return setOpacity(clampOpacity(Number(value)));
  }

  function changePanelOpacityByWheel({ value, deltaY }) {
    return setOpacity(opacityFromWheelDelta(Number(value), deltaY));
  }

  function activateUndo() {
    return commitMachineTransition(transitionActivateUndo, { transition: "undo" });
  }

  function activateRedo() {
    return commitMachineTransition(transitionActivateRedo, { transition: "redo" });
  }

  function selectMode(mode) {
    return commitMachineTransition(
      (state) => transitionSelectMode(state, { mode }),
      { transition: "select-mode", mode },
    );
  }

  function setOpacity(opacity) {
    return commitMachineTransition(
      (state) => transitionSetOpacity(state, { opacity }),
      { transition: "set-opacity", opacity },
    );
  }

  function observeRuntimeFact(fact) {
    if (destroyed) {
      return createDestroyedDispatchResult(runtime.getState());
    }
    return runtime.commitMachineResult(transitionRuntimeFact(runtime.getState(), fact), {
      runtimeFact: fact,
    });
  }

  function reportRuntimeError(runtimeError) {
    return ingestStatusNotice({
      noticeKind: MACHINE_STATUS_NOTICE_KIND.RUNTIME_ERROR,
      noticePayload: {
        error: runtimeError,
      },
    });
  }

  function loadImage({ image, placement = null, requestId = null } = {}) {
    return commitMachineTransition(
      (state) => transitionLoadImage(state, { image, placement, requestId }),
      { transition: "load-image", requestId },
    );
  }

  function clearImage() {
    return commitMachineTransition(transitionClearImage, { transition: "clear-image" });
  }

  function clearPins({ preservedPlacement = null } = {}) {
    return commitMachineTransition(
      (state) => transitionClearPins(state, { preservedPlacement }),
      { transition: "clear-pins" },
    );
  }

  function fitOverlay() {
    return commitMachineTransition(transitionFitOverlay, { transition: "fit-overlay" });
  }

  function requestPanelIntent(intent) {
    return commitMachineTransition(
      (state) => transitionRequestPanelIntent(state, { intent }),
      { transition: "request-panel-intent", intent },
    );
  }

  function cancelPanelIntent({ requestId = null } = {}) {
    return commitMachineTransition(
      (state) => transitionCancelPanelIntent(state, { requestId }),
      { transition: "cancel-panel-intent", requestId },
    );
  }

  function cancelCurrentPanelIntentWithStatusNotice({
    requestId = null,
    noticeKind,
    noticePayload = null,
  } = {}) {
    const state = runtime.getState();
    if (destroyed) {
      return createNoopDispatchResult(state);
    }
    return runtime.commitMachineResult(applyMachineStatusNotice(cancelPanelIntentWithStatusNotice(state, {
      requestId,
      noticeKind,
      noticePayload,
    })), {
      statusNotice: { noticeKind, noticePayload },
    });
  }

  function ingestStatusNotice({ noticeKind, noticePayload = null } = {}) {
    if (destroyed) {
      return createDestroyedDispatchResult(runtime.getState());
    }
    return runtime.commitMachineResult(applyMachineStatusNotice(createStatusNoticeResult(runtime.getState(), {
      noticeKind,
      noticePayload,
    })), {
      statusNotice: { noticeKind, noticePayload },
    });
  }

  function togglePin({
    imagePx,
    mapLatLon,
    existingPinId = null,
    preservedPlacement = null,
  }) {
    return commitMachineTransition(
      (state) => transitionTogglePin(state, {
        imagePx,
        mapLatLon,
        existingPinId,
        preservedPlacement,
      }),
      { transition: "toggle-pin" },
    );
  }

  function beginOverlayMove({ renderedPlacement } = {}) {
    return commitMachineTransition(
      (state) => transitionBeginPlacementEdit(state, {
        editKind: MACHINE_PLACEMENT_EDIT_KIND.MOVE,
        renderedPlacement,
      }),
      { transition: "begin-overlay-move" },
    );
  }

  function previewOverlayMove({ placement } = {}) {
    return commitMachineTransition(
      (state) => transitionPreviewPlacementEdit(state, { placement }),
      { transition: "preview-overlay-move" },
    );
  }

  function commitOverlayMove() {
    return commitMachineTransition(transitionCommitPlacementEdit, {
      transition: "commit-overlay-move",
    });
  }

  function rotateOverlayPlacement({ renderedPlacement, placement } = {}) {
    return commitMachineTransition(
      (state) => transitionApplyPlacementEdit(state, {
        editKind: MACHINE_PLACEMENT_EDIT_KIND.ROTATE,
        renderedPlacement,
        placement,
      }),
      { transition: "rotate-overlay-placement" },
    );
  }

  function scaleOverlayPlacement({ renderedPlacement, placement } = {}) {
    return commitMachineTransition(
      (state) => transitionApplyPlacementEdit(state, {
        editKind: MACHINE_PLACEMENT_EDIT_KIND.SCALE,
        renderedPlacement,
        placement,
      }),
      { transition: "scale-overlay-placement" },
    );
  }

  function changeOpacityByWheel({ deltaY }) {
    return setOpacity(opacityFromWheelDelta(runtime.getState().session.opacity, deltaY));
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    unsubscribePersistence?.();
    clearSubscribers();
    cancelAllManualPasteCaptures();
    panelTimers.clearAll();
    statusTimers.clearAll();
  }

  function persistState(state) {
    const snapshot = toPersistedMachineSessionSnapshot(state);
    if (snapshot.key === lastPersistedKey) {
      return;
    }
    lastPersistedKey = snapshot.key;
    try {
      const maybePromise = savePersistedSession?.(snapshot.session);
      if (isPromiseLike(maybePromise)) {
        maybePromise.catch((error) => reportError(error, { operation: "save" }));
      }
    } catch (error) {
      reportError(error, { operation: "save" });
    }
  }

  function startPanelTimeout({ intent, requestId, context }) {
    panelTimers.start({
      intent,
      requestId,
      context,
    });
  }

  function cancelPanelTimeout({ requestId }) {
    panelTimers.cancel({ requestId });
  }

  function startStatusTimeout({ requestId, context }) {
    statusTimers.start({
      requestId,
      context,
    });
  }

  function cancelStatusTimeout({ requestId }) {
    statusTimers.cancel({ requestId });
  }

  function clearSubscribers() {
    for (const unsubscribe of subscriberUnsubscribes) {
      unsubscribe();
    }
    subscriberUnsubscribes.clear();
  }

  function cancelAllManualPasteCaptures() {
    cancelManualPasteCapture?.({ requestId: null });
  }

  function reportError(error, context) {
    onError?.(error, context);
  }

  return {
    getState,
    subscribe,
    interactionActions: Object.freeze({
      selectMode,
      observeRuntimeFact,
      reportRuntimeError,
      togglePin,
      beginOverlayMove,
      previewOverlayMove,
      commitOverlayMove,
      rotateOverlayPlacement,
      scaleOverlayPlacement,
      changeOpacityByWheel,
    }),
    activatePanelPrimary,
    activatePanelMode,
    activatePanelModeStep,
    changePanelOpacity,
    changePanelOpacityByWheel,
    activateUndo,
    activateRedo,
    ingestPageContext,
    selectMode,
    loadImage,
    clearImage,
    clearPins,
    fitOverlay,
    requestPanelIntent,
    cancelPanelIntent,
    observeRuntimeFact,
    reportRuntimeError,
    togglePin,
    beginOverlayMove,
    previewOverlayMove,
    commitOverlayMove,
    rotateOverlayPlacement,
    scaleOverlayPlacement,
    changeOpacityByWheel,
    destroy,
  };
}

function createDestroyedDispatchResult(state) {
  return createNoopDispatchResult(state);
}

function createNoopDispatchResult(state) {
  return {
    state,
    effects: [],
    historyRecord: null,
    consumedHistoryRecord: null,
  };
}

function isPromiseLike(value) {
  return value && typeof value.catch === "function";
}
