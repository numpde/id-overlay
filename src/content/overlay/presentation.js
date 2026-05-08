import { buildOverlayViewModel } from "./view-model.js";

export function buildOverlayPresentation({
  machineState,
  runtime,
  snapshot,
  projectMapPinScreenPoint,
}) {
  return Object.freeze({
    machineState,
    runtime,
    snapshot,
    viewModel: buildOverlayViewModel({
      machineState,
      runtime,
      snapshot,
      projectMapPinScreenPoint,
    }),
  });
}
