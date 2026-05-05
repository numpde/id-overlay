import { createInitialMachineState, normalizeMachineState } from "./state.js";
import { createSessionSnapshotKey } from "../session.js";
import { createPlacementTransform } from "../transform.js";

export function toPersistedMachineSession(machineState) {
  const state = normalizeMachineState(machineState);
  return {
    mode: state.session.mode,
    opacity: state.session.opacity,
    image: state.session.image,
    placement: state.session.placement,
    registration: state.session.registration,
  };
}

export function toPersistedMachineSessionSnapshot(machineState) {
  const session = toPersistedMachineSession(machineState);
  return {
    session,
    key: createSessionSnapshotKey(session),
  };
}

export function fromPersistedMachineSession(persisted) {
  if (!persisted || typeof persisted !== "object") {
    return createInitialMachineState();
  }
  return createInitialMachineState({
    session: {
      mode: persisted.mode,
      opacity: persisted.opacity,
      image: persisted.image,
      placement: persisted.placement,
      registration: persisted.registration,
    },
  });
}

export function migratePersistedMachineSessionForMap(persisted, snapshot) {
  // TODO(smell): Persistence still performs a map-aware migration using the
  // current snapshot. Versioned durable-schema migration should be separated
  // from page-context projection so persistence stays storage-shaped.
  if (!persisted?.image) {
    return persisted ?? {};
  }

  const placement = persisted.placement;
  if (placement?.type === "similarity") {
    return persisted;
  }

  if (
    placement?.centerMapLatLon &&
    Number.isFinite(placement?.scale) &&
    Number.isFinite(placement?.rotationRad) &&
    Number.isFinite(snapshot?.mapView?.zoom)
  ) {
    return {
      ...persisted,
      placement: createPlacementTransform({
        image: persisted.image,
        centerMapLatLon: placement.centerMapLatLon,
        scale: placement.scale,
        rotationRad: placement.rotationRad,
        zoom: snapshot.mapView.zoom,
      }),
    };
  }

  return persisted;
}
