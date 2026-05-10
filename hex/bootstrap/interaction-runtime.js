import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../application/command.js";

export function createInteractionRuntime({
  dispatchCommand,
  projectCurrentPointerForPinToggle,
}) {
  return {
    async handleInteractionFact(fact) {
      if (fact.kind !== "keyboard-pin-toggle-requested") {
        return;
      }
      const projection = projectCurrentPointerForPinToggle();
      if (projection.kind !== "projected") {
        return;
      }
      const { kind, ...pinTogglePayload } = projection;
      await dispatchCommand(createApplicationCommand(
        APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
        pinTogglePayload,
      ));
    },
  };
}
