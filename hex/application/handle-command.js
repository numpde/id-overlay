import {
  APPLICATION_COMMAND_KIND,
} from "./command.js";
import {
  cancelReferenceImageInputEffect,
  loadReferenceImageInputIntent,
  persistDurableStateEffect,
  requestReferenceImageInputEffect,
  scheduleClearPanelIntentEffect,
  scheduleClearStatusNoticeEffect,
} from "./effects.js";
import {
  clearReferenceImageWithHistory,
  isReplacementReferenceImageInput,
  reportReferenceImageInputOutcome,
  requestReferenceImageReplacement,
} from "./reference-image-commands.js";
import {
  clearRegistrationPins,
  toggleRegistrationPin,
} from "./registration-commands.js";
import { createInitialApplicationState } from "./state.js";
import {
  replayHistory,
  withoutRedoHistory,
} from "./history.js";
import { selectDurableApplicationState } from "./view-model.js";
import {
  commitPlacementEdit,
} from "./placement-commands.js";
import {
  assertSupportedDurableState,
  assertValidCommand,
  assertValidState,
} from "./validation.js";

export function handleApplicationCommand({ state, command }) {
  assertValidState(state);
  assertValidCommand(command);

  switch (command.kind) {
    case APPLICATION_COMMAND_KIND.HYDRATE:
      return hydrate(command.durableState);
    case APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION:
      return activatePrimaryAction(state);
    case APPLICATION_COMMAND_KIND.REQUEST_REFERENCE_IMAGE_REPLACEMENT:
      return requestReferenceImageReplacement(state, { inertResult });
    case APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME:
      return reportReferenceImageInputOutcome(state, command, { inertResult });
    case APPLICATION_COMMAND_KIND.CLEAR_REFERENCE_IMAGE:
      return {
        state: {
          ...createInitialApplicationState(),
          notice: {
            kind: "reference-image-cleared",
          },
        },
        effects: [persistDurableStateEffect(null)],
      };
    case APPLICATION_COMMAND_KIND.SELECT_MODE:
      return selectMode(state, command);
    case APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN:
      return toggleRegistrationPin(state, command, { inertResult });
    case APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT:
      return commitPlacementEdit(state, command, { inertResult });
    case APPLICATION_COMMAND_KIND.CLEAR_REGISTRATION_PINS:
      return clearRegistrationPins(state, { inertResult });
    case APPLICATION_COMMAND_KIND.CLEAR_STATUS_NOTICE:
      return clearStatusNotice(state, command.requestId);
    case APPLICATION_COMMAND_KIND.CLEAR_PANEL_INTENT:
      return clearPanelIntent(state, command);
    case APPLICATION_COMMAND_KIND.UNDO:
      return replayHistory(state, "undo");
    case APPLICATION_COMMAND_KIND.REDO:
      return replayHistory(state, "redo");
    case APPLICATION_COMMAND_KIND.SET_OPACITY:
      return setOpacity(state, command);
    case APPLICATION_COMMAND_KIND.SET_TEMPORARY_INPUT_POSTURE:
      return setTemporaryInputPosture(state, command);
    default:
      throw new Error("Unreachable application command dispatch.");
  }
}

function setTemporaryInputPosture(state, command) {
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

function setOpacity(state, command) {
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

function stateFromDurableState(durableState) {
  if (durableState === null) {
    return createInitialApplicationState();
  }
  return {
    session: durableState.session,
  };
}

function hydrate(durableState) {
  if (durableState === null || isEmptyObject(durableState)) {
    return {
      state: createInitialApplicationState(),
      effects: [],
    };
  }
  assertSupportedDurableState(durableState);
  return {
    state: stateFromDurableState(durableState),
    effects: [],
  };
}

function activatePrimaryAction(state) {
  if (state.referenceImageInput?.status === "awaiting-input") {
    const requestId = state.referenceImageInput.requestId;
    if (isReplacementReferenceImageInput(state)) {
      return {
        state: {
          session: state.session,
          ...historyState(state),
          notice: {
            kind: "reference-image-replacement-cancelled",
            requestId,
          },
        },
        effects: [
          cancelReferenceImageInputEffect(requestId),
          scheduleClearStatusNoticeEffect(requestId),
        ],
      };
    }
    return {
      state: {
        notice: {
          kind: "reference-image-input-cancelled",
          requestId,
        },
      },
      effects: [
        cancelReferenceImageInputEffect(requestId),
        scheduleClearStatusNoticeEffect(requestId),
      ],
    };
  }
  if (!state.session) {
    const requestId = 1;
    const intent = loadReferenceImageInputIntent();
    return {
      state: {
        referenceImageInput: {
          status: "awaiting-input",
          requestId,
          intent,
        },
      },
      effects: [requestReferenceImageInputEffect({ requestId, intent })],
    };
  }
  if (state.panelIntent?.kind === "confirm-clear-pins") {
    return clearRegistrationPins(state, { inertResult });
  }
  if (state.panelIntent?.kind === "confirm-clear-reference-image") {
    return clearReferenceImageWithHistory(state);
  }
  if (
    state.session.mode === "align"
      && (state.session.registration?.pins ?? []).length > 0
  ) {
    const requestId = 1;
    return {
      state: {
        session: state.session,
        panelIntent: {
          kind: "confirm-clear-pins",
          requestId,
        },
      },
      effects: [
        scheduleClearPanelIntentEffect({
          requestId,
          intentKind: "confirm-clear-pins",
        }),
      ],
    };
  }

  const requestId = 1;
  return {
    state: {
      session: state.session,
      panelIntent: {
        kind: "confirm-clear-reference-image",
        requestId,
      },
    },
    effects: [
      scheduleClearPanelIntentEffect({
        requestId,
        intentKind: "confirm-clear-reference-image",
      }),
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

function selectMode(state, command) {
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

function clearStatusNotice(state, requestId) {
  if (state.notice?.requestId !== requestId) {
    return inertResult(state);
  }

  const nextState = {};
  for (const [key, value] of Object.entries(state)) {
    if (key !== "notice") {
      nextState[key] = value;
    }
  }
  return {
    state: nextState,
    effects: [],
  };
}

function clearPanelIntent(state, command) {
  if (
    state.panelIntent?.requestId !== command.requestId
      || state.panelIntent?.kind !== command.intentKind
  ) {
    return inertResult(state);
  }

  const nextState = {};
  for (const [key, value] of Object.entries(state)) {
    if (key !== "panelIntent") {
      nextState[key] = value;
    }
  }
  return {
    state: nextState,
    effects: [],
  };
}

function inertResult(state) {
  return {
    state,
    effects: [],
  };
}

function isEmptyObject(value) {
  return value
    && typeof value === "object"
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === 0;
}
