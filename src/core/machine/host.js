import {
  MACHINE_EVENT_KIND,
  MACHINE_INPUT_OVERRIDE,
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
  MACHINE_STATUS_NOTICE_KIND,
  createCancelPanelIntentEvent,
} from "./events.js";
import { createMachineEffectRunner } from "./effect-runner.js";
import {
  MACHINE_PANEL_PRIMARY_ACTION_KIND,
  selectPanelPrimaryAction,
} from "./policy.js";
import {
  toPersistedMachineSessionSnapshot,
  fromPersistedMachineSession,
} from "./persistence.js";
import { createMachineRuntime } from "./runtime.js";
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
    dispatch: (event) => dispatch(event),
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

  function dispatch(event) {
    // TODO(smell): Host exposes the flat machine dispatch surface directly to
    // content. The final host should expose public user/fact ingress while
    // private mutation/replay commands remain unreachable outside the machine.
    if (destroyed) {
      return createDestroyedDispatchResult(runtime.getState());
    }
    const result = runtime.dispatch(event);
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
        return dispatch({
          type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
          intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
        });
      case MACHINE_PANEL_PRIMARY_ACTION_KIND.PASTE_ARMED:
        return dispatch(createCancelPanelIntentEvent({
          requestId: state.panel.requestId,
          noticeKind: MACHINE_STATUS_NOTICE_KIND.PASTE_CANCELLED,
        }));
      case MACHINE_PANEL_PRIMARY_ACTION_KIND.CLEAR_PINS:
        return dispatch({
          type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
          intent: MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM,
        });
      case MACHINE_PANEL_PRIMARY_ACTION_KIND.CONFIRM_CLEAR_PINS:
        return dispatch({ type: MACHINE_EVENT_KIND.CLEAR_PINS });
      case MACHINE_PANEL_PRIMARY_ACTION_KIND.CLEAR_IMAGE:
        return dispatch({
          type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
          intent: MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM,
        });
      case MACHINE_PANEL_PRIMARY_ACTION_KIND.CONFIRM_CLEAR_IMAGE:
        return dispatch({ type: MACHINE_EVENT_KIND.CLEAR_IMAGE });
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
    return dispatch({ type: MACHINE_EVENT_KIND.UNDO });
  }

  function activateRedo() {
    return dispatch({ type: MACHINE_EVENT_KIND.REDO });
  }

  function selectMode(mode) {
    return dispatch({
      type: MACHINE_EVENT_KIND.SELECT_MODE,
      mode,
    });
  }

  function setOpacity(opacity) {
    return dispatch({
      type: MACHINE_EVENT_KIND.SET_OPACITY,
      opacity,
    });
  }

  function updatePointer(screenPx) {
    return dispatch({
      type: MACHINE_EVENT_KIND.UPDATE_POINTER_RUNTIME,
      screenPx,
    });
  }

  function beginPointerGesture(screenPx, { gestureKind }) {
    return dispatch({
      type: MACHINE_EVENT_KIND.BEGIN_POINTER_GESTURE,
      screenPx,
      gestureKind,
    });
  }

  function endPointerGesture(screenPx) {
    return dispatch({
      type: MACHINE_EVENT_KIND.END_POINTER_GESTURE,
      screenPx,
    });
  }

  function setInputPassThrough(isActive) {
    return dispatch({
      type: MACHINE_EVENT_KIND.SET_INPUT_OVERRIDE,
      inputOverride: isActive ? MACHINE_INPUT_OVERRIDE.PASS_THROUGH : null,
    });
  }

  function resetInputRuntime({ screenPx }) {
    return dispatch({
      type: MACHINE_EVENT_KIND.RESET_INPUT_RUNTIME,
      screenPx,
    });
  }

  function reportRuntimeError(runtimeError) {
    return dispatch({
      type: MACHINE_EVENT_KIND.REPORT_STATUS_NOTICE,
      noticeKind: MACHINE_STATUS_NOTICE_KIND.RUNTIME_ERROR,
      noticePayload: {
        error: runtimeError,
      },
    });
  }

  function togglePin({
    imagePx,
    mapLatLon,
    existingPinId = null,
    preservedPlacement = null,
  }) {
    return dispatch({
      type: MACHINE_EVENT_KIND.TOGGLE_PIN,
      imagePx,
      mapLatLon,
      existingPinId,
      ...(preservedPlacement ? { preservedPlacement } : {}),
    });
  }

  function applyPlacementEditPlan(plan) {
    if (!plan?.event) {
      return createNoopDispatchResult(runtime.getState());
    }
    return dispatch(plan.event);
  }

  function finishPlacementEditPlan() {
    return dispatch({
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
      // TODO(smell): Timer expiry is expressed as a public cancel-panel event.
      // Treat timeout expiry as an effect-result fact at the host boundary and
      // let the machine own panel request cancellation semantics.
      dispatch(createCancelPanelIntentEvent({ requestId }));
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
      // TODO(smell): Status timeout expiry constructs a low-level clear-status
      // command in the host. The final effect boundary should report timeout
      // completion facts and keep status mutation commands private.
      dispatch({
        type: MACHINE_EVENT_KIND.CLEAR_STATUS_NOTICE,
        requestId,
      });
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
    dispatch,
    activatePanelPrimary,
    activatePanelMode,
    activatePanelModeStep,
    changePanelOpacity,
    changePanelOpacityByWheel,
    activateUndo,
    activateRedo,
    selectMode,
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
