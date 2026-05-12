import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../application/command.js";

export function createInteractionRuntime({
  dispatchApplicationCommand,
  projectRegistrationPinToggle,
  projectPlacementEdit,
}) {
  return {
    async handleInteractionFact(fact) {
      if (fact.kind === "registration-pin-toggle-requested") {
        const projection = projectRegistrationPinToggle(fact);
        if (projection.kind !== "projected") {
          return;
        }
        const { kind, ...pinTogglePayload } = projection;
        await dispatchApplicationCommand(createApplicationCommand(
          APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
          pinTogglePayload,
        ));
        return;
      }

      if (fact.kind !== "placement-edit-requested" || typeof projectPlacementEdit !== "function") {
        return;
      }
      const projection = projectPlacementEdit(fact);
      if (projection.kind !== "committed") {
        return;
      }
      const { kind, ...placementEditPayload } = projection;
      await dispatchApplicationCommand(createApplicationCommand(
        APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
        placementEditPayload,
      ));
    },
  };
}
