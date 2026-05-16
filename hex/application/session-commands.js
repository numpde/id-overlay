import {
  persistDurableStateEffect,
} from "./effects.js";
import {
  withoutRedoHistory,
} from "./history.js";
import {
  selectDurableApplicationState,
} from "./view-model.js";

export function setTemporaryInputPosture(state, command, { inertResult }) {
  if (command.posture === "native-map") {
    if (state.inputOverride?.kind === "temporary-native-map-access") {
      return inertResult(state);
    }
    return {
      state: {
        ...state,
        inputOverride: {
          kind: "temporary-native-map-access",
        },
      },
      effects: [],
    };
  }

  if (state.inputOverride?.kind !== "temporary-native-map-access") {
    return inertResult(state);
  }
  const nextState = {};
  for (const [key, value] of Object.entries(state)) {
    if (key !== "inputOverride") {
      nextState[key] = value;
    }
  }
  return {
    state: nextState,
    effects: [],
  };
}

export function setOpacity(state, command, { inertResult }) {
  if (!state.session || (state.session.opacity ?? 1) === command.opacity) {
    return inertResult(state);
  }

  const nextState = {
    session: {
      ...state.session,
      opacity: command.opacity,
    },
    ...withoutRedoHistory(state.history),
  };
  return {
    state: nextState,
    effects: [
      persistDurableStateEffect(selectDurableApplicationState(nextState)),
    ],
  };
}

export function selectMode(state, command, { inertResult }) {
  const { mode } = command;
  if (!state.session || state.session.mode === mode) {
    return inertResult(state);
  }

  const nextState = {
    session: {
      ...state.session,
      mode,
    },
    ...historyState(state),
    notice: {
      kind: "mode-selected",
      mode,
    },
  };
  return {
    state: nextState,
    effects: [
      persistDurableStateEffect(selectDurableApplicationState(nextState)),
    ],
  };
}

function historyState(state) {
  if (!state.history) {
    return {};
  }
  return {
    history: state.history,
  };
}
