import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../application/command.js";

export function createInteractionRuntime({
  dispatchApplicationCommand,
  projectRegistrationPinToggle,
}) {
  return {
    async handleInteractionFact(fact) {
      if (fact.kind !== "registration-pin-toggle-requested") {
        return;
      }
      const projection = projectRegistrationPinToggle(fact);
      if (projection.kind !== "projected") {
        return;
      }
      const { kind, ...pinTogglePayload } = projection;
      await dispatchApplicationCommand(createApplicationCommand(
        APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
        pinTogglePayload,
      ));
    },
  };
}
