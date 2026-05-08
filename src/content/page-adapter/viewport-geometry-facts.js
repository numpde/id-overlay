import {
  createWindowViewportRect,
  rectFromDomRect,
  translateRectByFrame,
} from "./dom.js";
import {
  PAGE_VIEWPORT_PROVENANCE_KIND,
  createPageViewportProvenance,
} from "./page-snapshot.js";

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
    viewportProvenance: createPageViewportProvenance(PAGE_VIEWPORT_PROVENANCE_KIND.ELEMENT),
  };
}

export function createFallbackViewportGeometry({ context, hashTarget }) {
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
    viewportProvenance: createPageViewportProvenance(PAGE_VIEWPORT_PROVENANCE_KIND.FALLBACK),
  };
}
