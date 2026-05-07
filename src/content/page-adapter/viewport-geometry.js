import {
  findViewportElement,
  isVisible,
} from "./dom.js";
import {
  createElementViewportGeometry,
  createFallbackViewportGeometry,
  resolveSurfaceMotionFact,
} from "./viewport-geometry-facts.js";

export function createViewportGeometryResolver({ hashTarget }) {
  // TODO(smell): Viewport geometry depends on current iD/container DOM and CSS
  // transform conventions. Keep this as an adapter seam, not a source of state truth.
  let viewportElement = null;

  function resolveViewportGeometry(context) {
    const resolvedViewportElement = resolveViewportElement(context);
    if (!resolvedViewportElement) {
      return createFallbackViewportGeometry({ context, hashTarget });
    }

    return createElementViewportGeometry({
      viewportElement: resolvedViewportElement,
      frameElement: context.frameElement,
    });
  }

  function resolveSurfaceMotion(context) {
    return resolveSurfaceMotionFact(context.viewportDocument);
  }

  function clearViewportElement() {
    viewportElement = null;
  }

  function refreshViewportElement() {
    if (viewportElement && (!viewportElement.isConnected || !isVisible(viewportElement))) {
      viewportElement = null;
    }
  }

  function destroy() {
    viewportElement = null;
  }

  function resolveViewportElement(context) {
    if (
      viewportElement?.isConnected &&
      viewportElement.ownerDocument === context.viewportDocument
    ) {
      return viewportElement;
    }

    viewportElement = findViewportElement(context.viewportDocument);
    return viewportElement;
  }

  return {
    resolveViewportGeometry,
    resolveSurfaceMotion,
    clearViewportElement,
    refreshViewportElement,
    destroy,
  };
}
