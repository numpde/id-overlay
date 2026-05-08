import { createOverlayInputRouter } from "./overlay/input-router.js";
import { OVERLAY_INVALIDATION_SOURCE } from "./overlay/invalidation.js";
import { createOverlayRenderer } from "./overlay/renderer.js";
import { createOverlayStateSource } from "./overlay/state-source.js";

export function createOverlay({
  environment,
}) {
  const {
    pageObservation,
    pageProjection,
    isForwardedMapGestureEvent,
    machineHost,
    overlayInteractions,
  } = environment;
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
    onChange(invalidation) {
      if (invalidation.source === OVERLAY_INVALIDATION_SOURCE.RUNTIME) {
        inputRouter?.syncGlobalPointerListeners();
      }
      renderer.scheduleRender();
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
