import {
  APPLICATION_COMMAND_KIND,
} from "../application/command.js";
import {
  handleApplicationCommand,
} from "../application/handle-command.js";
import {
  pushHistory,
} from "../application/history.js";
import {
  createOverlayFittedNotice,
  withStatusNotice,
} from "../application/status-notice.js";
import {
  selectDurableApplicationState,
} from "../application/view-model.js";
import {
  deriveMapLockedPlacementFromScreenPlacement,
  isLiveMapSnapshot,
  isMapLockedMode,
} from "./map-locked-placement.js";

const STATE_KEY = Object.freeze({
  session: "session",
  registration: "registration",
  pins: "pins",
  placement: "placement",
  solvedPlacement: "solvedPlacement",
  mode: "mode",
  history: "history",
});
const MODE = Object.freeze({
  trace: "trace",
});
const REGISTRATION_SOLVER_METHOD = "solveRegistrationPlacement";

export function stepShellApplication({ host, pageSnapshot, state, command }) {
  const solve = maybeSolveBeforeStep({ host, state, command });
  const result = handleApplicationCommand({ state, command });
  if (!solve) {
    return withSelectedModePlacement({
      previousState: state,
      pageSnapshot,
      result,
      command,
    });
  }
  return withSolvedFit({ previousState: state, result, solve });
}

function withSelectedModePlacement({
  previousState,
  pageSnapshot,
  result,
  command,
}) {
  return withMapLockedPlacement({
    previousState,
    pageSnapshot,
    result,
    command,
  });
}

function maybeSolveBeforeStep({ host, state, command }) {
  if (
    command.kind !== APPLICATION_COMMAND_KIND.SELECT_MODE
      || command[STATE_KEY.mode] !== MODE.trace
      || host.registrationSolverPort === undefined
  ) {
    return null;
  }
  const pinList = state[STATE_KEY.session]?.[STATE_KEY.registration]?.[STATE_KEY.pins] ?? [];
  if (pinList.length < 2) {
    return null;
  }
  const solver = host.registrationSolverPort[REGISTRATION_SOLVER_METHOD];
  if (typeof solver !== "function") {
    return null;
  }
  const solve = solver({
    [STATE_KEY.pins]: pinList,
  });
  return solve?.kind === "solved" ? solve : null;
}

function withSolvedFit({ previousState, result, solve }) {
  const baseDurableState = selectDurableApplicationState(result.state);
  const durableState = applySolvedFit(baseDurableState, solve);
  if (plainDataEqual(baseDurableState, durableState)) {
    return result;
  }
  const state = applySolvedFit(result.state, solve);
  return {
    state: withStatusNotice({
      ...state,
      [STATE_KEY.history]: pushHistory(state[STATE_KEY.history], {
        kind: "fit-registration-placement",
        before: selectDurableApplicationState(previousState),
        after: durableState,
      }),
    }, createOverlayFittedNotice({
      pinCount: state[STATE_KEY.session]?.[STATE_KEY.registration]?.[STATE_KEY.pins]?.length ?? 0,
    })),
    effects: result.effects.map((effect) => (
      effect.kind === "persist-durable-state"
        ? {
            ...effect,
            durableState: applySolvedFit(effect.durableState, solve),
          }
        : effect
    )),
  };
}

function withMapLockedPlacement({
  previousState,
  pageSnapshot,
  result,
  command,
}) {
  const selectedMode = command[STATE_KEY.mode];
  if (
    command.kind !== APPLICATION_COMMAND_KIND.SELECT_MODE
      || !isMapLockedMode(selectedMode)
      || previousState?.[STATE_KEY.session]?.[STATE_KEY.mode] === selectedMode
      || result.state?.[STATE_KEY.session]?.[STATE_KEY.mode] !== selectedMode
      || !isLiveMapSnapshot(pageSnapshot)
  ) {
    return result;
  }
  const placement = previousState[STATE_KEY.session]?.[STATE_KEY.placement];
  if (!placement || placement.coordinateSpace === "map-world") {
    return result;
  }
  const nextPlacement = deriveMapLockedPlacementFromScreenPlacement({
    placement,
    pageSnapshot,
  });
  const state = {
    ...result.state,
    [STATE_KEY.session]: {
      ...result.state[STATE_KEY.session],
      [STATE_KEY.placement]: nextPlacement,
    },
  };
  const durableState = selectDurableApplicationState(state);
  return {
    state,
    effects: result.effects.map((effect) => (
      effect.kind === "persist-durable-state"
        ? {
            ...effect,
            durableState,
          }
        : effect
    )),
  };
}

function plainDataEqual(left, right) {
  if (Object.is(left, right)) {
    return true;
  }
  if (
    left === null
      || right === null
      || typeof left !== "object"
      || typeof right !== "object"
  ) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => plainDataEqual(value, right[index]));
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => Object.hasOwn(right, key) && plainDataEqual(left[key], right[key]));
}

function applySolvedFit(value, solve) {
  const current = value?.[STATE_KEY.session];
  if (!current) {
    return value;
  }
  const solvedRegistration = solvedRegistrationFromSolve({
    current,
    solve,
  });
  return {
    ...value,
    [STATE_KEY.session]: {
      ...current,
      ...(solvedPlacementFromSolve(solve) === undefined ? {} : {
        [STATE_KEY.placement]: solvedPlacementFromSolve(solve),
      }),
      [STATE_KEY.registration]: solvedRegistration,
    },
  };
}

function solvedPlacementFromSolve(solve) {
  if (solve[STATE_KEY.placement] !== undefined) {
    return solve[STATE_KEY.placement];
  }
  if (solve.solvedTransform === undefined) {
    return undefined;
  }
  return {
    x: solve.solvedTransform.tx,
    y: solve.solvedTransform.ty,
    scale: solve.solvedTransform.scale,
    rotationRad: solve.solvedTransform.rotationRad,
    coordinateSpace: "map-world",
  };
}

function solvedRegistrationFromSolve({ current, solve }) {
  const registration = {
    ...(current[STATE_KEY.registration] ?? {}),
  };
  if (solve[STATE_KEY.placement] !== undefined) {
    registration[STATE_KEY.solvedPlacement] = solve[STATE_KEY.placement];
  }
  if (solve.solvedTransform !== undefined) {
    registration.solvedTransform = solve.solvedTransform;
  }
  return registration;
}
