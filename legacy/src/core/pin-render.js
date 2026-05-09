import { imagePointToScreenPoint } from "./transform.js";

export function buildPinRenderModels({
  pins,
  transform = null,
  projectOverlayScreenPoint = (imagePoint) => imagePointToScreenPoint({ imagePoint, transform }),
  projectMapScreenPoint = null,
}) {
  return pins.map((pin) => ({
    id: pin.id,
    imagePx: pin.imagePx,
    mapLatLon: pin.mapLatLon,
    overlayScreenPx: projectOverlayScreenPoint(pin.imagePx, pin),
    mapScreenPx: projectMapScreenPoint?.(pin.mapLatLon, pin) ?? null,
  }));
}

export function hitTestPin({
  screenPoint,
  renderedPins,
  radiusPx = 12,
  resolveTargetScreenPoint = (pin) => pin.overlayScreenPx,
}) {
  const radiusSquared = radiusPx * radiusPx;
  let bestMatch = null;

  for (const pin of renderedPins) {
    const targetScreenPoint = resolveTargetScreenPoint(pin);
    if (!targetScreenPoint) {
      continue;
    }
    const dx = targetScreenPoint.x - screenPoint.x;
    const dy = targetScreenPoint.y - screenPoint.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > radiusSquared) {
      continue;
    }
    if (!bestMatch || distanceSquared < bestMatch.distanceSquared) {
      bestMatch = {
        pin,
        distanceSquared,
      };
    }
  }

  return bestMatch?.pin ?? null;
}
