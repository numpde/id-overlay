import {
  applyAnchoredPlacementEdit,
  applyPlacementToPoint,
  invertPlacement,
} from "../../domain/placement.js";
import {
  normalizeOpacity,
} from "../../domain/opacity.js";

export function createOverlayInteractionProjectionPort({
  readState,
  readLastPointerScreenPx,
  readPageSnapshot = () => null,
}) {
  return {
    projectPlacementEdit(fact) {
      const state = readState();
      const placement = state?.session?.placement ?? defaultPlacement();
      if (state?.session?.mode !== "align") {
        return {
          kind: "not-committed",
          reason: "not-align",
        };
      }
      const projection = placementProjectionForEdit({
        placement,
        pageSnapshot: readPageSnapshot(),
      });
      if (projection.kind !== "projected") {
        return projection;
      }
      if (fact.editKind === "move" && fact.screenDeltaPx) {
        const nextScreenPlacement = applyAnchoredPlacementEdit({
          base: projection.screenPlacement,
          edit: {
            kind: "move",
            deltaPx: fact.screenDeltaPx,
          },
        });
        return {
          kind: "committed",
          editKind: "move",
          placement: projection.toDurablePlacement(nextScreenPlacement),
        };
      }
      const anchorScreenPx = fact.anchorScreenPx ?? readLastPointerScreenPx();
      if (!anchorScreenPx) {
        return {
          kind: "not-committed",
          reason: "missing-anchor",
        };
      }
      const anchorImagePx = screenPxToImagePx(anchorScreenPx, projection.screenPlacement);
      if (fact.editKind === "rotate") {
        const nextScreenPlacement = applyAnchoredPlacementEdit({
          base: projection.screenPlacement,
          edit: {
            kind: "rotate",
            anchorImagePx,
            deltaRad: -(fact.inputDelta?.y ?? 0) / 800,
          },
        });
        return {
          kind: "committed",
          editKind: "rotate",
          placement: projection.toDurablePlacement(nextScreenPlacement),
        };
      }
      if (fact.editKind === "scale") {
        const nextScreenPlacement = applyAnchoredPlacementEdit({
          base: projection.screenPlacement,
          edit: {
            kind: "scale",
            anchorImagePx,
            factor: Math.exp(-(fact.inputDelta?.y ?? 0) / 400),
          },
        });
        return {
          kind: "committed",
          editKind: "scale",
          placement: projection.toDurablePlacement(nextScreenPlacement),
        };
      }
      return {
        kind: "not-committed",
        reason: "unknown-edit",
      };
    },
    projectRegistrationPinToggle(fact) {
      const state = readState();
      if (state?.session?.mode !== "align") {
        return {
          kind: "not-projectable",
          reason: "not-align",
        };
      }
      const screenPx = fact.screenPx ?? readLastPointerScreenPx();
      if (!screenPx) {
        return {
          kind: "not-projectable",
          reason: "missing-pointer",
        };
      }
      const pageSnapshot = readPageSnapshot();
      if (!hasProjectableMapView(pageSnapshot)) {
        return {
          kind: "not-projectable",
          reason: "missing-projectable-map-view",
        };
      }
      const placement = state.session.placement ?? defaultPlacement();
      const projection = placementProjectionForEdit({
        placement,
        pageSnapshot,
      });
      if (projection.kind !== "projected") {
        return {
          kind: "not-projectable",
          reason: projection.reason,
        };
      }
      const imagePx = screenPxToImagePx(screenPx, projection.screenPlacement);
      return {
        kind: "projected",
        existingPinId: nearestPinId({
          imagePx,
          pins: state.session.registration?.pins ?? [],
        }),
        imagePx,
        mapLatLon: screenPxToMapLatLon({
          screenPx,
          pageSnapshot,
        }),
      };
    },
    selectOpacity(fact) {
      const state = readState();
      if (!state?.session) {
        return {
          kind: "not-selected",
        };
      }
      return {
        kind: "selected",
        opacity: normalizeOpacity((state.session.opacity ?? 1) - (fact.inputDelta?.y ?? 0) / 1000),
      };
    },
  };
}

function defaultPlacement() {
  return {
    x: 0,
    y: 0,
    scale: 1,
    rotationRad: 0,
  };
}

function placementProjectionForEdit({ placement, pageSnapshot }) {
  if (placement.coordinateSpace !== "map-world") {
    return {
      kind: "projected",
      screenPlacement: placement,
      toDurablePlacement: (nextScreenPlacement) => nextScreenPlacement,
    };
  }
  if (!hasProjectableMapView(pageSnapshot)) {
    return {
      kind: "not-committed",
      reason: "missing-projectable-map-view",
    };
  }
  return {
    kind: "projected",
    screenPlacement: deriveScreenPlacementFromMapLockedPlacement({
      placement,
      pageSnapshot,
    }),
    toDurablePlacement: (nextScreenPlacement) => (
      deriveMapLockedPlacementFromScreenPlacement({
        placement: nextScreenPlacement,
        pageSnapshot,
      })
    ),
  };
}

function screenPxToImagePx(screenPx, placement) {
  return applyPlacementToPoint(screenPx, invertPlacement(placement));
}

function hasProjectableMapView(pageSnapshot) {
  return pageSnapshot?.kind === "supported-map-page"
    && Number.isFinite(pageSnapshot.mapView?.zoom)
    && Number.isFinite(pageSnapshot.mapView?.centerLatLon?.lat)
    && Number.isFinite(pageSnapshot.mapView?.centerLatLon?.lon)
    && Number.isFinite(pageSnapshot.viewportPx?.width)
    && Number.isFinite(pageSnapshot.viewportPx?.height);
}

function deriveScreenPlacementFromMapLockedPlacement({ placement, pageSnapshot }) {
  const centerWorld = projectLatLonToWorld(pageSnapshot.mapView.centerLatLon);
  const zoomScale = 2 ** pageSnapshot.mapView.zoom;
  const viewportCenter = viewportCenterScreenPx(pageSnapshot);
  return {
    x: viewportCenter.x + (placement.x - centerWorld.x) * zoomScale,
    y: viewportCenter.y + (placement.y - centerWorld.y) * zoomScale,
    scale: placement.scale * zoomScale,
    rotationRad: placement.rotationRad,
  };
}

function deriveMapLockedPlacementFromScreenPlacement({ placement, pageSnapshot }) {
  const centerWorld = projectLatLonToWorld(pageSnapshot.mapView.centerLatLon);
  const zoomScale = 2 ** pageSnapshot.mapView.zoom;
  const viewportCenter = viewportCenterScreenPx(pageSnapshot);
  return {
    x: centerWorld.x + (placement.x - viewportCenter.x) / zoomScale,
    y: centerWorld.y + (placement.y - viewportCenter.y) / zoomScale,
    scale: placement.scale / zoomScale,
    rotationRad: placement.rotationRad,
    coordinateSpace: "map-world",
  };
}

function viewportCenterScreenPx(pageSnapshot) {
  return {
    x: (pageSnapshot.viewportScreenPx?.x ?? 0) + pageSnapshot.viewportPx.width / 2,
    y: (pageSnapshot.viewportScreenPx?.y ?? 0) + pageSnapshot.viewportPx.height / 2,
  };
}

function projectLatLonToWorld({ lat, lon }) {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const clampedSin = Math.min(0.9999, Math.max(-0.9999, sinLat));
  return {
    x: 256 * ((lon + 180) / 360),
    y: 256 * (0.5 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (4 * Math.PI)),
  };
}

function nearestPinId({ imagePx, pins }) {
  const match = pins.find((pin) => (
    Math.hypot(pin.imagePx.x - imagePx.x, pin.imagePx.y - imagePx.y) <= 8
  ));
  return match?.id ?? null;
}

function screenPxToMapLatLon({ screenPx, pageSnapshot }) {
  const centerWorld = projectLatLonToWorld(pageSnapshot.mapView.centerLatLon);
  const zoomScale = 2 ** pageSnapshot.mapView.zoom;
  const viewportCenter = viewportCenterScreenPx(pageSnapshot);
  return latLonFromWorld({
    x: centerWorld.x + (screenPx.x - viewportCenter.x) / zoomScale,
    y: centerWorld.y + (screenPx.y - viewportCenter.y) / zoomScale,
  });
}

function latLonFromWorld({ x, y }) {
  const lon = x / 256 * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y / 256;
  const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return {
    lat,
    lon,
  };
}
