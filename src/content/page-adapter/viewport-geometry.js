import {
  createSurfaceMotion,
  createWindowViewportRect,
  findViewportElement,
  isVisible,
  rectFromDomRect,
  SURFACE_MOTION_SELECTOR,
  translateRectByFrame,
} from "./dom.js";

export function createViewportGeometryResolver({ hashTarget }) {
  // TODO(smell): Viewport geometry depends on current iD/container DOM and CSS
  // transform conventions. Keep this as an adapter seam, not a source of state truth.
  let viewportElement = null;

  function resolveViewportGeometry(context) {
    const resolvedViewportElement = resolveViewportElement(context);
    if (!resolvedViewportElement) {
      const fallbackViewportRect = context.frameElement
        ? rectFromDomRect(context.frameElement.getBoundingClientRect())
        : createWindowViewportRect(hashTarget);
      return {
        viewportElement: null,
        mountElement: context.viewportDocument.body
          ?? context.viewportDocument.documentElement
          ?? null,
        viewportRect: fallbackViewportRect,
        localViewportRect: createWindowViewportRect(context.mapWindow),
      };
    }

    const rawViewportRect = rectFromDomRect(resolvedViewportElement.getBoundingClientRect());
    const viewportRect = context.frameElement
      ? translateRectByFrame(rawViewportRect, context.frameElement)
      : rawViewportRect;

    return {
      viewportElement: resolvedViewportElement,
      mountElement: resolvedViewportElement,
      viewportRect,
      localViewportRect: {
        left: 0,
        top: 0,
        width: rawViewportRect.width,
        height: rawViewportRect.height,
      },
    };
  }

  function resolveSurfaceMotion(context) {
    const surfaceElement = context.viewportDocument.querySelector(SURFACE_MOTION_SELECTOR);
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
