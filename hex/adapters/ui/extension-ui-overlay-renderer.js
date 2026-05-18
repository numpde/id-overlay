import {
  createOverlayAdapter,
  overlayStructuralRenderSignature,
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
      const overlayInput = requireOverlayInputViewFact(view);
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
          && activeOverlayAdapter
      ) {
        if (activeOverlayAdapter.update(overlayView, overlayInput)) {
          return;
        }
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

function requireOverlayInputViewFact(view) {
  const overlayInput = view?.overlayInput;
  if (!overlayInput || typeof overlayInput !== "object") {
    throw new TypeError("view.overlayInput is required");
  }
  if (typeof overlayInput.kind !== "string") {
    throw new TypeError("view.overlayInput.kind is required");
  }
  return overlayInput;
}
