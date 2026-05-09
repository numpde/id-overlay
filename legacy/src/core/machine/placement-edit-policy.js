import {
  MACHINE_PLACEMENT_EDIT_KIND,
} from "./events.js";
import { selectPanelPolicy } from "./policy.js";

export function canEditPlacement(state) {
  return selectPanelPolicy(state).canEditOverlay;
}

export function normalizePlacementEditKind(kind) {
  return Object.values(MACHINE_PLACEMENT_EDIT_KIND).includes(kind) ? kind : null;
}
