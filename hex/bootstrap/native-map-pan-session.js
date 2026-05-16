import {
  APPLICATION_COMMAND_KIND,
} from "../application/command.js";

export function createNativeMapPanSession({ host }) {
  let activePan = null;
  return {
    async forwardGesture(fact) {
      if (fact.gestureKind === "zoom" && activePan) {
        return;
      }
      if (fact.gestureKind === "pan") {
        if (fact.phase === "start" || fact.phase === "move") {
          activePan = {
            screenPx: fact.screenPx,
          };
        }
        if (fact.phase === "end") {
          activePan = null;
        }
      }
      await host.forwardNativeMapGesture?.(fact);
    },
    async endForCommand(command) {
      if (!activePan || !doesCommandInterruptNativeMapPan(command)) {
        return;
      }
      const screenPx = activePan.screenPx;
      activePan = null;
      await host.forwardNativeMapGesture?.({
        kind: "native-map-gesture-requested",
        gestureKind: "pan",
        phase: "end",
        screenPx,
      });
    },
  };
}

function doesCommandInterruptNativeMapPan(command) {
  return command.kind === APPLICATION_COMMAND_KIND.SELECT_MODE
    || command.kind === APPLICATION_COMMAND_KIND.CLEAR_REFERENCE_IMAGE
    || command.kind === APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION;
}
