import { buildOverlayViewModel } from "./view-model.js";

export function createOverlayStateSource({
  pageObservation,
  pageProjection,
  machineHost,
  overlayInteractions,
  onChange = null,
  onRuntimeChange = null,
}) {
  let snapshot = pageObservation.getSnapshot();
  let runtime = overlayInteractions.getRuntimeState();
  let presentation = buildCurrentOverlayPresentation();
  let isReady = false;

  const unsubscribeMachine = machineHost.subscribe(() => {
    recomputePresentation();
    notifyChange();
  }, { emitCurrent: false });
  const unsubscribeViewport = pageObservation.subscribe((nextSnapshot) => {
    // TODO(smell): Page snapshot changes and machine changes both schedule the
    // same render, but their provenance is lost. Keep this source as the only
    // aggregation point until overlay render invalidation is explicit.
    snapshot = nextSnapshot;
    recomputePresentation();
    notifyChange();
  });
  const unsubscribeRuntime = overlayInteractions.subscribeRuntime((nextRuntime) => {
    runtime = nextRuntime;
    recomputePresentation();
    if (isReady) {
      onRuntimeChange?.(runtime);
    }
    notifyChange();
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
    const machineState = getMachineState();
    return Object.freeze({
      machineState,
      runtime,
      snapshot,
      viewModel: buildOverlayViewModel({
        machineState,
        runtime,
        snapshot,
        projectMapPinScreenPoint: pageProjection.mapToOverlayLayerScreen,
      }),
    });
  }

  function destroy() {
    unsubscribeMachine();
    unsubscribeViewport();
    unsubscribeRuntime();
  }

  function notifyChange() {
    if (!isReady) {
      return;
    }
    onChange?.();
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
