import { JSDOM } from "jsdom";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function createDomEnvironment({ url, storageState = {}, viewportHtml = '<div id="map"></div>' } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>${viewportHtml}</body></html>`, {
    url: url ?? "https://www.openstreetmap.org/edit",
    pretendToBeVisual: true,
  });

  const { window } = dom;
  const previousGlobals = captureGlobals([
    "window",
    "document",
    "navigator",
    "Image",
    "FileReader",
    "HTMLElement",
    "HTMLLinkElement",
    "Event",
    "MouseEvent",
    "CustomEvent",
    "Node",
    "ResizeObserver",
    "MutationObserver",
    "chrome",
  ]);

  setGlobalValue("window", window);
  setGlobalValue("document", window.document);
  setGlobalValue("navigator", window.navigator);
  setGlobalValue("Image", window.Image);
  setGlobalValue("FileReader", window.FileReader);
  setGlobalValue("HTMLElement", window.HTMLElement);
  setGlobalValue("HTMLLinkElement", window.HTMLLinkElement);
  setGlobalValue("Event", window.Event);
  setGlobalValue("MouseEvent", window.MouseEvent);
  setGlobalValue("CustomEvent", window.CustomEvent);
  setGlobalValue("Node", window.Node);
  setGlobalValue("MutationObserver", window.MutationObserver);

  class StubResizeObserver {
    constructor(callback) {
      this.callback = callback;
    }

    observe() {}

    unobserve() {}

    disconnect() {}
  }

  setGlobalValue("ResizeObserver", StubResizeObserver);

  const storage = { ...storageState };
  setGlobalValue("chrome", {
    runtime: {
      getURL(relativePath) {
        return pathToFileURL(path.join(process.cwd(), relativePath)).href;
      },
      lastError: null,
    },
    storage: {
      local: {
        get(key, callback) {
          callback({ [key]: storage[key] ?? null });
        },
        set(record, callback) {
          Object.assign(storage, record);
          callback?.();
        },
      },
    },
  });

  const restoreLinkLoading = patchLinkLoading(window);

  return {
    window,
    document: window.document,
    storage,
    cleanup() {
      restoreLinkLoading();
      dom.window.close();
      restoreGlobals(previousGlobals);
    },
  };
}

function patchLinkLoading(window) {
  const restorers = [
    patchAppend(window.Element.prototype, window),
    patchAppend(window.DocumentFragment.prototype, window),
    patchAppend(window.ShadowRoot.prototype, window),
  ];
  return () => {
    for (const restore of restorers) {
      restore();
    }
  };
}

function patchAppend(prototype, window) {
  const originalAppend = prototype.append;
  prototype.append = function patchedAppend(...nodes) {
    const result = originalAppend.apply(this, nodes);
    for (const node of nodes) {
      if (node instanceof window.HTMLLinkElement && node.rel === "stylesheet") {
        queueMicrotask(() => {
          node.dispatchEvent(new window.Event("load"));
        });
      }
    }
    return result;
  };
  return () => {
    prototype.append = originalAppend;
  };
}

function captureGlobals(keys) {
  return new Map(keys.map((key) => [key, globalThis[key]]));
}

function restoreGlobals(previousGlobals) {
  for (const [key, value] of previousGlobals.entries()) {
    if (value === undefined) {
      delete globalThis[key];
      continue;
    }
    setGlobalValue(key, value);
  }
}

function setGlobalValue(key, value) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}
