import { isVisible } from "./dom.js";
import { findViewportElement } from "./page-dom-queries.js";

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
