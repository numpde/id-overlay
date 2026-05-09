import {
  MACHINE_PLACEMENT_EDIT_KIND,
} from "./events.js";
import {
  createGestureBeganFact,
  createGestureEndedFact,
  createGestureMovedFact,
  createInputInterruptedFact,
  createInputPassThroughPressedFact,
  createInputPassThroughReleasedFact,
  createPointerClearedFact,
  createPointerObservedFact,
} from "./runtime-facts.js";
import { MACHINE_STATUS_NOTICE_KIND } from "./status-notices.js";
import {
  createHostedMachineRuntime,
} from "./host-runtime.js";
import {
  cancelPanelIntentWithStatusNotice as createCancelPanelIntentWithStatusNoticeResult,
  createStatusNoticeResult,
} from "./panel-status-transition.js";
import { transitionRuntimeFact } from "./runtime-transition.js";
import { commitMachineTransitionResult } from "./transition-finalization.js";
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
import { opacityFromWheelDelta } from "../opacity.js";

export function createMachineHost({
  persistedSession = null,
  savePersistedSession = null,
  readPasteImage = null,
  startManualPasteCapture = null,
  cancelManualPasteCapture = null,
  setPanelTimeout = null,
  clearPanelTimeout = null,
  panelTimeoutMs = undefined,
  setStatusTimeout = null,
  clearStatusTimeout = null,
  statusTimeoutMs = undefined,
  onError = null,
} = {}) {
  const hostedRuntime = createHostedMachineRuntime({
    persistedSession,
    savePersistedSession,
    readPasteImage,
    startManualPasteCapture,
    cancelManualPasteCapture,
    setPanelTimeout,
    clearPanelTimeout,
    panelTimeoutMs,
    setStatusTimeout,
    clearStatusTimeout,
    statusTimeoutMs,
    onError,
  });

  function getState() {
    return hostedRuntime.getState();
  }

  function subscribe(listener, options) {
    return hostedRuntime.subscribe(listener, options);
  }

  function commitMachineTransition(transition, context = {}) {
    return hostedRuntime.commitTransition(transition, context);
  }

  function ingestPageContext(pageContext) {
    return hostedRuntime.ingestPageContext(pageContext);
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

  function commitRuntimeFact(fact) {
    return commitMachineTransition((state) => transitionRuntimeFact(state, fact), {
      runtimeFact: fact,
    });
  }

  function observePointer(screenPx) {
    return commitRuntimeFact(createPointerObservedFact(screenPx));
  }

  function clearPointer() {
    return commitRuntimeFact(createPointerClearedFact());
  }

  function observeGestureStart(screenPx, { gestureKind } = {}) {
    return commitRuntimeFact(createGestureBeganFact({ screenPx, gestureKind }));
  }

  function observeGestureMove(screenPx, { gestureKind } = {}) {
    return commitRuntimeFact(createGestureMovedFact({ screenPx, gestureKind }));
  }

  function observeGestureFinish(screenPx) {
    return commitRuntimeFact(createGestureEndedFact({ screenPx }));
  }

  function observeInputInterrupted({ pointerScreenPx = null } = {}) {
    return commitRuntimeFact(createInputInterruptedFact({ pointerScreenPx }));
  }

  function observePassThroughPress() {
    return commitRuntimeFact(createInputPassThroughPressedFact());
  }

  function observePassThroughRelease() {
    return commitRuntimeFact(createInputPassThroughReleasedFact());
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

  function cancelPanelIntentWithStatusNotice({
    requestId = null,
    noticeKind,
    noticePayload = null,
  } = {}) {
    return commitMachineTransition((state) => commitMachineTransitionResult(createCancelPanelIntentWithStatusNoticeResult(state, {
      requestId,
      noticeKind,
      noticePayload,
    })), {
      statusNotice: { noticeKind, noticePayload },
    });
  }

  function ingestStatusNotice({ noticeKind, noticePayload = null } = {}) {
    return commitMachineTransition((state) => commitMachineTransitionResult(createStatusNoticeResult(state, {
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
    return setOpacity(opacityFromWheelDelta(hostedRuntime.getState().session.opacity, deltaY));
  }

  function destroy() {
    hostedRuntime.destroy();
  }

  return {
    getState,
    subscribe,
    interactionActions: Object.freeze({
      selectMode,
      observePointer,
      clearPointer,
      observeGestureStart,
      observeGestureMove,
      observeGestureFinish,
      observeInputInterrupted,
      observePassThroughPress,
      observePassThroughRelease,
      reportRuntimeError,
      togglePin,
      beginOverlayMove,
      previewOverlayMove,
      commitOverlayMove,
      rotateOverlayPlacement,
      scaleOverlayPlacement,
      changeOpacityByWheel,
    }),
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
    cancelPanelIntentWithStatusNotice,
    observePointer,
    clearPointer,
    observeGestureStart,
    observeGestureMove,
    observeGestureFinish,
    observeInputInterrupted,
    observePassThroughPress,
    observePassThroughRelease,
    reportRuntimeError,
    togglePin,
    beginOverlayMove,
    previewOverlayMove,
    commitOverlayMove,
    rotateOverlayPlacement,
    scaleOverlayPlacement,
    setOpacity,
    changeOpacityByWheel,
    destroy,
  };
}
