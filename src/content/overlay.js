import { createOverlayInputRouter } from "./overlay/input-router.js";
import { createOverlayRenderer } from "./overlay/renderer.js";
import { buildOverlayViewModel } from "./overlay/view-model.js";

export function createOverlay({
  pageObservation,
  pageProjection,
  machineHost,
  overlayInteractions,
}) {
  // TODO(smell): Overlay composition still wires machine state, runtime state,
  // page snapshots, renderer scheduling, and input listener retargeting by hand.
  // The final overlay boundary should consume one typed render/input port so
  // snapshot/runtime subscriptions cannot drift across renderer and router.
  let latestSnapshot = pageObservation.getSnapshot();
  let latestRuntime = overlayInteractions.getRuntimeState();
  let inputRouter = null;

  const renderer = createOverlayRenderer({
    getOverlayViewModel,
    getMountElement: () => getSnapshot().mountElement,
    onMountChange() {
      inputRouter?.syncMountedInputListeners();
      inputRouter?.syncGlobalPointerListeners();
    },
  });

  inputRouter = createOverlayInputRouter({
    pageProjection,
    overlayInteractions,
    getRuntimeState,
    getOverlayInputContext,
    getMountElement: renderer.getMountElement,
  });

  const unsubscribeMachine = machineHost.subscribe(renderer.scheduleRender);
  const unsubscribeViewport = pageObservation.subscribe((nextSnapshot) => {
    latestSnapshot = nextSnapshot;
    renderer.scheduleRender();
  });
  const unsubscribeRuntime = overlayInteractions.subscribeRuntime((runtime) => {
    latestRuntime = runtime;
    inputRouter.syncGlobalPointerListeners();
    renderer.scheduleRender();
  });
  renderer.scheduleRender();

  return {
    destroy() {
      inputRouter.destroy();
      unsubscribeMachine();
      unsubscribeViewport();
      unsubscribeRuntime();
      renderer.destroy();
    },
  };

  function getMachineState() {
    return machineHost.getState();
  }

  function getRuntimeState() {
    return latestRuntime;
  }

  function getSnapshot() {
    return latestSnapshot;
  }

  function getOverlayViewModel() {
    return buildCurrentOverlayViewModel({
      machineState: getMachineState(),
      runtime: getRuntimeState(),
    });
  }

  function getOverlayInputContext() {
    const machineState = getMachineState();
    const runtime = getRuntimeState();
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
      snapshot: getSnapshot(),
      projectMapPinScreenPoint: pageProjection.mapToOverlayLayerScreen,
    });
  }
}
