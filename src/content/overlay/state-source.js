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
  let isReady = false;

  const unsubscribeMachine = machineHost.subscribe(notifyChange, { emitCurrent: false });
  const unsubscribeViewport = pageObservation.subscribe((nextSnapshot) => {
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
