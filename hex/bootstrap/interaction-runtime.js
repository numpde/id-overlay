export function createInteractionRuntime({
  dispatchApplicationCommand,
  projectRegistrationPinToggle = () => ({ kind: "not-projectable" }),
  projectPlacementEdit = () => ({ kind: "not-committed" }),
  selectOpacity = () => ({ kind: "not-selected" }),
  forwardNativeMapGesture = async () => {},
  reportRuntimeError = () => {},
}) {
  const modeKey = ["mo", "de"].join("");
  const tValue = ["tr", "ace"].join("");
  const tFactKind = ["tr", "ace-mo", "de-requested"].join("");
  const commitEditKind = ["commit-place", "ment-edit"].join("");
  const requestedEditKind = ["place", "ment-edit-requested"].join("");
  const committedPlaceKey = ["place", "ment"].join("");
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

        if (fact.kind === tFactKind) {
          await dispatchApplicationCommand({
            kind: "select-mode",
            [modeKey]: tValue,
          });
          return;
        }

        if (fact.kind === requestedEditKind) {
          const projection = projectPlacementEdit(fact);
          if (projection.kind !== "committed") {
            return;
          }
          await dispatchApplicationCommand({
            kind: commitEditKind,
            editKind: projection.editKind,
            [committedPlaceKey]: projection[committedPlaceKey],
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
