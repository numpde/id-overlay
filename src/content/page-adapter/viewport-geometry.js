import { createViewportElementResolver } from "./viewport-element-resolver.js";
import {
  createElementViewportGeometry,
  createFallbackViewportGeometry,
  resolveSurfaceMotionFact,
} from "./viewport-geometry-facts.js";

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
