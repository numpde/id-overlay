import {
  persistDurableStateEffect,
} from "./effects.js";
import {
  pushHistory,
} from "./history.js";
import {
  selectDurableApplicationState,
} from "./view-model.js";

export function clearRegistrationPins(state, { inertResult }) {
  if (
    !state.session
      || state.session.mode !== "align"
      || (state.session.registration?.pins ?? []).length === 0
  ) {
    return inertResult(state);
  }

  const pinCount = state.session.registration.pins.length;
  const afterSession = withoutRegistration(state.session);
  const nextState = {
    session: afterSession,
    history: pushHistory(state.history, {
      kind: "clear-registration-pins",
      before: {
        session: state.session,
      },
      after: {
        session: afterSession,
      },
    }),
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

export function toggleRegistrationPin(state, command, { inertResult }) {
  if (!state.session || state.session.mode !== "align") {
    return inertResult(state);
  }

  const pins = state.session.registration?.pins ?? [];
  if (command.existingPinId !== null && command.existingPinId !== undefined) {
    const nextPins = pins.filter((pin) => pin.id !== command.existingPinId);
    if (nextPins.length === pins.length) {
      return inertResult(state);
    }
    const nextSession = withRegistrationPins(state.session, nextPins);
    const nextState = {
      session: nextSession,
      history: pushHistory(state.history, {
        kind: "registration-pin-edit",
        before: {
          session: state.session,
        },
        after: {
          session: nextSession,
        },
      }),
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
  const nextSession = withRegistrationPins(state.session, [...pins, pin]);
  const nextState = {
    session: nextSession,
    history: pushHistory(state.history, {
      kind: "registration-pin-edit",
      before: {
        session: state.session,
      },
      after: {
        session: nextSession,
      },
    }),
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
