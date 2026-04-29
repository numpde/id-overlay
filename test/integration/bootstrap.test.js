import test from "node:test";
import assert from "node:assert/strict";

import { createDomEnvironment } from "../helpers/dom-env.js";
import { repoFileUrl } from "../helpers/paths.js";
import { createPlacementTransform } from "../../src/core/transform.js";

function createStoredPlacement({ width, height, scale, rotationRad }) {
  return createPlacementTransform({
    image: { width, height },
    centerMapLatLon: { lat: 0, lon: 0 },
    scale,
    rotationRad,
    zoom: 0,
  });
}

test("bootstrap injects one host, one panel, and one overlay into supported pages", async () => {
  const env = createDomEnvironment({
    storageState: {
      "id-overlay/state": {
        mode: "trace",
        opacity: 0.4,
        image: {
          src: "data:image/png;base64,abc",
          width: 800,
          height: 400,
        },
        placement: createStoredPlacement({
          width: 800,
          height: 400,
          scale: 1.25,
          rotationRad: 0.5,
        }),
        registration: {
          pins: [],
          solvedTransform: null,
          dirty: false,
        },
      },
    },
  });

  try {
    await import(`${repoFileUrl("src/content/main.js")}?t=${Date.now()}`);
    const { bootstrapIdOverlay } = await import(`${repoFileUrl("src/content/main.js")}?b=${Date.now()}`);
    await bootstrapIdOverlay();

    const host = env.document.getElementById("id-overlay-root");
    assert.ok(host);
    assert.ok(host.shadowRoot);
    assert.equal(host.shadowRoot.querySelectorAll(".id-overlay-panel").length, 1);
    assert.equal(host.shadowRoot.querySelectorAll(".id-overlay-viewport").length, 1);
    assert.equal(host.shadowRoot.querySelectorAll('link[data-id-overlay-styles="true"]').length, 1);
    assert.equal(host.shadowRoot.querySelector(".id-overlay-panel__meta").textContent.includes("built"), true);
    const image = host.shadowRoot.querySelector(".id-overlay-image");
    assert.equal(image.style.display, "block");
    assert.ok(Number.parseFloat(image.style.width) > 0);
  } finally {
    env.cleanup();
  }
});

test("bootstrap clears previously owned nodes on reinjection", async () => {
  const env = createDomEnvironment();
  const beforeUnloadTracker = trackWindowEventListenerCount(env.window, "beforeunload");

  try {
    const { bootstrapIdOverlay } = await import(`${repoFileUrl("src/content/main.js")}?r=${Date.now()}`);
    await bootstrapIdOverlay();
    assert.equal(beforeUnloadTracker.activeCount(), 1);
    await bootstrapIdOverlay();
    assert.equal(beforeUnloadTracker.activeCount(), 1);

    const host = env.document.getElementById("id-overlay-root");
    assert.equal(host.shadowRoot.querySelectorAll(".id-overlay-panel").length, 1);
    assert.equal(host.shadowRoot.querySelectorAll(".id-overlay-viewport").length, 1);
  } finally {
    beforeUnloadTracker.restore();
    env.cleanup();
  }
});

test("stored align mode restores an interactive overlay", async () => {
  const env = createDomEnvironment({
    storageState: {
      "id-overlay/state": {
        mode: "align",
        opacity: 0.5,
        image: {
          src: "data:image/png;base64,abc",
          width: 400,
          height: 200,
        },
        placement: createStoredPlacement({
          width: 400,
          height: 200,
          scale: 1,
          rotationRad: 0,
        }),
        registration: {
          pins: [],
          solvedTransform: null,
          dirty: false,
        },
      },
    },
  });

  try {
    const { bootstrapIdOverlay } = await import(`${repoFileUrl("src/content/main.js")}?m=${Date.now()}`);
    await bootstrapIdOverlay();

    const overlay = env.document
      .getElementById("id-overlay-root")
      .shadowRoot.querySelector(".id-overlay-viewport");
    assert.equal(overlay.classList.contains("id-overlay-viewport--interactive"), true);
    assert.equal(overlay.dataset.mode, "align");
  } finally {
    env.cleanup();
  }
});

test("content entrypoint bootstraps only once", async () => {
  const env = createDomEnvironment();

  try {
    await import(`${repoFileUrl("src/content/content.js")}?c=${Date.now()}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await import(`${repoFileUrl("src/content/content.js")}?c2=${Date.now()}`);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const host = env.document.getElementById("id-overlay-root");
    assert.ok(host);
    assert.equal(host.shadowRoot.querySelectorAll(".id-overlay-panel").length, 1);
  } finally {
    env.cleanup();
  }
});

test("content entrypoint can retry bootstrap after an initial module load failure", async () => {
  const env = createDomEnvironment();
  const originalGetURL = globalThis.chrome.runtime.getURL;
  const originalConsoleError = console.error;
  const consoleErrors = [];

  console.error = (...args) => {
    consoleErrors.push(args);
  };

  try {
    globalThis.chrome.runtime.getURL = () => "chrome-extension://invalid/src/content/main.js";
    await import(`${repoFileUrl("src/content/content.js")}?cf=${Date.now()}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(env.document.getElementById("id-overlay-root"), null);

    globalThis.chrome.runtime.getURL = originalGetURL;
    await import(`${repoFileUrl("src/content/content.js")}?cf2=${Date.now()}`);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const host = env.document.getElementById("id-overlay-root");
    assert.ok(host);
    assert.ok(consoleErrors.length >= 1);
  } finally {
    console.error = originalConsoleError;
    globalThis.chrome.runtime.getURL = originalGetURL;
    env.cleanup();
  }
});

test("queued bootstrap waits for DOMContentLoaded when the document is still loading", async () => {
  const env = createDomEnvironment();
  const readyStateDescriptor = Object.getOwnPropertyDescriptor(env.document, "readyState");

  try {
    Object.defineProperty(env.document, "readyState", {
      configurable: true,
      get() {
        return "loading";
      },
    });

    const { queueBootstrapIdOverlay } = await import(`${repoFileUrl("src/content/main.js")}?q=${Date.now()}`);
    queueBootstrapIdOverlay();
    assert.equal(env.document.getElementById("id-overlay-root"), null);

    Object.defineProperty(env.document, "readyState", {
      configurable: true,
      get() {
        return "interactive";
      },
    });
    env.document.dispatchEvent(new env.window.Event("DOMContentLoaded"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const host = env.document.getElementById("id-overlay-root");
    assert.ok(host);
    assert.ok(host.shadowRoot);
  } finally {
    if (readyStateDescriptor) {
      Object.defineProperty(env.document, "readyState", readyStateDescriptor);
    }
    env.cleanup();
  }
});

test("unsupported pages do not inject the extension UI", async () => {
  const env = createDomEnvironment({
    url: "https://www.openstreetmap.org/",
  });

  try {
    const { bootstrapIdOverlay } = await import(`${repoFileUrl("src/content/main.js")}?u=${Date.now()}`);
    await bootstrapIdOverlay();
    assert.equal(env.document.getElementById("id-overlay-root"), null);
  } finally {
    env.cleanup();
  }
});

test("paste button arms window-level image paste capture", async () => {
  const env = createDomEnvironment();
  installImageReadStubs(env.window);

  try {
    const { bootstrapIdOverlay } = await import(`${repoFileUrl("src/content/main.js")}?p=${Date.now()}`);
    await bootstrapIdOverlay();

    const shadow = env.document.getElementById("id-overlay-root").shadowRoot;
    const pasteButton = [...shadow.querySelectorAll(".id-overlay-button")].find(
      (button) => button.textContent === "Paste"
    );
    pasteButton.click();

    const pasteEvent = new env.window.Event("paste", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(pasteEvent, "clipboardData", {
      configurable: true,
      value: {
        items: [
          {
            type: "image/png",
            getAsFile() {
              return { name: "clipboard-image.png" };
            },
          },
        ],
      },
    });

    env.window.dispatchEvent(pasteEvent);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const image = shadow.querySelector(".id-overlay-image");
    assert.equal(image.style.display, "block");
    assert.equal(image.style.width, "640px");
    assert.equal(image.style.height, "320px");
  } finally {
    env.cleanup();
  }
});

test("paste button loads directly from navigator.clipboard.read when available", async () => {
  const env = createDomEnvironment();
  installImageReadStubs(env.window);
  env.window.navigator.clipboard = {
    async read() {
      return [
        {
          types: ["image/png"],
          async getType() {
            return { name: "clipboard-image.png" };
          },
        },
      ];
    },
  };

  try {
    const { bootstrapIdOverlay } = await import(`${repoFileUrl("src/content/main.js")}?pc=${Date.now()}`);
    await bootstrapIdOverlay();

    const shadow = env.document.getElementById("id-overlay-root").shadowRoot;
    const pasteButton = [...shadow.querySelectorAll(".id-overlay-button")].find(
      (button) => button.textContent === "Paste"
    );
    pasteButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const image = shadow.querySelector(".id-overlay-image");
    assert.equal(image.style.display, "block");
    assert.equal(image.style.width, "640px");
    assert.equal(shadow.querySelector(".id-overlay-panel__status").textContent.includes("Loaded screenshot"), true);
  } finally {
    env.cleanup();
  }
});

function installImageReadStubs(window) {
  class StubFileReader {
    constructor() {
      this.listeners = new Map();
      this.result = "data:image/png;base64,stub";
      this.error = null;
    }

    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }

    readAsDataURL() {
      queueMicrotask(() => {
        this.listeners.get("load")?.();
      });
    }
  }

  class StubImage {
    constructor() {
      this.listeners = new Map();
      this.naturalWidth = 640;
      this.naturalHeight = 320;
    }

    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }

    set src(value) {
      this._src = value;
      queueMicrotask(() => {
        this.listeners.get("load")?.();
      });
    }

    get src() {
      return this._src;
    }
  }

  window.FileReader = StubFileReader;
  window.Image = StubImage;
  globalThis.FileReader = StubFileReader;
  globalThis.Image = StubImage;
}

function trackWindowEventListenerCount(window, eventType) {
  const originalAdd = window.addEventListener.bind(window);
  const originalRemove = window.removeEventListener.bind(window);
  const activeListeners = new Set();

  window.addEventListener = function patchedAdd(type, listener, options) {
    if (type === eventType) {
      activeListeners.add(listener);
    }
    return originalAdd(type, listener, options);
  };

  window.removeEventListener = function patchedRemove(type, listener, options) {
    if (type === eventType) {
      activeListeners.delete(listener);
    }
    return originalRemove(type, listener, options);
  };

  return {
    activeCount() {
      return activeListeners.size;
    },
    restore() {
      window.addEventListener = originalAdd;
      window.removeEventListener = originalRemove;
    },
  };
}
