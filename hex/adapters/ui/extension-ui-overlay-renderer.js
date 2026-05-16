import {
  createOverlayAdapter,
} from "./overlay-adapter.js";
import {
  overlayDomDebugSummary,
} from "./extension-ui-overlay-debug.js";

export function createExtensionOverlayRenderer({
  document,
  displayImageResourcePort = null,
  eventDebugLogger = null,
}) {
  let activeOverlayAdapter = null;
  let latestDispatchInteractionFact = () => {};

  return {
    renderOverlay({
      root,
      view,
      dispatchInteractionFact = () => {},
    }) {
      latestDispatchInteractionFact = dispatchInteractionFact;
      const overlayInput = view.overlayInput ?? {
        kind: "overlay-editing",
      };
      const overlayView = withDisplayImageUrl({
        overlay: view.overlay,
        displayImageResourcePort,
      });
      const overlaySignature = overlayStructuralRenderSignature({
        overlay: overlayView,
        overlayInput,
      });
      const existingOverlayRoot = root.overlay.firstElementChild;
      if (
        root.overlayRenderSignature === overlaySignature
          && existingOverlayRoot
      ) {
        applySurfaceMotion({
          overlayRoot: existingOverlayRoot,
          overlay: overlayView,
          eventDebugLogger,
        });
        return;
      }

      activeOverlayAdapter?.destroy();
      const overlayAdapter = createOverlayAdapter({
        document,
        emitInteractionFact(fact) {
          latestDispatchInteractionFact(fact);
        },
        eventDebugLogger,
      });
      activeOverlayAdapter = overlayAdapter;
      const overlayRoot = overlayAdapter.render(overlayView, overlayInput);
      root.overlay.replaceChildren(overlayRoot);
      root.overlayRenderSignature = overlaySignature;
      eventDebugLogger?.log("overlay.dom", "rendered", overlayDomDebugSummary({
        overlayRoot,
        overlay: overlayView,
        overlayInput,
      }));
      if (view.overlay?.visible && overlayInput.kind !== "native-map") {
        overlayAdapter.bindInput(overlayRoot);
      }
    },
    destroy() {
      activeOverlayAdapter?.destroy();
      activeOverlayAdapter = null;
      latestDispatchInteractionFact = () => {};
    },
  };
}

function overlayStructuralRenderSignature({
  overlay,
  overlayInput,
}) {
  return JSON.stringify({
    overlay: withoutSurfaceMotion(overlay),
    overlayInput,
  });
}

function withoutSurfaceMotion(overlay) {
  if (!overlay || typeof overlay !== "object") {
    return overlay;
  }
  const {
    mapLayer,
    pageSurfaceMotion,
    ...structuralOverlay
  } = overlay;
  return structuralOverlay;
}

function applySurfaceMotion({
  overlayRoot,
  overlay,
  eventDebugLogger,
}) {
  const mapLayer = overlayRoot.querySelector(".id-overlay-map-layer");
  if (!mapLayer) {
    return;
  }
  const surfaceMotion = overlay?.mapLayer ?? overlay?.pageSurfaceMotion ?? null;
  mapLayer.style.transform = surfaceMotion?.transformCss ?? "";
  mapLayer.style.transformOrigin = surfaceMotion?.transformOriginCss ?? "";
  eventDebugLogger?.log("overlay.dom", "surface-motion-applied", overlayDomDebugSummary({
    overlayRoot,
    overlay,
    overlayInput: null,
  }));
}

function withDisplayImageUrl({
  overlay,
  displayImageResourcePort,
}) {
  if (
    !overlay?.visible
      || overlay.displayImageUrl
  ) {
    return overlay;
  }
  if (isRenderableImageDataUrl(overlay.imageDataRef)) {
    return {
      ...overlay,
      displayImageUrl: overlay.imageDataRef,
    };
  }
  const displayImageUrl = displayImageResourcePort?.resolveDisplayImageUrl?.({
    imageDataRef: overlay.imageDataRef,
  });
  if (!displayImageUrl) {
    return overlay;
  }
  return {
    ...overlay,
    displayImageUrl,
  };
}

function isRenderableImageDataUrl(value) {
  return typeof value === "string" && /^data:image\//u.test(value);
}
