import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../application/command.js";

export function createInteractionRuntime({
  dispatchApplicationCommand,
  projectRegistrationPinToggle,
  projectPlacementEdit,
  selectOpacity,
}) {
  return {
    async handleInteractionFact(fact) {
      if (fact.kind === "temporary-native-map-access-started") {
        await dispatchApplicationCommand(createApplicationCommand(
          APPLICATION_COMMAND_KIND.SET_TEMPORARY_INPUT_POSTURE,
          { posture: "native-map" },
        ));
        return;
      }

      if (fact.kind === "temporary-native-map-access-ended") {
        await dispatchApplicationCommand(createApplicationCommand(
          APPLICATION_COMMAND_KIND.SET_TEMPORARY_INPUT_POSTURE,
          { posture: "normal" },
        ));
        return;
      }

      if (
        fact.kind === "registration-pin-toggle-requested"
          && typeof projectRegistrationPinToggle === "function"
      ) {
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

      if (fact.kind === "placement-edit-requested" && typeof projectPlacementEdit === "function") {
        const projection = projectPlacementEdit(fact);
        if (projection.kind !== "committed") {
          return;
        }
        const { kind, ...placementEditPayload } = projection;
        await dispatchApplicationCommand(createApplicationCommand(
          APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
          placementEditPayload,
        ));
        return;
      }

      if (fact.kind !== "opacity-adjustment-requested" || typeof selectOpacity !== "function") {
        return;
      }
      const selection = selectOpacity(fact);
      if (selection.kind !== "selected") {
        return;
      }
      const { kind, ...opacityPayload } = selection;
      await dispatchApplicationCommand(createApplicationCommand(
        APPLICATION_COMMAND_KIND.SET_OPACITY,
        opacityPayload,
      ));
    },
  };
}
