import {
  createSurfaceMotion,
  createWindowViewportRect,
  rectFromDomRect,
  translateRectByFrame,
} from "./dom.js";
import { SURFACE_MOTION_SELECTOR } from "./page-dom-queries.js";

export function createElementViewportGeometry({ viewportElement, frameElement = null }) {
  const rawViewportRect = rectFromDomRect(viewportElement.getBoundingClientRect());
  const viewportRect = frameElement
    ? translateRectByFrame(rawViewportRect, frameElement)
    : rawViewportRect;

  return {
    viewportElement,
    mountElement: viewportElement,
    viewportRect,
    localViewportRect: {
      left: 0,
      top: 0,
      width: rawViewportRect.width,
      height: rawViewportRect.height,
    },
  };
}

export function createFallbackViewportGeometry({ context, hashTarget }) {
  // TODO(smell): Fallback geometry preserves availability over precision. The
  // ideal snapshot model should carry this as provenance instead of returning a
  // viewport-shaped object that looks fully authoritative.
  const viewportRect = context.frameElement
    ? rectFromDomRect(context.frameElement.getBoundingClientRect())
    : createWindowViewportRect(hashTarget);

  return {
    viewportElement: null,
    mountElement: context.viewportDocument.body
      ?? context.viewportDocument.documentElement
      ?? null,
    viewportRect,
    localViewportRect: createWindowViewportRect(context.mapWindow),
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
