import { createSurfaceMotion, isVisible } from "./dom.js";
import {
  SURFACE_MOTION_SELECTOR,
  findViewportElement,
} from "./upstream-dom.js";

export function createViewportElementResolver() {
  // TODO(smell): Viewport geometry depends on current iD/container DOM and CSS
  // transform conventions. Keep this as an adapter seam, not a source of state truth.
  let viewportElement = null;

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

  return {
    resolveViewportElement,
    clearViewportElement,
    refreshViewportElement,
    destroy,
  };
}

export function resolveSurfaceMotionFact(viewportDocument) {
  // TODO(smell): Surface motion is inferred from current iD CSS. Keep it as a
  // page fact with explicit defaulting, not durable overlay state.
  const surfaceElement = viewportDocument.querySelector(SURFACE_MOTION_SELECTOR);
  if (!surfaceElement) {
    return createSurfaceMotion();
  }

  const view = surfaceElement.ownerDocument?.defaultView ?? globalThis;
  const style = typeof view.getComputedStyle === "function"
    ? view.getComputedStyle(surfaceElement)
    : null;

  return createSurfaceMotion({
    transformCss: style?.transform ?? surfaceElement.style.transform ?? "none",
    transformOriginCss: style?.transformOrigin ?? surfaceElement.style.transformOrigin ?? "0px 0px",
  });
}
