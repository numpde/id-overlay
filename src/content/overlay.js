import { createOverlayInputRouter } from "./overlay/input-router.js";
import { createOverlayRenderer } from "./overlay/renderer.js";
import { createOverlayStateSource } from "./overlay/state-source.js";

export function createOverlay({
  pageObservation,
  pageProjection,
  isForwardedMapGestureEvent,
  machineHost,
  overlayInteractions,
}) {
  let overlayStateSource = null;
  let inputRouter = null;

  const renderer = createOverlayRenderer({
    getOverlayViewModel: () => overlayStateSource.getOverlayViewModel(),
    getMountElement: () => overlayStateSource.getMountElement(),
    onMountChange() {
      inputRouter?.syncMountedInputListeners();
      inputRouter?.syncGlobalPointerListeners();
    },
  });
  overlayStateSource = createOverlayStateSource({
    pageObservation,
    pageProjection,
    machineHost,
    overlayInteractions,
    onChange: renderer.scheduleRender,
    onRuntimeChange() {
      inputRouter?.syncGlobalPointerListeners();
    },
  });

  inputRouter = createOverlayInputRouter({
    pageProjection,
    overlayInteractions,
    getRuntimeState: overlayStateSource.getRuntimeState,
    getOverlayInputContext: overlayStateSource.getOverlayInputContext,
    getMountElement: renderer.getMountElement,
    isForwardedMapGestureEvent,
  });
  renderer.scheduleRender();

  return {
    destroy() {
      inputRouter.destroy();
      overlayStateSource.destroy();
      renderer.destroy();
    },
  };
}
