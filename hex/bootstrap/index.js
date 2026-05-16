import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../application/command.js";
import {
  ApplicationBoundaryError,
} from "../application/errors.js";
import {
  handleApplicationCommand,
} from "../application/handle-command.js";
import {
  createOverlayFittedNotice,
  withStatusNotice,
} from "../application/status-notice.js";
import {
  createInitialApplicationState,
} from "../application/state.js";
import {
  selectApplicationView,
} from "../application/view-model.js";
import {
  resolvePanelPosition,
} from "../adapters/ui/panel-position-adapter.js";
import {
  createRuntimeDriver,
} from "./runtime.js";
import {
  createInteractionRuntime,
} from "./interaction-runtime.js";

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
const HOST_PORT = Object.freeze({
  projectOverlayForPageSnapshot: "projectTraceOverlayForPageSnapshot",
});
const REGISTRATION_SOLVER_METHOD = "solveRegistrationPlacement";
const LEGACY_PLACEMENT_MIGRATION_METHOD = "reconcileLegacyPlacement";

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
    lastRenderDebugSignature: "",
    normalizingPlacementFromSnapshot: false,
    pageSnapshot: null,
    panelChrome: await readPanelChrome(host),
    root,
    runtime: null,
  };

  const initialDurableState = await readStartupDurableState(host);
  const initialState = await hydrateStartupState({ host, durableState: initialDurableState });

  const runtime = host.startRuntime?.(createRuntimeDriver({
    initialState,
    stepApplication(input) {
      return stepShellApplication({
        host,
        pageSnapshot: shell.pageSnapshot,
        ...input,
      });
    },
    effectHandlers: createEffectHandlers({
      host,
      dispatchApplicationCommand,
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
    logRenderProjection({
      host,
      shell,
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
    logDebug(host, "shell.page-snapshot", "received", {
      snapshot: summarizePageSnapshot(snapshot),
    });
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

function projectApplicationView({ host, pageSnapshot, view }) {
  const projectOverlay = host[HOST_PORT.projectOverlayForPageSnapshot];
  if (!pageSnapshot || typeof projectOverlay !== "function") {
    logDebug(host, "shell.projection", "skipped", {
      reason: !pageSnapshot ? "missing-page-snapshot" : "missing-projector",
      overlay: summarizeOverlay(view.overlay),
    });
    return view;
  }
  const projectedOverlay = projectOverlay({
    overlay: view.overlay,
    pageSnapshot,
  });
  logDebug(host, "shell.projection", "projected", {
    snapshot: summarizePageSnapshot(pageSnapshot),
    before: summarizeOverlay(view.overlay),
    after: summarizeOverlay(projectedOverlay),
  });
  return {
    ...view,
    overlay: projectedOverlay,
  };
}

function logRenderProjection({
  host,
  shell,
  pageSnapshot,
  baseView,
  projectedView,
}) {
  const payload = {
    selectedViewMode: projectedView.mode,
    overlayInput: projectedView.overlayInput,
    snapshot: summarizePageSnapshot(pageSnapshot),
    before: summarizeOverlay(baseView.overlay),
    after: summarizeOverlay(projectedView.overlay),
  };
  const signature = JSON.stringify(payload);
  if (signature === shell.lastRenderDebugSignature) {
    return;
  }
  shell.lastRenderDebugSignature = signature;
  logDebug(host, "shell.render", "application-view", payload);
}

function logDebug(host, scope, event, payload = {}) {
  host.eventDebugLogger?.log?.(scope, event, payload);
}

function summarizePageSnapshot(snapshot) {
  if (!snapshot) {
    return null;
  }
  return {
    kind: snapshot.kind,
    reason: snapshot.reason,
    mapView: snapshot.mapView,
    viewportPx: snapshot.viewportPx,
    viewportScreenPx: snapshot.viewportScreenPx,
    tileTransform: snapshot.tileTransform,
    surfaceMotion: snapshot.surfaceMotion,
    provenance: snapshot.provenance,
  };
}

function summarizeOverlay(overlay) {
  if (!overlay) {
    return null;
  }
  return {
    visible: overlay.visible,
    viewport: overlay.viewport,
    overlayPlacement: overlay.placement,
    image: summarizePlacementBox(overlay.image),
    frame: summarizePlacementBox(overlay.frame),
    intrinsicSizePx: overlay.intrinsicSizePx,
    opacity: overlay.opacity,
    pageProjectionSource: summarizePageProjectionSource(overlay.pageProjectionSource),
    pageProjectionFailure: overlay.pageProjectionFailure,
    pageSurfaceMotion: overlay.pageSurfaceMotion,
    mapLayer: overlay.mapLayer,
    pinsCount: overlay.pins?.length,
    mapPinsCount: overlay.mapPins?.length,
  };
}

function summarizePlacementBox(box) {
  if (!box) {
    return null;
  }
  return {
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    opacity: box.opacity,
    transformCss: box.transformCss,
  };
}

function summarizePageProjectionSource(source) {
  if (!source) {
    return null;
  }
  return {
    kind: source.kind,
    projectionMode: source.mode,
    transform: source.transform,
  };
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

function createEffectHandlers({ host, dispatchApplicationCommand }) {
  return {
    "persist-durable-state": async (effect) => {
      try {
        await host.durableStatePort?.writeDurableState(effect.durableState);
      } catch (error) {
        reportHostError(host, error);
      }
      return null;
    },
    "request-reference-image-input": async (effect) => {
      host.referenceImageInputPort?.startReferenceImageInput?.({
        requestId: effect.requestId,
        intent: effect.intent,
        reportOutcome: async (outcome) => {
          const nextOutcome = withInitialPlacement({
            host,
            intent: effect.intent,
            outcome,
          });
          await dispatchApplicationCommand(createApplicationCommand(
            APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
            {
              requestId: effect.requestId,
              outcome: nextOutcome,
            },
          ));
        },
      });
      return null;
    },
    "cancel-reference-image-input": async (effect) => {
      host.referenceImageInputPort?.cancelReferenceImageInput?.({
        requestId: effect.requestId,
      });
      return null;
    },
    "schedule-application-command": async (effect) => {
      host.timerPort?.scheduleApplicationCommand?.({
        scheduleId: effect.scheduleId,
        delayMs: effect.delayMs,
        command: effect.command,
        dispatchApplicationCommand,
      });
      return null;
    },
  };
}

function withInitialPlacement({ host, intent, outcome }) {
  if (
    intent?.kind !== "load-reference-image"
      || outcome?.kind !== "accepted"
      || outcome.placement !== undefined
  ) {
    return outcome;
  }
  const pageSnapshot = host.pageSnapshotPort?.readSnapshot?.();
  if (!isLiveMapSnapshot(pageSnapshot)) {
    return outcome;
  }
  const placement = host.initialReferencePlacementPort?.createInitialReferencePlacement?.({
    [STATE_KEY.referenceImage]: outcome[STATE_KEY.referenceImage],
    pageSnapshot,
  });
  if (!placement) {
    return outcome;
  }
  return {
    ...outcome,
    [STATE_KEY.placement]: placement,
  };
}

function isLiveMapSnapshot(snapshot) {
  return snapshot?.kind === "supported-map-page"
    && snapshot.provenance?.mapView?.kind !== "retained-during-surface-motion";
}

function isMapLockedMode(mode) {
  return mode === MODE.trace || mode === MODE.align;
}

function deriveMapLockedPlacementFromScreenPlacement({ placement, pageSnapshot }) {
  const centerWorld = projectLatLonToWorld(pageSnapshot.mapView.centerLatLon);
  const zoomScale = 2 ** pageSnapshot.mapView.zoom;
  const viewportCenter = {
    x: (pageSnapshot.viewportScreenPx?.x ?? 0) + pageSnapshot.viewportPx.width / 2,
    y: (pageSnapshot.viewportScreenPx?.y ?? 0) + pageSnapshot.viewportPx.height / 2,
  };
  return {
    x: centerWorld.x + (placement.x - viewportCenter.x) / zoomScale,
    y: centerWorld.y + (placement.y - viewportCenter.y) / zoomScale,
    scale: placement.scale / zoomScale,
    rotationRad: placement.rotationRad,
    coordinateSpace: "map-world",
  };
}

function projectLatLonToWorld({ lat, lon }) {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const clampedSin = Math.min(0.9999, Math.max(-0.9999, sinLat));
  return {
    x: 256 * ((lon + 180) / 360),
    y: 256 * (0.5 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (4 * Math.PI)),
  };
}

async function readStartupDurableState(host) {
  try {
    return await host.durableStatePort?.readDurableState?.() ?? null;
  } catch (error) {
    reportHostError(host, error);
    return null;
  }
}

async function hydrateStartupState({ host, durableState }) {
  const migrated = tryMigrateLegacyState({ host, durableState });
  if (migrated.status === "migrated") {
    await writeStartupRecovery(host, migrated.durableState);
    return stateFromDurableState(migrated.durableState);
  }
  if (migrated.status === "recovered") {
    return stateFromDurableState(migrated.durableState);
  }
  const normalized = tryNormalizeStartupPlacementCoordinateSpace({ host, durableState });
  if (normalized.status === "normalized") {
    await writeStartupRecovery(host, normalized.durableState);
    return stateFromDurableState(normalized.durableState);
  }
  try {
    return handleApplicationCommand({
      state: createInitialApplicationState(),
      command: createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
        durableState,
      }),
    }).state;
  } catch (error) {
    if (error instanceof ApplicationBoundaryError) {
      await writeStartupRecovery(host, null);
      return createInitialApplicationState();
    }
    throw error;
  }
}

function tryNormalizeStartupPlacementCoordinateSpace({ host, durableState }) {
  if (!hasStartupPlacementNormalizationCandidate(durableState)) {
    return {
      status: "none",
    };
  }
  return tryNormalizeDurablePlacementCoordinateSpace({
    durableState,
    snapshot: host.pageSnapshotPort?.readSnapshot?.(),
  });
}

function hasStartupPlacementNormalizationCandidate(durableState) {
  const current = durableState?.[STATE_KEY.session];
  const placement = current?.[STATE_KEY.placement];
  return Boolean(
    current
      && current[STATE_KEY.mode] === MODE.align
      && placement
      && placement.coordinateSpace !== "map-world",
  );
}

function tryNormalizeDurablePlacementCoordinateSpace({ durableState, snapshot }) {
  const current = durableState?.[STATE_KEY.session];
  const placement = current?.[STATE_KEY.placement];
  if (
    !current
      || current[STATE_KEY.mode] !== MODE.align
      || !placement
      || placement.coordinateSpace === "map-world"
  ) {
    return {
      status: "none",
    };
  }
  if (!isLiveMapSnapshot(snapshot)) {
    return {
      status: "none",
    };
  }
  if (
    placement.coordinateSpace !== "screen"
      && snapshot.provenance?.activeEditor !== "embedded-id-frame"
  ) {
    return {
      status: "none",
    };
  }
  return {
    status: "normalized",
    durableState: {
      [STATE_KEY.session]: {
        ...current,
        [STATE_KEY.placement]: deriveMapLockedPlacementFromScreenPlacement({
          placement,
          pageSnapshot: snapshot,
        }),
      },
    },
  };
}

function tryMigrateLegacyState({ host, durableState }) {
  const current = durableState?.[STATE_KEY.session];
  const legacyPlace = current?.[STATE_KEY.placement];
  if (!current || !isLegacyMapCenteredPlace(legacyPlace)) {
    return {
      status: "none",
    };
  }
  const snapshot = host.pageSnapshotPort?.readSnapshot?.();
  if (snapshot?.kind !== "supported-map-page") {
    return {
      status: "recovered",
      durableState: withoutKey(durableState, [STATE_KEY.session, STATE_KEY.placement]),
    };
  }
  const migrate = host.legacyPlacementMigrationPort?.[LEGACY_PLACEMENT_MIGRATION_METHOD];
  const nextPlace = migrate?.({
    [STATE_KEY.referenceImage]: current[STATE_KEY.referenceImage],
    legacyPlacement: legacyPlace,
    pageSnapshot: snapshot,
  });
  if (!nextPlace) {
    return {
      status: "recovered",
      durableState: withoutKey(durableState, [STATE_KEY.session, STATE_KEY.placement]),
    };
  }
  return {
    status: "migrated",
    durableState: {
      [STATE_KEY.session]: {
        ...current,
        [STATE_KEY.placement]: nextPlace,
      },
    },
  };
}

function isLegacyMapCenteredPlace(value) {
  return Boolean(value?.centerMapLatLon);
}

function withoutKey(durableState, [outerKey, innerKey]) {
  const current = durableState?.[outerKey];
  if (!current) {
    return durableState;
  }
  const nextInner = {};
  for (const [key, value] of Object.entries(current)) {
    if (key !== innerKey) {
      nextInner[key] = value;
    }
  }
  return {
    [outerKey]: nextInner,
  };
}

async function writeStartupRecovery(host, durableState) {
  try {
    await host.durableStatePort?.writeDurableState?.(durableState);
  } catch (error) {
    reportHostError(host, error);
  }
}

function stateFromDurableState(durableState) {
  if (durableState === null) {
    return createInitialApplicationState();
  }
  return {
    [STATE_KEY.session]: durableState[STATE_KEY.session],
  };
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

async function readPanelChrome(host) {
  try {
    return normalizeStoredPanelChrome({
      storedChrome: await host.panelChromePort?.readPanelChrome?.(),
      host,
    });
  } catch (error) {
    reportHostError(host, error);
    return normalizeStoredPanelChrome({
      storedChrome: null,
      host,
    });
  }
}

function normalizeStoredPanelChrome({ storedChrome, host }) {
  return normalizePanelChrome({
    position: {
      requestedScreenPx: storedChrome?.position?.screenPx ?? {
        x: 16,
        y: 16,
      },
      panelSizePx: host.panelSizePx ?? {
        width: 240,
        height: 120,
      },
      viewportPx: host.pageViewportPx ?? {
        width: 800,
        height: 600,
      },
    },
  });
}

function normalizePanelChrome({ position }) {
  return {
    position: {
      screenPx: resolvePanelPosition(position),
    },
  };
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
