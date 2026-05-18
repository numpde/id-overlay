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
  APPLICATION_MODE,
  APPLICATION_STATE_KEY,
  PAGE_SNAPSHOT_KIND,
  PLACEMENT_COORDINATE_SPACE,
} from "./application-state-vocabulary.js";
import {
  deriveMapLockedPlacementFromScreenPlacement,
  isLiveMapSnapshot,
  isMapLockedMode,
} from "./map-locked-placement.js";

const CENTER_OVERLAY_VIEW_PADDING_RATIO = 0.9;
const STATE_KEY = APPLICATION_STATE_KEY;
const MODE = APPLICATION_MODE;
const REGISTRATION_SOLVER_METHOD = "solveRegistrationPlacement";

export function stepShellApplication({ host, pageSnapshot, state, command }) {
  const effectiveCommand = withMeasuredCenterPlacement({
    pageSnapshot,
    state,
    command,
  });
  const solve = maybeSolveBeforeStep({ host, state, command: effectiveCommand });
  const result = handleApplicationCommand({ state, command: effectiveCommand });
  if (!solve) {
    return withSelectedModePlacement({
      previousState: state,
      pageSnapshot,
      result,
      command: effectiveCommand,
    });
  }
  return withSolvedFit({ previousState: state, result, solve });
}

function withMeasuredCenterPlacement({
  pageSnapshot,
  state,
  command,
}) {
  if (
    command.kind !== APPLICATION_COMMAND_KIND.CENTER_OVERLAY_IN_VIEW
  ) {
    return command;
  }
  const placement = centerPlacementForCurrentView({
    pageSnapshot,
    state,
  });
  if (!placement) {
    return command;
  }
  return {
    ...command,
    placement,
  };
}

function centerPlacementForCurrentView({
  pageSnapshot,
  state,
}) {
  const imageSize = state.session?.referenceImage?.intrinsicSizePx;
  const viewport = pageSnapshot?.viewportPx;
  if (
    pageSnapshot?.kind !== PAGE_SNAPSHOT_KIND.supportedMapPage
      || !Number.isFinite(imageSize?.width)
      || !Number.isFinite(imageSize?.height)
      || imageSize.width <= 0
      || imageSize.height <= 0
      || !Number.isFinite(viewport?.width)
      || !Number.isFinite(viewport?.height)
      || viewport.width <= 0
      || viewport.height <= 0
  ) {
    return null;
  }
  const scale = CENTER_OVERLAY_VIEW_PADDING_RATIO * Math.min(
    viewport.width / imageSize.width,
    viewport.height / imageSize.height,
  );
  const origin = pageSnapshot.viewportScreenPx ?? {
    x: 0,
    y: 0,
  };
  const screenPlacement = {
    x: origin.x + (viewport.width - imageSize.width * scale) / 2,
    y: origin.y + (viewport.height - imageSize.height * scale) / 2,
    scale,
    rotationRad: 0,
    coordinateSpace: PLACEMENT_COORDINATE_SPACE.screen,
  };
  if (!isLiveMapSnapshot(pageSnapshot)) {
    return screenPlacement;
  }
  return deriveMapLockedPlacementFromScreenPlacement({
    placement: screenPlacement,
    pageSnapshot,
  });
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
      pinCount: solve.solvedTransform?.pinIds?.length
        ?? state[STATE_KEY.session]?.[STATE_KEY.registration]?.[STATE_KEY.pins]?.length
        ?? 0,
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
  if (!placement || placement.coordinateSpace === PLACEMENT_COORDINATE_SPACE.mapWorld) {
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
    coordinateSpace: PLACEMENT_COORDINATE_SPACE.mapWorld,
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
