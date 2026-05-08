import { createInteractionRuntimeFactPort } from "./runtime-fact-port.js";
import { createInteractionRuntimeObservation } from "./runtime-observation.js";

export function createInteractionRuntimeBridge({
  machineHost,
  machineActions,
}) {
  const runtimeObservation = createInteractionRuntimeObservation({
    machineHost,
  });
  const runtimeFactPort = createInteractionRuntimeFactPort({
    machineActions,
    getPointerScreenPx: runtimeObservation.getPointerScreenPx,
  });

  return {
    destroy: runtimeObservation.destroy,
    getRuntimeState: runtimeObservation.getRuntimeState,
    getPointerScreenPx: runtimeObservation.getPointerScreenPx,
    subscribe: runtimeObservation.subscribe,
    ...runtimeFactPort,
  };
}
