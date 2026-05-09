import { createPlacementTransform } from "../transform.js";
import { replaceSession } from "./state.js";
import { createTransitionResult } from "./transition-result.js";

export function reconcilePageContext(state, { persistedSession = null, pageContext = null } = {}) {
  if (!needsPageContextReconciliation(state, persistedSession)) {
    return createTransitionResult({ state });
  }
  const legacyPlacement = normalizeLegacyMapCenteredPlacement(persistedSession?.placement);
  if (!legacyPlacement || !Number.isFinite(pageContext?.mapView?.zoom)) {
    return createTransitionResult({ state });
  }
  return createTransitionResult({
    state: replaceSession(state, {
      placement: createPlacementTransform({
        image: state.session.image,
        centerMapLatLon: legacyPlacement.centerMapLatLon,
        scale: legacyPlacement.scale,
        rotationRad: legacyPlacement.rotationRad,
        zoom: pageContext.mapView.zoom,
      }),
    }),
  });
}

export function needsPageContextReconciliation(state, persistedSession) {
  return Boolean(
    !state.session.placement &&
    state.session.image &&
    normalizeLegacyMapCenteredPlacement(persistedSession?.placement),
  );
}

function normalizeLegacyMapCenteredPlacement(placement) {
  if (!placement || placement.type === "similarity") {
    return null;
  }
  const centerMapLatLon = normalizeLatLon(placement.centerMapLatLon);
  const scale = Number(placement.scale);
  const rotationRad = Number(placement.rotationRad);
  if (!centerMapLatLon || !Number.isFinite(scale) || !Number.isFinite(rotationRad)) {
    return null;
  }
  return {
    centerMapLatLon,
    scale,
    rotationRad,
  };
}

function normalizeLatLon(point) {
  const lat = Number(point?.lat);
  const lon = Number(point?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return { lat, lon };
}
