import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "./command.js";
import {
  ApplicationBoundaryError,
  APPLICATION_BOUNDARY_ERROR_CODE,
} from "./errors.js";
import { isPlacementData, placementEquals } from "./placement.js";
import { isPlainData } from "./plain-data.js";
import { isReferenceImageData } from "./reference-image.js";
import { createInitialApplicationState } from "./state.js";
import { selectDurableApplicationState } from "./view-model.js";

export function handleApplicationCommand({ state, command }) {
  assertValidState(state);
  assertValidCommand(command);

  switch (command.kind) {
    case APPLICATION_COMMAND_KIND.HYDRATE:
      return hydrate(command.durableState);
    case APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION:
      return activatePrimaryAction(state);
    case APPLICATION_COMMAND_KIND.REQUEST_REFERENCE_IMAGE_REPLACEMENT:
      return requestReferenceImageReplacement(state);
    case APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME:
      return reportReferenceImageInputOutcome(state, command);
    case APPLICATION_COMMAND_KIND.CLEAR_REFERENCE_IMAGE:
      return {
        state: createInitialApplicationState(),
        effects: [persistDurableStateEffect(null)],
      };
    case APPLICATION_COMMAND_KIND.SELECT_MODE:
      return selectMode(state, command);
    case APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN:
      return toggleRegistrationPin(state, command);
    case APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT:
      return commitPlacementEdit(state, command);
    case APPLICATION_COMMAND_KIND.CLEAR_REGISTRATION_PINS:
      return clearRegistrationPins(state);
    case APPLICATION_COMMAND_KIND.CLEAR_STATUS_NOTICE:
      return clearStatusNotice(state, command.requestId);
    case APPLICATION_COMMAND_KIND.UNDO:
      return undoHistory(state);
    case APPLICATION_COMMAND_KIND.REDO:
      return redoHistory(state);
    case APPLICATION_COMMAND_KIND.SET_OPACITY:
      return setOpacity(state, command);
    default:
      throwBoundary(
        APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
        "Unknown application command.",
      );
  }
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

function withoutRedoHistory(history) {
  if (!history) {
    return {};
  }
  return {
    history: {
      past: history.past ?? [],
      future: [],
    },
  };
}

function undoHistory(state) {
  const history = state.history ?? {};
  const record = history.past?.at(-1);
  if (!record) {
    return inertResult(state);
  }

  const nextHistory = {
    past: history.past.slice(0, -1),
    future: [...(history.future ?? []), record],
  };
  return {
    state: {
      ...stateFromDurableState(record.before),
      history: nextHistory,
    },
    effects: [persistDurableStateEffect(record.before)],
  };
}

function redoHistory(state) {
  const history = state.history ?? {};
  const record = history.future?.at(-1);
  if (!record) {
    return inertResult(state);
  }

  const nextHistory = {
    past: [...(history.past ?? []), record],
    future: history.future.slice(0, -1),
  };
  return {
    state: {
      ...stateFromDurableState(record.after),
      history: nextHistory,
    },
    effects: [persistDurableStateEffect(record.after)],
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

function commitPlacementEdit(state, command) {
  if (
    !state.session
      || state.session.mode !== "align"
      || placementEquals(state.session.placement, command.placement)
  ) {
    return inertResult(state);
  }

  const nextState = {
    session: {
      ...state.session,
      placement: command.placement,
    },
  };
  return {
    state: nextState,
    effects: [
      persistDurableStateEffect(selectDurableApplicationState(nextState)),
    ],
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
    if (isReplacementReferenceImageInput(state)) {
      return replacementInputNoticeResult({
        state,
        notice: {
          kind: "reference-image-replacement-cancelled",
          requestId: state.referenceImageInput.requestId,
        },
        requestId: state.referenceImageInput.requestId,
      });
    }
    return {
      state: {
        notice: {
          kind: "reference-image-paste-cancelled",
        },
      },
      effects: [],
    };
  }
  if (!state.session) {
    return {
      state: {
        referenceImageInput: {
          status: "awaiting-input",
          requestId: 1,
        },
      },
      effects: [requestReferenceImageInputEffect(1)],
    };
  }
  if (state.panelIntent?.kind === "confirm-clear-pins") {
    return clearRegistrationPins(state);
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

function requestReferenceImageReplacement(state) {
  if (!state.session) {
    return inertResult(state);
  }

  const requestId = 1;
  return {
    state: {
      session: state.session,
      ...historyState(state),
      referenceImageInput: {
        status: "awaiting-input",
        requestId,
        intent: {
          kind: "replace-reference-image",
        },
      },
    },
    effects: [requestReferenceImageInputEffect(requestId)],
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

function clearReferenceImageWithHistory(state) {
  const record = {
    kind: "remove-reference-image",
    undoLabel: "Reload image",
    redoLabel: "Remove image",
    before: selectDurableApplicationState(state),
    after: null,
  };
  return {
    state: {
      history: pushHistory(state.history, record),
    },
    effects: [persistDurableStateEffect(null)],
  };
}

function pushHistory(history, record) {
  return {
    past: [...(history?.past ?? []), record],
    future: [],
  };
}

function reportReferenceImageInputOutcome(state, command) {
  if (state.referenceImageInput?.requestId !== command.requestId) {
    return inertResult(state);
  }
  if (isReplacementReferenceImageInput(state)) {
    return reportReferenceImageReplacementOutcome(state, command);
  }
  if (command.outcome?.kind === "empty") {
    return {
      state: {
        notice: {
          kind: "reference-image-input-empty",
          requestId: command.requestId,
        },
      },
      effects: [scheduleClearStatusNoticeEffect(command.requestId)],
    };
  }
  if (command.outcome?.kind === "failed") {
    return {
      state: {
        notice: {
          kind: "reference-image-paste-failed",
          reason: command.outcome.reason,
          requestId: command.requestId,
        },
      },
      effects: [],
    };
  }

  const session = {
    mode: "align",
    referenceImage: command.outcome.referenceImage,
  };
  return {
    state: {
      session,
    },
    effects: [persistDurableStateEffect({ session })],
  };
}

function isReplacementReferenceImageInput(state) {
  return Boolean(
    state.session
      && state.referenceImageInput?.intent?.kind === "replace-reference-image",
  );
}

function reportReferenceImageReplacementOutcome(state, command) {
  if (command.outcome?.kind === "empty") {
    return replacementInputNoticeResult({
      state,
      notice: {
        kind: "reference-image-replacement-empty",
        requestId: command.requestId,
      },
      requestId: command.requestId,
    });
  }
  if (command.outcome?.kind === "failed") {
    return replacementInputNoticeResult({
      state,
      notice: {
        kind: "reference-image-replacement-failed",
        reason: command.outcome.reason,
        requestId: command.requestId,
      },
      requestId: command.requestId,
    });
  }

  const session = {
    mode: "align",
    referenceImage: command.outcome.referenceImage,
  };
  const nextDurableState = { session };
  const record = {
    kind: "replace-reference-image",
    undoLabel: "Restore previous image",
    redoLabel: "Replace image",
    before: selectDurableApplicationState(state),
    after: nextDurableState,
  };
  return {
    state: {
      session,
      history: pushHistory(state.history, record),
    },
    effects: [persistDurableStateEffect(nextDurableState)],
  };
}

function replacementInputNoticeResult({ state, notice, requestId }) {
  return {
    state: {
      session: state.session,
      ...historyState(state),
      notice,
    },
    effects: [scheduleClearStatusNoticeEffect(requestId)],
  };
}

function selectMode(state, command) {
  const { mode } = command;
  if (!state.session || state.session.mode === mode) {
    return inertResult(state);
  }

  if (
    mode === "trace"
      && commandHasSolvedPlacement(command)
      && (state.session.registration?.pins ?? []).length >= 2
  ) {
    const solvedPlacement = command.solvedPlacement;
    const nextState = {
      session: {
        ...state.session,
        mode,
        placement: solvedPlacement,
        registration: {
          ...state.session.registration,
          solvedPlacement,
        },
      },
      notice: {
        kind: "fit-reference-image-from-pins",
        pinCount: state.session.registration.pins.length,
      },
    };
    return {
      state: nextState,
      effects: [
        persistDurableStateEffect(selectDurableApplicationState(nextState)),
      ],
    };
  }

  const nextState = {
    session: {
      ...state.session,
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

function commandHasSolvedPlacement(command) {
  return command?.solvedPlacement !== undefined;
}

function clearRegistrationPins(state) {
  if (
    !state.session
      || state.session.mode !== "align"
      || (state.session.registration?.pins ?? []).length === 0
  ) {
    return inertResult(state);
  }

  const pinCount = state.session.registration.pins.length;
  const nextState = {
    session: withoutRegistration(state.session),
    notice: {
      kind: "cleared-pins",
      count: pinCount,
    },
  };
  return {
    state: nextState,
    effects: [
      persistDurableStateEffect(selectDurableApplicationState(nextState)),
    ],
  };
}

function toggleRegistrationPin(state, command) {
  if (!state.session || state.session.mode !== "align") {
    return inertResult(state);
  }

  const pins = state.session.registration?.pins ?? [];
  if (command.existingPinId !== null && command.existingPinId !== undefined) {
    const nextPins = pins.filter((pin) => pin.id !== command.existingPinId);
    if (nextPins.length === pins.length) {
      return inertResult(state);
    }
    const nextState = {
      session: withRegistrationPins(state.session, nextPins),
      notice: {
        kind: "removed-pin",
        pinId: command.existingPinId,
      },
    };
    return {
      state: nextState,
      effects: [
        persistDurableStateEffect(selectDurableApplicationState(nextState)),
      ],
    };
  }

  const pin = {
    id: nextPinId(pins),
    imagePx: command.imagePx,
    mapLatLon: command.mapLatLon,
  };
  const nextState = {
    session: withRegistrationPins(state.session, [...pins, pin]),
    notice: {
      kind: "added-pin",
      pinId: pin.id,
    },
  };
  return {
    state: nextState,
    effects: [
      persistDurableStateEffect(selectDurableApplicationState(nextState)),
    ],
  };
}

function withRegistrationPins(session, pins) {
  if (pins.length === 0) {
    return withoutRegistration(session);
  }
  return {
    ...session,
    registration: {
      pins,
    },
  };
}

function nextPinId(pins) {
  return Math.max(0, ...pins.map((pin) => pin.id)) + 1;
}

function withoutRegistration(session) {
  const nextSession = {};
  for (const [key, value] of Object.entries(session)) {
    if (key !== "registration") {
      nextSession[key] = value;
    }
  }
  return nextSession;
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

function inertResult(state) {
  return {
    state,
    effects: [],
  };
}

function persistDurableStateEffect(durableState) {
  return {
    kind: "persist-durable-state",
    durableState,
  };
}

function requestReferenceImageInputEffect(requestId) {
  return {
    kind: "request-reference-image-input",
    requestId,
  };
}

function scheduleClearStatusNoticeEffect(requestId) {
  return {
    kind: "schedule-clear-status-notice",
    requestId,
    delayMs: 2500,
  };
}

function scheduleClearPanelIntentEffect({ requestId, intentKind }) {
  return {
    kind: "schedule-clear-panel-intent",
    requestId,
    intentKind,
    delayMs: 2500,
  };
}

function assertValidState(state) {
  if (!isPlainData(state) || state === null || Array.isArray(state)) {
    throwBoundary(
      APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_STATE,
      "Invalid application state.",
    );
  }
}

function assertValidCommand(command) {
  if (!isPlainData(command) || command === null || Array.isArray(command)) {
    if (isKnownCommandObject(command)) {
      throwBoundary(
        APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
        "Invalid application command.",
      );
    }
    throwBoundary(
      APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
      "Unknown application command.",
    );
  }
  if (!isKnownCommandObject(command)) {
    throwBoundary(
      APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
      "Unknown application command.",
    );
  }

  const { kind, ...payload } = command;
  createApplicationCommand(kind, payload);
}

function isKnownCommandObject(command) {
  return command
    && typeof command === "object"
    && !Array.isArray(command)
    && Object.values(APPLICATION_COMMAND_KIND).includes(command.kind);
}

function assertSupportedDurableState(durableState) {
  if (!isPlainData(durableState)) {
    throwBoundary(
      APPLICATION_BOUNDARY_ERROR_CODE.INVALID_DURABLE_STATE,
      "Invalid durable state.",
    );
  }
  const durableKeys = Object.keys(durableState);
  for (const key of durableKeys) {
    if (key !== "session") {
      throwBoundary(
        APPLICATION_BOUNDARY_ERROR_CODE.UNSUPPORTED_DURABLE_STATE,
        "Unsupported durable state.",
      );
    }
  }
  const sessionKeys = durableState.session ? Object.keys(durableState.session) : [];
  for (const key of sessionKeys) {
    if (!["mode", "referenceImage", "registration", "placement", "opacity"].includes(key)) {
      throwBoundary(
        APPLICATION_BOUNDARY_ERROR_CODE.UNSUPPORTED_DURABLE_STATE,
        "Unsupported durable state.",
      );
    }
  }
  if (!isSupportedSession(durableState.session)) {
    throwBoundary(
      APPLICATION_BOUNDARY_ERROR_CODE.UNSUPPORTED_DURABLE_STATE,
      "Unsupported durable state.",
    );
  }
}

function isSupportedSession(session) {
  return session
    && typeof session === "object"
    && !Array.isArray(session)
    && ["align", "trace"].includes(session.mode)
    && isReferenceImageData(session.referenceImage)
    && (session.registration === undefined || isRegistrationData(session.registration))
    && (session.placement === undefined || isPlacementData(session.placement))
    && (session.opacity === undefined || isOpacityData(session.opacity));
}

function isRegistrationData(registration) {
  if (
    !registration
      || typeof registration !== "object"
      || Array.isArray(registration)
  ) {
    return false;
  }
  for (const key of Object.keys(registration)) {
    if (!["pins", "solvedPlacement"].includes(key)) {
      return false;
    }
  }
  return Array.isArray(registration.pins)
    && registration.pins.every(isRegistrationPinData)
    && (
      registration.solvedPlacement === undefined
        || isPlacementData(registration.solvedPlacement)
    );
}

function isRegistrationPinData(pin) {
  return pin
    && typeof pin === "object"
    && !Array.isArray(pin)
    && isPositiveInteger(pin.id)
    && isPointData(pin.imagePx)
    && isLatLonData(pin.mapLatLon);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isPointData(value) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && Number.isFinite(value.x)
    && Number.isFinite(value.y);
}

function isLatLonData(value) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && Number.isFinite(value.lat)
    && Number.isFinite(value.lon);
}

function isOpacityData(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function isEmptyObject(value) {
  return value
    && typeof value === "object"
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === 0;
}

function throwBoundary(code, message) {
  throw new ApplicationBoundaryError({ code, message });
}
