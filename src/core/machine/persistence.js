import { createInitialMachineState, normalizeMachineState } from "./state.js";

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
