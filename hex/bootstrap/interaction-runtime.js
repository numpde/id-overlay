export function createInteractionRuntime({
  dispatchApplicationCommand,
  projectRegistrationPinToggle = () => ({ kind: "not-projectable" }),
  projectPlacementEdit = () => ({ kind: "not-committed" }),
  selectOpacity = () => ({ kind: "not-selected" }),
  forwardNativeMapGesture = async () => {},
  reportRuntimeError = () => {},
}) {
  return {
    async handleInteractionFact(fact) {
      try {
        if (fact.kind === "registration-pin-toggle-requested") {
          const projection = projectRegistrationPinToggle(fact);
          if (projection.kind !== "projected") {
            return;
          }
          await dispatchApplicationCommand({
            kind: "toggle-registration-pin",
            existingPinId: projection.existingPinId,
            imagePx: projection.imagePx,
            mapLatLon: projection.mapLatLon,
          });
          return;
        }

        if (fact.kind === "temporary-native-map-access-started") {
          await dispatchApplicationCommand({
            kind: "set-temporary-input-posture",
            posture: "native-map",
          });
          return;
        }

        if (fact.kind === "temporary-native-map-access-ended" || fact.kind === "interaction-reset-requested") {
          await dispatchApplicationCommand({
            kind: "set-temporary-input-posture",
            posture: "normal",
          });
          return;
        }

        if (fact.kind === "trace-mode-requested") {
          await dispatchApplicationCommand({
            kind: "select-mode",
            mode: "trace",
          });
          return;
        }

        if (fact.kind === "placement-edit-requested") {
          const projection = projectPlacementEdit(fact);
          if (projection.kind !== "committed") {
            return;
          }
          await dispatchApplicationCommand({
            kind: "commit-placement-edit",
            editKind: projection.editKind,
            placement: projection.placement,
          });
          return;
        }

        if (fact.kind === "opacity-adjustment-requested") {
          const selection = selectOpacity(fact);
          if (selection.kind !== "selected") {
            return;
          }
          await dispatchApplicationCommand({
            kind: "set-opacity",
            opacity: selection.opacity,
          });
          return;
        }

        if (fact.kind === "native-map-gesture-requested") {
          await forwardNativeMapGesture(fact);
        }
      } catch (error) {
        reportRuntimeError(error);
      }
    },
  };
}
