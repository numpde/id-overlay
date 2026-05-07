import { buildOverlayViewModel } from "./view-model.js";

export function createOverlayStateSource({
  pageObservation,
  pageProjection,
  machineHost,
  overlayInteractions,
  onChange = null,
  onRuntimeChange = null,
}) {
  // TODO(smell): Overlay render/input context is assembled from three live
  // subscriptions: machine state, page snapshot, and interaction runtime. The
  // ideal shape should expose one canonical overlay presentation stream.
  let snapshot = pageObservation.getSnapshot();
  let runtime = overlayInteractions.getRuntimeState();
  let isReady = false;

  const unsubscribeMachine = machineHost.subscribe(notifyChange, { emitCurrent: false });
  const unsubscribeViewport = pageObservation.subscribe((nextSnapshot) => {
    // TODO(smell): Page snapshot changes and machine changes both schedule the
    // same render, but their provenance is lost. Keep this source as the only
    // aggregation point until overlay render invalidation is explicit.
    snapshot = nextSnapshot;
    notifyChange();
  });
  const unsubscribeRuntime = overlayInteractions.subscribeRuntime((nextRuntime) => {
    runtime = nextRuntime;
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
    return buildCurrentOverlayViewModel({
      machineState: getMachineState(),
      runtime,
    });
  }

  function getOverlayInputContext() {
    // TODO(smell): Input routing rebuilds the overlay view model on demand,
    // separately from rendering. Final shape should share one latest overlay
    // presentation object for render and hit-testing.
    const machineState = getMachineState();
    return {
      machineState,
      runtime,
      viewModel: buildCurrentOverlayViewModel({ machineState, runtime }),
    };
  }

  function buildCurrentOverlayViewModel({ machineState, runtime }) {
    return buildOverlayViewModel({
      machineState,
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
