import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../application/command.js";
import {
  handleApplicationCommand,
} from "../application/handle-command.js";
import {
  createOverlayFittedNotice,
  withStatusNotice,
} from "../application/status-notice.js";
import {
  selectApplicationView,
} from "../application/view-model.js";
import {
  createRuntimeDriver,
} from "./runtime.js";
import {
  createInteractionRuntime,
} from "./interaction-runtime.js";
import {
  deriveMapLockedPlacementFromScreenPlacement,
  isLiveMapSnapshot,
  isMapLockedMode,
  tryNormalizeDurablePlacementCoordinateSpace,
} from "./map-locked-placement.js";
import {
  hydrateStartupState,
  readStartupDurableState,
} from "./startup-durable-state.js";
import {
  normalizePanelChrome,
  readPanelChrome,
} from "./panel-chrome.js";
import {
  createBrowserEffectHandlers,
} from "./browser-effect-handlers.js";
import {
  createRenderProjectionLogger,
  logPageSnapshotReceived,
  projectApplicationView,
} from "./browser-render-projection.js";

const OWNER_ID = "id-overlay";
const ROOT_RECORD = Symbol.for("id-overlay.browser-session");
const STATE_KEY = Object.freeze({
  session: "session",
  referenceImage: "referenceImage",
  registration: "registration",
  pins: "pins",
  placement: "placement",
  solvedPlacement: "solvedPlacement",
  opacity: "opacity",
  mode: "mode",
  history: "history",
});
const MODE = Object.freeze({
  align: "align",
  trace: "trace",
});
const REGISTRATION_SOLVER_METHOD = "solveRegistrationPlacement";

export async function bootstrapBrowserExtension(host) {
  if (host.pageContext?.kind !== "supported-map-editor-page") {
    return {
      kind: "unsupported-page",
    };
  }
  if (host[ROOT_RECORD]) {
    return host[ROOT_RECORD].result;
  }

  const root = host.mountOwnedRoot?.(OWNER_ID, {}) ?? {};
  const shell = {
    disposed: false,
    activeNativeMapPan: null,
    disposers: [],
    hasRendered: false,
    normalizingPlacementFromSnapshot: false,
    pageSnapshot: null,
    panelChrome: await readPanelChrome({ host, reportHostError }),
    renderProjectionLogger: createRenderProjectionLogger({ host }),
    root,
    runtime: null,
  };

  const initialDurableState = await readStartupDurableState({ host, reportHostError });
  const initialState = await hydrateStartupState({
    host,
    durableState: initialDurableState,
    reportHostError,
  });

  const runtime = host.startRuntime?.(createRuntimeDriver({
    initialState,
    stepApplication(input) {
      return stepShellApplication({
        host,
        pageSnapshot: shell.pageSnapshot,
        ...input,
      });
    },
    effectHandlers: createBrowserEffectHandlers({
      host,
      dispatchApplicationCommand,
      reportHostError,
    }),
  })) ?? createRuntimeDriver({
    initialState,
    stepApplication: handleApplicationCommand,
    effectHandlers: {},
  });
  const publicRuntime = createPublicRuntime(runtime);

  shell.runtime = publicRuntime;
  const result = {
    kind: "started",
    runtime: publicRuntime,
  };
  shell.result = result;
  host[ROOT_RECORD] = shell;

  host.handleInteractionFact = createInteractionRuntime({
    dispatchApplicationCommand,
    projectRegistrationPinToggle: host.projectRegistrationPinToggle,
    projectPlacementEdit: host.projectPlacementEdit,
    selectOpacity: host.selectOpacity,
    forwardNativeMapGesture: forwardNativeMapGesture,
    reportRuntimeError(error) {
      reportHostError(host, error);
    },
  }).handleInteractionFact;
  host.handlePanelChromeChange = handlePanelChromeChange;
  subscribePageSnapshots({ host, shell, render });

  bindOwnerWindowTeardown({ host, shell });
  render();
  return result;

  async function dispatchApplicationCommand(command) {
    if (shell.disposed) {
      return;
    }
    try {
      await endActiveNativeMapPanForCommand(command);
      await runtime.dispatch(command);
      render();
    } catch (error) {
      reportHostError(host, error);
    }
  }

  async function forwardNativeMapGesture(fact) {
    if (fact.gestureKind === "zoom" && shell.activeNativeMapPan) {
      return;
    }
    if (fact.gestureKind === "pan") {
      if (fact.phase === "start" || fact.phase === "move") {
        shell.activeNativeMapPan = {
          screenPx: fact.screenPx,
        };
      }
      if (fact.phase === "end") {
        shell.activeNativeMapPan = null;
      }
    }
    await host.forwardNativeMapGesture?.(fact);
  }

  async function endActiveNativeMapPanForCommand(command) {
    if (!shell.activeNativeMapPan || !doesCommandInterruptNativeMapPan(command)) {
      return;
    }
    const screenPx = shell.activeNativeMapPan.screenPx;
    shell.activeNativeMapPan = null;
    await host.forwardNativeMapGesture?.({
      kind: "native-map-gesture-requested",
      gestureKind: "pan",
      phase: "end",
      screenPx,
    });
  }

  async function handlePanelChromeChange(change) {
    if (shell.disposed) {
      return;
    }
    const nextChrome = normalizePanelChrome({
      position: {
        requestedScreenPx: change.position.requestedScreenPx,
        panelSizePx: change.position.panelSizePx,
        viewportPx: change.position.viewportPx,
      },
    });
    shell.panelChrome = nextChrome;
    try {
      await host.panelChromePort?.writePanelChrome?.(nextChrome);
    } catch (error) {
      reportHostError(host, error);
    }
    render();
  }

  function render() {
    if (shell.disposed) {
      return;
    }
    shell.hasRendered = true;
    const baseView = selectApplicationView(runtime.getState(), runtime.getViewFeedback?.() ?? null);
    const projectedView = projectApplicationView({
      host,
      pageSnapshot: shell.pageSnapshot,
      view: baseView,
    });
    shell.renderProjectionLogger.log({
      pageSnapshot: shell.pageSnapshot,
      baseView,
      projectedView,
    });
    host.renderApplicationView?.({
      root: shell.root,
      panelChrome: shell.panelChrome,
      view: projectedView,
      dispatchCommand: dispatchApplicationCommand,
      dispatchPanelChromeChange: handlePanelChromeChange,
      dispatchInteractionFact: host.handleInteractionFact,
    });
  }
}

function readPageSnapshot(host) {
  return host.pageSnapshotPort?.readSnapshot?.() ?? null;
}

function subscribePageSnapshots({ host, shell, render }) {
  const unsubscribe = host.pageSnapshotPort?.subscribe?.((snapshot) => {
    shell.pageSnapshot = snapshot;
    logPageSnapshotReceived({ host, snapshot });
    void normalizePlacementFromSnapshot({
      host,
      shell,
      snapshot,
      render,
    });
    if (shell.hasRendered) {
      render();
    }
  });
  if (typeof unsubscribe === "function") {
    shell.disposers.push(unsubscribe);
  }
}

async function normalizePlacementFromSnapshot({
  host,
  shell,
  snapshot,
  render,
}) {
  if (shell.disposed || shell.normalizingPlacementFromSnapshot || !shell.runtime) {
    return;
  }
  const normalized = tryNormalizeDurablePlacementCoordinateSpace({
    durableState: selectDurableState(shell.runtime.getState()),
    snapshot,
  });
  if (normalized.status !== "normalized") {
    return;
  }
  shell.normalizingPlacementFromSnapshot = true;
  try {
    await shell.runtime.dispatch(createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
      durableState: normalized.durableState,
    }));
    await host.durableStatePort?.writeDurableState?.(normalized.durableState);
    render();
  } catch (error) {
    reportHostError(host, error);
  } finally {
    shell.normalizingPlacementFromSnapshot = false;
  }
}

function doesCommandInterruptNativeMapPan(command) {
  return command.kind === APPLICATION_COMMAND_KIND.SELECT_MODE
    || command.kind === APPLICATION_COMMAND_KIND.CLEAR_REFERENCE_IMAGE
    || command.kind === APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION;
}

function stepShellApplication({ host, pageSnapshot, state, command }) {
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
  const baseDurableState = selectDurableState(result.state);
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
        before: selectDurableState(previousState),
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
  const durableState = selectDurableState(state);
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

function pushHistory(history, record) {
  return {
    past: [...(history?.past ?? []), record],
    future: [],
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

function selectDurableState(state) {
  if (!state?.[STATE_KEY.session]) {
    return null;
  }
  return {
    [STATE_KEY.session]: state[STATE_KEY.session],
  };
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

function createPublicRuntime(runtime) {
  return {
    dispatch(command) {
      return runtime.dispatch(command);
    },
    getState() {
      return withoutRuntimeLocalState(runtime.getState());
    },
    getViewFeedback() {
      return runtime.getViewFeedback?.() ?? null;
    },
    dispose() {
      runtime.dispose();
    },
  };
}

function withoutRuntimeLocalState(state) {
  if (!state || !Object.hasOwn(state, STATE_KEY.history)) {
    return state;
  }
  const nextState = {};
  for (const [key, value] of Object.entries(state)) {
    if (key !== STATE_KEY.history) {
      nextState[key] = value;
    }
  }
  return nextState;
}

function bindOwnerWindowTeardown({ host, shell }) {
  if (!host.ownerWindow) {
    return;
  }
  const teardown = () => {
    if (shell.disposed) {
      return;
    }
    shell.disposed = true;
    host.ownerWindow.removeEventListener("beforeunload", teardown);
    for (const dispose of shell.disposers.splice(0)) {
      dispose();
    }
    shell.root.dispose?.();
    shell.runtime.dispose?.();
    delete host[ROOT_RECORD];
  };
  shell.teardown = teardown;
  host.ownerWindow.addEventListener("beforeunload", teardown);
}

function reportHostError(host, error) {
  host.reportRuntimeError?.(error);
}
