(() => {
  installContentEntrypoint(window).start();
})();

function installContentEntrypoint(windowTarget) {
  // TODO(smell): The entrypoint installs global keyboard capture before the
  // lazy bootstrap module loads. Keep early capture, but move gateway lifecycle
  // ownership into bootstrap so reinjection/teardown is handled in one place.
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
