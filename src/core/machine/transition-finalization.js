import { commitSemanticHistoryRecord } from "./history.js";
import { applyMachineStatusNotice } from "./panel-status-transition.js";

export function commitMachineTransitionResult(result) {
  return applyMachineStatusNotice(commitSemanticHistoryRecord(result));
}
