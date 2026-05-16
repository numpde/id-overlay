import {
  persistDurableStateEffect,
} from "./effects.js";
import {
  pushHistory,
} from "./history.js";
import {
  placementEquals,
} from "./placement.js";
import {
  applyPlacementRevision,
  placementRevisionFromSession,
} from "./placement-history.js";
import {
  selectDurableApplicationState,
} from "./view-model.js";

export function commitPlacementEdit(state, command, { inertResult }) {
  if (
    !state.session
      || state.session.mode !== "align"
      || placementEquals(state.session.placement, command.placement)
  ) {
    return inertResult(state);
  }

  const before = placementRevisionFromSession(state.session);
  const after = {
    placement: command.placement,
    solvedRegistration: null,
  };
  const nextState = {
    session: applyPlacementRevision(state.session, after),
    history: pushHistory(state.history, {
      kind: "overlay-placement-edit",
      editKind: command.editKind,
      before,
      after,
    }),
    notice: {
      kind: "placement-changed",
      editKind: command.editKind,
    },
  };
  return {
    state: nextState,
    effects: [
      persistDurableStateEffect(selectDurableApplicationState(nextState)),
    ],
  };
}
