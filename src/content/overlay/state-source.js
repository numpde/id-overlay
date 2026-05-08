import {
  OVERLAY_INVALIDATION_SOURCE,
  createOverlayInvalidation,
} from "./invalidation.js";
import { buildOverlayPresentation } from "./presentation.js";

export function createOverlayStateSource({
  pageObservation,
  pageProjection,
  machineHost,
  overlayInteractions,
  onChange = null,
}) {
  let snapshot = pageObservation.getSnapshot();
  let runtime = overlayInteractions.getRuntimeState();
  let presentation = buildCurrentOverlayPresentation();
  let isReady = false;

  const unsubscribeMachine = machineHost.subscribe(() => {
    recomputePresentation();
    notifyChange(createOverlayInvalidation(OVERLAY_INVALIDATION_SOURCE.MACHINE));
  }, { emitCurrent: false });
  const unsubscribeViewport = pageObservation.subscribe((nextSnapshot) => {
    snapshot = nextSnapshot;
    recomputePresentation();
    notifyChange(createOverlayInvalidation(OVERLAY_INVALIDATION_SOURCE.PAGE, {
      snapshot,
    }));
  });
  const unsubscribeRuntime = overlayInteractions.subscribeRuntime((nextRuntime) => {
    runtime = nextRuntime;
    recomputePresentation();
    notifyChange(createOverlayInvalidation(OVERLAY_INVALIDATION_SOURCE.RUNTIME, {
      runtime,
    }));
  }, { emitCurrent: false });
  isReady = true;

  function getMachineState() {
    return machineHost.getState();
  }

  function getRuntimeState() {
    return runtime;
  }

  function getSnapshot() {
    return snapshot;
  }

  function getMountElement() {
    return snapshot.mountElement;
  }

  function getOverlayViewModel() {
    return presentation.viewModel;
  }

  function getOverlayInputContext() {
    return {
      machineState: presentation.machineState,
      runtime: presentation.runtime,
      viewModel: presentation.viewModel,
    };
  }

  function recomputePresentation() {
    presentation = buildCurrentOverlayPresentation();
  }

  function buildCurrentOverlayPresentation() {
    return buildOverlayPresentation({
      machineState: getMachineState(),
      runtime,
      snapshot,
      projectMapPinScreenPoint: pageProjection.mapToOverlayLayerScreen,
    });
  }

  function destroy() {
    unsubscribeMachine();
    unsubscribeViewport();
    unsubscribeRuntime();
  }

  function notifyChange(invalidation) {
    if (!isReady) {
      return;
    }
    onChange?.(invalidation);
  }

  return Object.freeze({
    destroy,
    getMountElement,
    getOverlayInputContext,
    getOverlayViewModel,
    getRuntimeState,
    getSnapshot,
  });
}
