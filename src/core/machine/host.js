import {
  MACHINE_EVENT_KIND,
  MACHINE_INPUT_OVERRIDE,
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
  MACHINE_STATUS_NOTICE_KIND,
} from "./events.js";
import { createMachineEffectRunner } from "./effect-runner.js";
import {
  createPanelTimeoutElapsedResult,
  createStatusTimeoutElapsedResult,
} from "./effects.js";
import { transitionMachineEffectResult } from "./effect-result-transition.js";
import {
  MACHINE_PANEL_PRIMARY_ACTION_KIND,
  selectPanelPrimaryAction,
} from "./policy.js";
import {
  toPersistedMachineSessionSnapshot,
  fromPersistedMachineSession,
} from "./persistence.js";
import { createMachineRuntime } from "./runtime.js";
import { PLACEMENT_EDIT_PLAN_PHASE } from "../placement-edit-planning.js";
import { clampOpacity, opacityFromWheelDelta } from "../transform.js";

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
  // wiring, panel/status timers, and external subscribers. Split effect host
  // services from durable persistence so machine hosting is not the catch-all
  // boundary for every side effect.
  let destroyed = false;
  const panelTimers = new Map();
  const statusTimers = new Map();
  const subscriberUnsubscribes = new Set();
  let runtime = null;
  let unsubscribePersistence = null;
  let lastPersistedKey = "";

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

  function ingestMachineEvent(event) {
    // TODO(smell): Host still ingests event-shaped private commands behind
    // explicit verbs. The final host should interpret public user/fact ingress
    // without routing through the flat machine event vocabulary.
    if (destroyed) {
      return createDestroyedDispatchResult(runtime.getState());
    }
    const result = runtime.applyMachineEvent(event);
    return result;
  }

  function ingestEffectResult(result) {
    if (destroyed) {
      return createDestroyedDispatchResult(runtime.getState());
    }
    return runtime.applyMachineEvent(result, {
      transition: transitionMachineEffectResult,
    });
  }

  function activatePanelPrimary() {
    const state = runtime.getState();
    const action = selectPanelPrimaryAction(state);
    if (action.disabled) {
      return createNoopDispatchResult(state);
    }
    switch (action.kind) {
      case MACHINE_PANEL_PRIMARY_ACTION_KIND.PASTE:
        return ingestMachineEvent({
          type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
          intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
        });
      case MACHINE_PANEL_PRIMARY_ACTION_KIND.PASTE_ARMED:
        return ingestMachineEvent({
          type: MACHINE_EVENT_KIND.CANCEL_PANEL_INTENT,
          requestId: state.panel.requestId,
          noticeKind: MACHINE_STATUS_NOTICE_KIND.PASTE_CANCELLED,
        });
      case MACHINE_PANEL_PRIMARY_ACTION_KIND.CLEAR_PINS:
        return ingestMachineEvent({
          type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
          intent: MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM,
        });
      case MACHINE_PANEL_PRIMARY_ACTION_KIND.CONFIRM_CLEAR_PINS:
        return clearPins();
      case MACHINE_PANEL_PRIMARY_ACTION_KIND.CLEAR_IMAGE:
        return ingestMachineEvent({
          type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
          intent: MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM,
        });
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
    return ingestMachineEvent({ type: MACHINE_EVENT_KIND.UNDO });
  }

  function activateRedo() {
    return ingestMachineEvent({ type: MACHINE_EVENT_KIND.REDO });
  }

  function selectMode(mode) {
    return ingestMachineEvent({
      type: MACHINE_EVENT_KIND.SELECT_MODE,
      mode,
    });
  }

  function setOpacity(opacity) {
    return ingestMachineEvent({
      type: MACHINE_EVENT_KIND.SET_OPACITY,
      opacity,
    });
  }

  function updatePointer(screenPx) {
    return ingestMachineEvent({
      type: MACHINE_EVENT_KIND.UPDATE_POINTER_RUNTIME,
      screenPx,
    });
  }

  function beginPointerGesture(screenPx, { gestureKind }) {
    return ingestMachineEvent({
      type: MACHINE_EVENT_KIND.BEGIN_POINTER_GESTURE,
      screenPx,
      gestureKind,
    });
  }

  function endPointerGesture(screenPx) {
    return ingestMachineEvent({
      type: MACHINE_EVENT_KIND.END_POINTER_GESTURE,
      screenPx,
    });
  }

  function setInputPassThrough(isActive) {
    return ingestMachineEvent({
      type: MACHINE_EVENT_KIND.SET_INPUT_OVERRIDE,
      inputOverride: isActive ? MACHINE_INPUT_OVERRIDE.PASS_THROUGH : null,
    });
  }

  function resetInputRuntime({ screenPx }) {
    return ingestMachineEvent({
      type: MACHINE_EVENT_KIND.RESET_INPUT_RUNTIME,
      screenPx,
    });
  }

  function reportRuntimeError(runtimeError) {
    return reportStatusNotice({
      noticeKind: MACHINE_STATUS_NOTICE_KIND.RUNTIME_ERROR,
      noticePayload: {
        error: runtimeError,
      },
    });
  }

  function loadImage({ image, placement = null, requestId = null } = {}) {
    return ingestMachineEvent({
      type: MACHINE_EVENT_KIND.LOAD_IMAGE,
      image,
      placement,
      requestId,
    });
  }

  function clearImage() {
    return ingestMachineEvent({
      type: MACHINE_EVENT_KIND.CLEAR_IMAGE,
    });
  }

  function clearPins({ preservedPlacement = null } = {}) {
    return ingestMachineEvent({
      type: MACHINE_EVENT_KIND.CLEAR_PINS,
      ...(preservedPlacement ? { preservedPlacement } : {}),
    });
  }

  function fitOverlay() {
    return ingestMachineEvent({
      type: MACHINE_EVENT_KIND.FIT_OVERLAY,
    });
  }

  function requestPanelIntent(intent) {
    return ingestMachineEvent({
      type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
      intent,
    });
  }

  function cancelPanelIntent({ requestId = null, noticeKind = null, noticePayload = null } = {}) {
    return ingestMachineEvent({
      type: MACHINE_EVENT_KIND.CANCEL_PANEL_INTENT,
      requestId,
      noticeKind,
      noticePayload,
    });
  }

  function reportStatusNotice({ noticeKind, noticePayload = null } = {}) {
    return ingestMachineEvent({
      type: MACHINE_EVENT_KIND.REPORT_STATUS_NOTICE,
      noticeKind,
      noticePayload,
    });
  }

  function togglePin({
    imagePx,
    mapLatLon,
    existingPinId = null,
    preservedPlacement = null,
  }) {
    return ingestMachineEvent({
      type: MACHINE_EVENT_KIND.TOGGLE_PIN,
      imagePx,
      mapLatLon,
      existingPinId,
      ...(preservedPlacement ? { preservedPlacement } : {}),
    });
  }

  function applyPlacementEditPlan(plan) {
    if (!plan?.phase) {
      return createNoopDispatchResult(runtime.getState());
    }
    if (plan.phase === PLACEMENT_EDIT_PLAN_PHASE.BEGIN) {
      return ingestMachineEvent({
        type: MACHINE_EVENT_KIND.BEGIN_PLACEMENT_EDIT,
        editKind: plan.kind,
        renderedPlacement: plan.renderedPlacement,
      });
    }
    if (plan.phase === PLACEMENT_EDIT_PLAN_PHASE.PREVIEW) {
      return ingestMachineEvent({
        type: MACHINE_EVENT_KIND.PREVIEW_PLACEMENT_EDIT,
        placement: plan.placement,
      });
    }
    if (plan.phase === PLACEMENT_EDIT_PLAN_PHASE.APPLY) {
      return ingestMachineEvent({
        type: MACHINE_EVENT_KIND.APPLY_PLACEMENT_EDIT,
        editKind: plan.kind,
        renderedPlacement: plan.renderedPlacement,
        placement: plan.placement,
      });
    }
    return createNoopDispatchResult(runtime.getState());
  }

  function finishPlacementEditPlan() {
    return ingestMachineEvent({
      type: MACHINE_EVENT_KIND.COMMIT_PLACEMENT_EDIT,
    });
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
    clearAllPanelTimers();
    clearAllStatusTimers();
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
    cancelPanelTimeout({ requestId });
    if (!setPanelTimeout) {
      return;
    }
    const handle = setPanelTimeout(() => {
      panelTimers.delete(requestId);
      ingestEffectResult(createPanelTimeoutElapsedResult({ requestId }));
    }, {
      intent,
      requestId,
      delayMs: panelTimeoutMs,
      context,
    });
    panelTimers.set(requestId, handle);
  }

  function cancelPanelTimeout({ requestId }) {
    if (!panelTimers.has(requestId)) {
      return;
    }
    const handle = panelTimers.get(requestId);
    panelTimers.delete(requestId);
    clearPanelTimeout?.(handle);
  }

  function startStatusTimeout({ requestId, context }) {
    cancelStatusTimeout({ requestId });
    if (!setStatusTimeout) {
      return;
    }
    const handle = setStatusTimeout(() => {
      statusTimers.delete(requestId);
      ingestEffectResult(createStatusTimeoutElapsedResult({ requestId }));
    }, {
      requestId,
      delayMs: statusTimeoutMs,
      context,
    });
    statusTimers.set(requestId, handle);
  }

  function cancelStatusTimeout({ requestId }) {
    if (!statusTimers.has(requestId)) {
      return;
    }
    const handle = statusTimers.get(requestId);
    statusTimers.delete(requestId);
    clearStatusTimeout?.(handle);
  }

  function clearAllPanelTimers() {
    for (const handle of panelTimers.values()) {
      clearPanelTimeout?.(handle);
    }
    panelTimers.clear();
  }

  function clearAllStatusTimers() {
    for (const handle of statusTimers.values()) {
      clearStatusTimeout?.(handle);
    }
    statusTimers.clear();
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
    activatePanelPrimary,
    activatePanelMode,
    activatePanelModeStep,
    changePanelOpacity,
    changePanelOpacityByWheel,
    activateUndo,
    activateRedo,
    selectMode,
    loadImage,
    clearImage,
    clearPins,
    fitOverlay,
    requestPanelIntent,
    cancelPanelIntent,
    reportStatusNotice,
    updatePointer,
    beginPointerGesture,
    endPointerGesture,
    setInputPassThrough,
    resetInputRuntime,
    reportRuntimeError,
    togglePin,
    applyPlacementEditPlan,
    finishPlacementEditPlan,
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
