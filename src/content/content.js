(() => {
  const BOOTSTRAP_KEY = "__idOverlayBootstrap__";
  const existingBootstrap = window[BOOTSTRAP_KEY];
  if (existingBootstrap) {
    existingBootstrap.start();
    return;
  }
  const keyboardGateway = createKeyboardGateway(window);
  const bootstrapRuntime = createBootstrapRuntime({
    keyboardGateway,
  });
  window[BOOTSTRAP_KEY] = bootstrapRuntime;
  bootstrapRuntime.start();
})();

function createBootstrapRuntime({ keyboardGateway }) {
  let bootstrapPromise = null;

  function start() {
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
  }

  return Object.freeze({
    start,
    keyboardGateway,
  });
}

function createKeyboardGateway(windowTarget) {
  const subscribers = new Set();

  function notify(type, event) {
    for (const subscriber of subscribers) {
      subscriber[type]?.(event);
    }
  }

  function handleKeyDown(event) {
    notify("keydown", event);
  }

  function handleKeyUp(event) {
    notify("keyup", event);
  }

  function handleBlur(event) {
    notify("blur", event);
  }

  windowTarget.addEventListener("keydown", handleKeyDown, true);
  windowTarget.addEventListener("keyup", handleKeyUp, true);
  windowTarget.addEventListener("blur", handleBlur);

  return Object.freeze({
    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    },
  });
}
