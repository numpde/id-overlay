import {
  findViewportElement,
  isOverlayOwnedElement,
} from "./page-dom-queries.js";

export function resolveMapZoomTarget(context, clientPoint) {
  // TODO(smell): Zoom targeting falls through three DOM heuristics. Keep this
  // target policy quarantined here before changing gesture behavior.
  const target = resolveUnderlyingMapTargetAtClientPoint(context.viewportDocument, clientPoint);
  return target ?? findViewportElement(context.viewportDocument) ?? context.viewportDocument.body;
}

export function resolveMapPanTarget(context) {
  // TODO(smell): Pan targeting assumes the viewport element is the safest drag
  // sink. Keep this separate from pan lifecycle so target policy can be tested
  // against upstream iD DOM changes.
  return findViewportElement(context.viewportDocument)
    ?? context.viewportDocument.body
    ?? context.viewportDocument.documentElement
    ?? null;
}

function resolveUnderlyingMapTargetAtClientPoint(viewportDocument, clientPoint) {
  // TODO(smell): Underlay hit-testing depends on browser stacking order and the
  // extension-owned marker convention. This should be the only place that knows
  // how to skip overlay-owned elements.
  const elementsAtPoint = viewportDocument.elementsFromPoint?.(clientPoint.x, clientPoint.y);
  if (Array.isArray(elementsAtPoint) && elementsAtPoint.length) {
    const nonOverlayTarget = elementsAtPoint.find((element) => !isOverlayOwnedElement(element));
    if (nonOverlayTarget) {
      return nonOverlayTarget;
    }
  }

  const target = viewportDocument.elementFromPoint?.(clientPoint.x, clientPoint.y);
  if (target && !isOverlayOwnedElement(target)) {
    return target;
  }

  return null;
}
