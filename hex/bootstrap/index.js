import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../application/command.js";
import { handleApplicationCommand } from "../application/handle-command.js";
import { createInitialApplicationState } from "../application/state.js";
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

  const root = {
    ownerId: "id-overlay",
  };
  const durableStatePort = host.durableStatePort ?? createNoopDurableStatePort();
  const runtime = wireRuntime({
    initialState: createInitialApplicationState(),
    stepApplication: handleApplicationCommand,
    effectHandlers: createEffectHandlers({
      durableStatePort,
    }),
  });
  const startedRuntime = host.startRuntime(runtime) ?? runtime;
  host.mountOwnedRoot("id-overlay", root);

  const bootstrap = {
    kind: "bootstrapped",
    runtime: startedRuntime,
    root,
  };
  BOOTSTRAPS_BY_HOST.set(host, bootstrap);
  await startedRuntime.dispatch(createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: await durableStatePort.readDurableState(),
  }));
  return bootstrap;
}

function createEffectHandlers({ durableStatePort }) {
  return {
    async "durable-state-changed"(effect) {
      await durableStatePort.writeDurableState(effect.durableState);
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
