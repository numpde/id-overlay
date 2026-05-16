import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../application/command.js";
import {
  handleApplicationCommand,
} from "../application/handle-command.js";
import {
  selectApplicationView,
  selectDurableApplicationState,
} from "../application/view-model.js";
import {
  createRuntimeDriver,
} from "./runtime.js";
import {
  createInteractionRuntime,
} from "./interaction-runtime.js";
import {
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
import {
  stepShellApplication,
} from "./shell-application-step.js";

const OWNER_ID = "id-overlay";
const ROOT_RECORD = Symbol.for("id-overlay.browser-session");
const RUNTIME_LOCAL_STATE_KEY = "history";
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
    durableState: selectDurableApplicationState(shell.runtime.getState()),
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
  if (!state || !Object.hasOwn(state, RUNTIME_LOCAL_STATE_KEY)) {
    return state;
  }
  const nextState = {};
  for (const [key, value] of Object.entries(state)) {
    if (key !== RUNTIME_LOCAL_STATE_KEY) {
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
