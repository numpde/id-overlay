import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../application/command.js";
import {
  ApplicationBoundaryError,
} from "../application/errors.js";
import {
  resolvePanelPosition,
} from "../adapters/ui/panel-position-adapter.js";
import { handleApplicationCommand } from "../application/handle-command.js";
import { createInitialApplicationState } from "../application/state.js";
import { selectApplicationView } from "../application/view-model.js";
import { wireRuntime } from "./runtime.js";

// Bootstrap is the composition edge: concrete adapters are assembled here and
// wired to the application. It must not become a product logic layer.
const BOOTSTRAPS_BY_HOST = new WeakMap();

export async function bootstrapBrowserExtension(host) {
  if (host.pageContext?.kind !== "supported-map-editor-page") {
    return {
      kind: "unsupported-page",
    };
  }

  const existingBootstrap = BOOTSTRAPS_BY_HOST.get(host);
  if (existingBootstrap) {
    return existingBootstrap;
  }

  const rootDescriptor = {
    ownerId: "id-overlay",
  };
  const durableStatePort = host.durableStatePort ?? createNoopDurableStatePort();
  const panelChromePort = host.panelChromePort ?? createNoopPanelChromePort();
  let panelChrome = await readPanelChrome({
    host,
    panelChromePort,
  });
  const runtime = wireRuntime({
    initialState: createInitialApplicationState(),
    stepApplication: handleApplicationCommand,
    effectHandlers: createEffectHandlers({
      durableStatePort,
      host,
    }),
  });
  const startedRuntime = host.startRuntime(runtime) ?? runtime;
  const root = host.mountOwnedRoot("id-overlay", rootDescriptor) ?? rootDescriptor;

  async function dispatchAndRender(command, {
    reportApplicationBoundaryErrors = true,
  } = {}) {
    try {
      await startedRuntime.dispatch(command);
    } catch (error) {
      if (
        !(error instanceof ApplicationBoundaryError)
          || !reportApplicationBoundaryErrors
      ) {
        throw error;
      }
      host.reportRuntimeError?.(error);
      return;
    }
    renderApplicationView({
      host,
      panelChrome,
      root,
      runtime: startedRuntime,
      dispatchCommand: dispatchAndRender,
    });
  }

  const bootstrap = {
    kind: "bootstrapped",
    runtime: startedRuntime,
    root,
  };
  BOOTSTRAPS_BY_HOST.set(host, bootstrap);
  host.handlePanelChromeChange = async (change) => {
    panelChrome = normalizePanelChrome(panelChromeFromChange(change), {
      ...host,
      pageViewportPx: change.position?.viewportPx ?? host.pageViewportPx,
      panelSizePx: change.position?.panelSizePx ?? host.panelSizePx,
    });
    try {
      await panelChromePort.writePanelChrome(panelChrome);
    } catch (error) {
      host.reportRuntimeError?.(error);
    }
    renderApplicationView({
      host,
      panelChrome,
      root,
      runtime: startedRuntime,
      dispatchCommand: dispatchAndRender,
    });
  };
  await hydrateFromDurableState({
    dispatchAndRender,
    durableStatePort,
    host,
  });
  return bootstrap;
}

async function readPanelChrome({ host, panelChromePort }) {
  try {
    return normalizePanelChrome(await panelChromePort.readPanelChrome(), host);
  } catch (error) {
    host.reportRuntimeError?.(error);
    return normalizePanelChrome(null, host);
  }
}

async function hydrateFromDurableState({
  dispatchAndRender,
  durableStatePort,
  host,
}) {
  let durableState;
  try {
    durableState = await durableStatePort.readDurableState();
  } catch (error) {
    host.reportRuntimeError?.(error);
    durableState = null;
  }
  try {
    await dispatchAndRender(createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
      durableState,
    }), {
      reportApplicationBoundaryErrors: false,
    });
  } catch (error) {
    if (!(error instanceof ApplicationBoundaryError)) {
      throw error;
    }
    await durableStatePort.writeDurableState(null);
    await dispatchAndRender(createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
      durableState: null,
    }));
  }
}

function renderApplicationView({
  host,
  panelChrome,
  root,
  runtime,
  dispatchCommand,
}) {
  host.renderApplicationView?.({
    panelChrome,
    root,
    view: selectApplicationView(runtime.getState()),
    dispatchCommand,
  });
}

function createEffectHandlers({ durableStatePort, host }) {
  return {
    async "persist-durable-state"(effect) {
      try {
        await durableStatePort.writeDurableState(effect.durableState);
      } catch (error) {
        host.reportRuntimeError?.(error);
      }
      return null;
    },
    async "request-reference-image-input"() {
      return null;
    },
    async "schedule-clear-status-notice"() {
      return null;
    },
    async "schedule-clear-panel-intent"() {
      return null;
    },
  };
}

function createNoopDurableStatePort() {
  return {
    async readDurableState() {
      return null;
    },
    async writeDurableState() {},
  };
}

function createNoopPanelChromePort() {
  return {
    async readPanelChrome() {
      return null;
    },
    async writePanelChrome() {},
  };
}

function normalizePanelChrome(panelChrome, host) {
  const screenPx = panelChrome?.position?.screenPx;
  if (!isFiniteScreenPoint(screenPx)) {
    return createDefaultPanelChrome();
  }
  if (!isFinitePanelSize(host.panelSizePx) || !isFiniteViewport(host.pageViewportPx)) {
    return {
      position: {
        screenPx,
      },
    };
  }
  return {
    position: {
      screenPx: resolvePanelPosition({
        requestedScreenPx: screenPx,
        panelSizePx: host.panelSizePx,
        viewportPx: host.pageViewportPx,
      }),
    },
  };
}

function panelChromeFromChange(change) {
  return {
    position: {
      screenPx: change.position?.requestedScreenPx,
    },
  };
}

function createDefaultPanelChrome() {
  return {
    position: {
      screenPx: {
        x: 16,
        y: 16,
      },
    },
  };
}

function isFiniteScreenPoint(screenPx) {
  return Number.isFinite(screenPx?.x) && Number.isFinite(screenPx?.y);
}

function isFinitePanelSize(panelSizePx) {
  return Number.isFinite(panelSizePx?.width) && Number.isFinite(panelSizePx?.height);
}

function isFiniteViewport(viewportPx) {
  return Number.isFinite(viewportPx?.width) && Number.isFinite(viewportPx?.height);
}
