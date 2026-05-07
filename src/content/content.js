import { createKeyboardGateway } from "./keyboard-gateway.js";

(() => {
  installContentEntrypoint(window).start();
})();

function installContentEntrypoint(windowTarget) {
  const BOOTSTRAP_KEY = "__idOverlayBootstrap__";
  const existingEntrypoint = windowTarget[BOOTSTRAP_KEY];
  if (existingEntrypoint) {
    return existingEntrypoint;
  }

  const keyboardGateway = createKeyboardGateway(windowTarget);
  const entrypoint = Object.freeze({
    start: createBootstrapStarter({ keyboardGateway }),
    keyboardGateway,
  });
  windowTarget[BOOTSTRAP_KEY] = entrypoint;
  return entrypoint;
}

function createBootstrapStarter({ keyboardGateway }) {
  let bootstrapPromise = null;

  return function start() {
    if (bootstrapPromise) {
      return bootstrapPromise;
    }
    const runtime = globalThis.chrome?.runtime ?? globalThis.browser?.runtime;
    if (!runtime?.getURL) {
      console.error("id-overlay: extension runtime unavailable");
      return null;
    }

    bootstrapPromise = import(runtime.getURL("src/content/main.js")).then(
      ({ queueBootstrapIdOverlay }) => queueBootstrapIdOverlay({ keyboardGateway }),
      (error) => {
        bootstrapPromise = null;
        throw error;
      }
    ).catch((error) => {
      console.error("id-overlay: failed to bootstrap", error);
      return null;
    });

    return bootstrapPromise;
  };
}
