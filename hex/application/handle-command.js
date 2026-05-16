import {
  APPLICATION_COMMAND_KIND,
} from "./command.js";
import {
  persistDurableStateEffect,
} from "./effects.js";
import {
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
} from "./history.js";
import {
  commitPlacementEdit,
} from "./placement-commands.js";
import {
  assertSupportedDurableState,
  assertValidCommand,
  assertValidState,
} from "./validation.js";
import {
  activatePrimaryAction,
} from "./primary-action-command.js";
import {
  selectMode,
  setOpacity,
  setTemporaryInputPosture,
} from "./session-commands.js";
import {
  clearPanelIntent,
  clearStatusNotice,
} from "./scheduled-clear-commands.js";

export function handleApplicationCommand({ state, command }) {
  assertValidState(state);
  assertValidCommand(command);

  switch (command.kind) {
    case APPLICATION_COMMAND_KIND.HYDRATE:
      return hydrate(command.durableState);
    case APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION:
      return activatePrimaryAction(state, { inertResult });
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
      return selectMode(state, command, { inertResult });
    case APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN:
      return toggleRegistrationPin(state, command, { inertResult });
    case APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT:
      return commitPlacementEdit(state, command, { inertResult });
    case APPLICATION_COMMAND_KIND.CLEAR_REGISTRATION_PINS:
      return clearRegistrationPins(state, { inertResult });
    case APPLICATION_COMMAND_KIND.CLEAR_STATUS_NOTICE:
      return clearStatusNotice(state, command.requestId, { inertResult });
    case APPLICATION_COMMAND_KIND.CLEAR_PANEL_INTENT:
      return clearPanelIntent(state, command, { inertResult });
    case APPLICATION_COMMAND_KIND.UNDO:
      return replayHistory(state, "undo");
    case APPLICATION_COMMAND_KIND.REDO:
      return replayHistory(state, "redo");
    case APPLICATION_COMMAND_KIND.SET_OPACITY:
      return setOpacity(state, command, { inertResult });
    case APPLICATION_COMMAND_KIND.SET_TEMPORARY_INPUT_POSTURE:
      return setTemporaryInputPosture(state, command, { inertResult });
    default:
      throw new Error("Unreachable application command dispatch.");
  }
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
