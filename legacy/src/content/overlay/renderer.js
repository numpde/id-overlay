import { createOverlayHost } from "./host.js";
import {
  createImageFrameReconciler,
  createPinLayerReconciler,
  createViewportReconciler,
} from "./render-reconcilers.js";

export function createOverlayRenderer({
  getOverlayViewModel,
  getMountElement,
  onMountChange,
}) {
  const overlayRoot = document.createElement("div");
  overlayRoot.className = "id-overlay-viewport";
  overlayRoot.dataset.idOverlayOwned = "true";

  const mapLayer = document.createElement("div");
  mapLayer.className = "id-overlay-map-layer";

  const overlayImage = document.createElement("img");
  overlayImage.className = "id-overlay-image";
  overlayImage.alt = "";
  overlayImage.decoding = "async";

  const overlayFrame = document.createElement("div");
  overlayFrame.className = "id-overlay-frame";

  const mapPinLayer = document.createElement("div");
  mapPinLayer.className = "id-overlay-map-pin-layer";

  const pinLayer = document.createElement("div");
  pinLayer.className = "id-overlay-pin-layer";

  mapLayer.append(overlayImage, overlayFrame, mapPinLayer, pinLayer);
  overlayRoot.append(mapLayer);

  const reconcileViewport = createViewportReconciler({
    root: overlayRoot,
    mapLayer,
  });
  const reconcileImageFrame = createImageFrameReconciler({
    imageElement: overlayImage,
    frameElement: overlayFrame,
  });
  const reconcilePinLayer = createPinLayerReconciler({
    mapPinLayer,
    pinLayer,
  });

  const host = createOverlayHost({
    root: overlayRoot,
    getMountElement,
    render,
    onMountChange,
  });

  return {
    getMountElement: host.getMountElement,
    scheduleRender: host.scheduleRender,
    destroy: host.destroy,
  };

  function render() {
    const viewModel = getOverlayViewModel();
    reconcileViewport(viewModel);
    reconcileImageFrame(viewModel);
    reconcilePinLayer(viewModel.pins);
  }
}
