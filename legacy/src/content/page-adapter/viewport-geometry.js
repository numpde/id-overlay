import {
  createElementViewportGeometry,
  createFallbackViewportGeometry,
} from "./viewport-geometry-facts.js";
import {
  createViewportElementResolver,
  resolveSurfaceMotionFact,
} from "./upstream-viewport.js";

export function createViewportGeometryResolver({
  hashTarget,
  viewportElementResolver = createViewportElementResolver(),
}) {
  function resolveViewportGeometry(context) {
    const resolvedViewportElement = viewportElementResolver.resolveViewportElement(context);
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
    viewportElementResolver.clearViewportElement();
  }

  function refreshViewportElement() {
    viewportElementResolver.refreshViewportElement();
  }

  function destroy() {
    viewportElementResolver.destroy();
  }

  return {
    resolveViewportGeometry,
    resolveSurfaceMotion,
    clearViewportElement,
    refreshViewportElement,
    destroy,
  };
}
