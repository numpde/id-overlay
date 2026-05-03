import { createOverlayInputRouter } from "./overlay/input-router.js";
import { createOverlayRenderer } from "./overlay/renderer.js";

export function createOverlay({ pageAdapter, machineHost, interactions }) {
  let latestSnapshot = pageAdapter.getSnapshot();
  let latestRuntime = interactions.getRuntimeState();
  let inputRouter = null;

  const renderer = createOverlayRenderer({
    pageAdapter,
    getMachineState,
    getRuntimeState,
    getSnapshot,
    onMountChange() {
      inputRouter?.syncMountedInputListeners();
      inputRouter?.syncGlobalPointerListeners();
    },
  });

  inputRouter = createOverlayInputRouter({
    pageAdapter,
    interactions,
    getMachineState,
    getRuntimeState,
    getSnapshot,
    getMountElement: renderer.getMountElement,
  });

  const unsubscribeMachine = machineHost.subscribe(renderer.scheduleRender);
  const unsubscribeViewport = pageAdapter.subscribe((nextSnapshot) => {
    latestSnapshot = nextSnapshot;
    renderer.scheduleRender();
  });
  const unsubscribeInteractions = interactions.subscribe((runtime) => {
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
      unsubscribeInteractions();
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
}
