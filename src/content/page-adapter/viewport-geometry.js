import { isVisible } from "./dom.js";
import { findViewportElement } from "./page-dom-queries.js";
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
    // TODO(smell): Missing viewport falls back to window/frame geometry. The
    // final page snapshot should expose fallback provenance so callers can avoid
    // treating approximate geometry as authoritative.
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
    // TODO(smell): Cache invalidation is driven by DOM visibility/connectivity,
    // not a page-owned viewport identity. Keep invalidation here until upstream
    // map viewport identity can be observed explicitly.
    if (viewportElement && (!viewportElement.isConnected || !isVisible(viewportElement))) {
      viewportElement = null;
    }
  }

  function destroy() {
    viewportElement = null;
  }

  function resolveViewportElement(context) {
    // TODO(smell): This cache assumes a connected same-document viewport remains
    // valid through style churn. It is intentional but should not spread outside
    // this resolver.
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
