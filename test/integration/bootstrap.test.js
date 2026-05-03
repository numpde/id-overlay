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
    env.document.getElementById("map").getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
    });

    await import(`${repoFileUrl("src/content/main.js")}?t=${Date.now()}`);
    const { bootstrapIdOverlay } = await import(`${repoFileUrl("src/content/main.js")}?b=${Date.now()}`);
    await bootstrapIdOverlay();

    const host = env.document.getElementById("id-overlay-root");
    assert.ok(host);
    assert.ok(host.shadowRoot);
    assert.equal(host.shadowRoot.querySelectorAll(".id-overlay-panel").length, 1);
    assert.equal(host.shadowRoot.querySelectorAll(".id-overlay-viewport").length, 0);
    assert.equal(host.shadowRoot.querySelector(".id-overlay-panel__title").textContent, "Reference Overlay");
    const repoLink = host.shadowRoot.querySelector(".id-overlay-panel__repo-link");
    assert.ok(repoLink);
    assert.equal(repoLink.getAttribute("href"), "https://github.com/numpde/id-overlay");
    assert.equal(repoLink.getAttribute("aria-label"), "Open id-overlay on GitHub");
    assert.ok(repoLink.querySelector(".id-overlay-panel__repo-icon"));
    assert.equal(host.shadowRoot.querySelectorAll('link[data-id-overlay-styles="true"]').length, 1);
    assert.equal(host.shadowRoot.querySelector(".id-overlay-panel__meta").textContent.includes("built"), true);
    const statusElement = host.shadowRoot.querySelector(".id-overlay-panel__status");
    assert.equal(statusElement.title, "");
    assert.equal(env.document.querySelectorAll(".id-overlay-viewport").length, 1);
    const image = env.document.querySelector(".id-overlay-image");
    const frame = env.document.querySelector(".id-overlay-frame");
    assert.equal(image.style.display, "block");
    assert.equal(frame.style.display, "block");
    assert.ok(Number.parseFloat(image.style.width) > 0);
    assert.ok(Number.parseFloat(frame.style.width) > 0);
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
    assert.equal(env.document.querySelectorAll(".id-overlay-viewport").length, 1);
  } finally {
    beforeUnloadTracker.restore();
    env.cleanup();
  }
});

test("panel header can drag the panel out of the way", async () => {
  const env = createDomEnvironment();

  try {
    const { bootstrapIdOverlay } = await import(`${repoFileUrl("src/content/main.js")}?drag=${Date.now()}`);
    await bootstrapIdOverlay();

    const shadow = env.document.getElementById("id-overlay-root").shadowRoot;
    const panel = shadow.querySelector(".id-overlay-panel");
    const header = shadow.querySelector(".id-overlay-panel__header");
    panel.getBoundingClientRect = () => ({
      left: 728,
      top: 16,
      width: 280,
      height: 220,
      right: 1008,
      bottom: 236,
      x: 728,
      y: 16,
      toJSON() {
        return this;
      },
    });

    header.dispatchEvent(new env.window.MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 760,
      clientY: 40,
    }));
    env.window.dispatchEvent(new env.window.MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      clientX: 620,
      clientY: 110,
    }));

    assert.equal(panel.style.left, "588px");
    assert.equal(panel.style.top, "86px");
    assert.equal(panel.classList.contains("id-overlay-panel--dragging"), true);

    env.window.dispatchEvent(new env.window.MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      clientX: 620,
      clientY: 110,
    }));

    assert.equal(panel.classList.contains("id-overlay-panel--dragging"), false);
  } finally {
    env.cleanup();
  }
});

test("stored align mode restores an overlay frame that owns hit-testing", async () => {
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

    const overlay = env.document.querySelector(".id-overlay-viewport");
    const frame = overlay.querySelector(".id-overlay-frame");
    assert.equal(frame.style.pointerEvents, "auto");
    assert.equal(overlay.dataset.mode, "align");
  } finally {
    env.cleanup();
  }
});

test("trace mode hides registration pins and disables registration controls", async () => {
  const env = createDomEnvironment({
    storageState: {
      "id-overlay/state": {
        mode: "trace",
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
          pins: [
            { id: 1, imagePx: { x: 20, y: 40 }, mapLatLon: { lat: 0, lon: 0 } },
            { id: 2, imagePx: { x: 80, y: 120 }, mapLatLon: { lat: 1, lon: 1 } },
          ],
          solvedTransform: null,
          dirty: false,
        },
      },
    },
  });

  try {
    const { bootstrapIdOverlay } = await import(`${repoFileUrl("src/content/main.js")}?tracecontrols=${Date.now()}`);
    await bootstrapIdOverlay();

    const shadow = env.document.getElementById("id-overlay-root").shadowRoot;
    const mainActionButton = shadow.querySelector(".id-overlay-panel__main-action-button");
    const controlsRow = shadow.querySelector(".id-overlay-panel__controls-row");
    const modeSwitch = shadow.querySelector(".id-overlay-mode-switch");
    const historyActions = shadow.querySelector(".id-overlay-panel__history-actions");
    const historyButtons = [...shadow.querySelectorAll(".id-overlay-panel__history-button")];
    assert.equal(mainActionButton.textContent, "Clear image");
    assert.equal(mainActionButton.disabled, false);
    assert.deepEqual([...controlsRow.children], [mainActionButton, historyActions, modeSwitch]);
    assert.equal(historyButtons.length, 2);
    assert.equal(controlsRow.contains(historyButtons[0]), true);
    assert.equal(controlsRow.contains(historyButtons[1]), true);
    assert.equal(historyButtons[0].textContent, "↶");
    assert.equal(historyButtons[0].getAttribute("aria-label"), "Undo");
    assert.equal(historyButtons[0].title, "");
    assert.equal(historyButtons[0].disabled, true);
    assert.equal(historyButtons[1].textContent, "↷");
    assert.equal(historyButtons[1].getAttribute("aria-label"), "Redo");
    assert.equal(historyButtons[1].title, "");
    assert.equal(historyButtons[1].disabled, true);
    assert.equal(env.document.querySelectorAll(".id-overlay-pin").length, 0);
    assert.equal(env.document.querySelectorAll(".id-overlay-map-pin").length, 0);
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

test("main action button arms window-level image paste capture", async () => {
  const env = createDomEnvironment({
    storageState: {
      "id-overlay/state": {
        mode: "align",
        opacity: 0.6,
        image: null,
        registration: {
          pins: [],
          solvedTransform: null,
          dirty: false,
        },
      },
    },
  });
  installImageReadStubs(env.window);

  try {
    const { bootstrapIdOverlay } = await import(`${repoFileUrl("src/content/main.js")}?p=${Date.now()}`);
    await bootstrapIdOverlay();

    const shadow = env.document.getElementById("id-overlay-root").shadowRoot;
    const mainActionButton = shadow.querySelector(".id-overlay-panel__main-action-button");
    mainActionButton.click();

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

    const image = env.document.querySelector(".id-overlay-image");
    assert.equal(image.style.display, "block");
    assert.equal(image.style.width, "640px");
    assert.equal(image.style.height, "320px");
  } finally {
    env.cleanup();
  }
});

test("main action button loads directly from navigator.clipboard.read when available", async () => {
  const env = createDomEnvironment({
    storageState: {
      "id-overlay/state": {
        mode: "align",
        opacity: 0.6,
        image: null,
        registration: {
          pins: [],
          solvedTransform: null,
          dirty: false,
        },
      },
    },
  });
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
    const mainActionButton = shadow.querySelector(".id-overlay-panel__main-action-button");
    mainActionButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const image = env.document.querySelector(".id-overlay-image");
    assert.equal(image.style.display, "block");
    assert.equal(image.style.width, "640px");
    assert.equal(shadow.querySelector(".id-overlay-panel__status").textContent.includes("Loaded screenshot"), true);
  } finally {
    env.cleanup();
  }
});

test("main action button drives the canonical paste flow when no image is present", async () => {
  const env = createDomEnvironment({
    storageState: {
      "id-overlay/state": {
        mode: "trace",
        opacity: 0.6,
        image: null,
        registration: {
          pins: [],
          solvedTransform: null,
          dirty: false,
        },
      },
    },
  });
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
    const { bootstrapIdOverlay } = await import(`${repoFileUrl("src/content/main.js")}?mainpaste=${Date.now()}`);
    await bootstrapIdOverlay();

    const shadow = env.document.getElementById("id-overlay-root").shadowRoot;
    const mainActionButton = shadow.querySelector(".id-overlay-panel__main-action-button");
    const undoButton = shadow.querySelectorAll(".id-overlay-panel__history-button")[0];
    const redoButton = shadow.querySelectorAll(".id-overlay-panel__history-button")[1];
    const modeInput = shadow.querySelector(".id-overlay-mode-switch__input");
    const image = env.document.querySelector(".id-overlay-image");

    assert.equal(mainActionButton.textContent, "Paste");
    assert.equal(mainActionButton.disabled, false);
    assert.equal(undoButton.disabled, true);
    assert.equal(redoButton.disabled, true);
    assert.equal(undoButton.title, "");
    assert.equal(redoButton.title, "");
    assert.equal(modeInput.disabled, true);

    mainActionButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(image.style.display, "block");
    assert.equal(image.style.width, "640px");
    assert.equal(mainActionButton.textContent, "Clear image");
    assert.equal(undoButton.disabled, false);
    assert.equal(undoButton.title, "Remove image");
    assert.equal(undoButton.getAttribute("aria-label"), "Remove image");
    assert.equal(redoButton.disabled, true);
    assert.equal(redoButton.title, "");
    assert.equal(redoButton.getAttribute("aria-label"), "Redo");
    assert.equal(modeInput.disabled, false);
  } finally {
    env.cleanup();
  }
});

test("panel undo and redo restore committed session state and reset confirmation intent", async () => {
  const env = createDomEnvironment({
    storageState: {
      "id-overlay/state": {
        mode: "trace",
        opacity: 0.6,
        image: null,
        registration: {
          pins: [],
          solvedTransform: null,
          dirty: false,
        },
      },
    },
  });
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
    const { bootstrapIdOverlay } = await import(`${repoFileUrl("src/content/main.js")}?undoredo=${Date.now()}`);
    await bootstrapIdOverlay();

    const shadow = env.document.getElementById("id-overlay-root").shadowRoot;
    const mainActionButton = shadow.querySelector(".id-overlay-panel__main-action-button");
    const [undoButton, redoButton] = shadow.querySelectorAll(".id-overlay-panel__history-button");
    const status = shadow.querySelector(".id-overlay-panel__status");
    const image = env.document.querySelector(".id-overlay-image");

    assert.equal(mainActionButton.textContent, "Paste");
    assert.equal(undoButton.disabled, true);
    assert.equal(redoButton.disabled, true);
    assert.equal(undoButton.title, "");
    assert.equal(redoButton.title, "");

    mainActionButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(mainActionButton.textContent, "Clear image");
    assert.equal(undoButton.disabled, false);
    assert.equal(undoButton.title, "Remove image");
    assert.equal(undoButton.getAttribute("aria-label"), "Remove image");
    assert.equal(redoButton.title, "");
    assert.equal(redoButton.getAttribute("aria-label"), "Redo");

    mainActionButton.click();
    assert.equal(mainActionButton.textContent, "Clear image?");

    undoButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(image.style.display, "none");
    assert.equal(mainActionButton.textContent, "Paste");
    assert.equal(mainActionButton.classList.contains("id-overlay-button--confirm"), false);
    assert.equal(status.textContent, "Undid: Remove image.");
    assert.equal(undoButton.disabled, true);
    assert.equal(redoButton.disabled, false);
    assert.equal(undoButton.title, "");
    assert.equal(redoButton.title, "Reload image");
    assert.equal(undoButton.getAttribute("aria-label"), "Undo");
    assert.equal(redoButton.getAttribute("aria-label"), "Reload image");

    redoButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(image.style.display, "block");
    assert.equal(mainActionButton.textContent, "Clear image");
    assert.equal(status.textContent, "Redid: Reload image.");
    assert.equal(undoButton.disabled, false);
    assert.equal(redoButton.disabled, true);
    assert.equal(undoButton.title, "Remove image");
    assert.equal(redoButton.title, "");
    assert.equal(undoButton.getAttribute("aria-label"), "Remove image");
    assert.equal(redoButton.getAttribute("aria-label"), "Redo");
  } finally {
    env.cleanup();
  }
});

test("clicking main-action Paste… again cancels canonical paste capture and ignores a later clipboard result", async () => {
  const env = createDomEnvironment({
    storageState: {
      "id-overlay/state": {
        mode: "align",
        opacity: 0.6,
        image: null,
        registration: {
          pins: [],
          solvedTransform: null,
          dirty: false,
        },
      },
    },
  });
  installImageReadStubs(env.window);
  let resolveClipboardRead;
  env.window.navigator.clipboard = {
    read() {
      return new Promise((resolve) => {
        resolveClipboardRead = resolve;
      });
    },
  };

  try {
    const { bootstrapIdOverlay } = await import(`${repoFileUrl("src/content/main.js")}?mainpcancel=${Date.now()}`);
    await bootstrapIdOverlay();

    const shadow = env.document.getElementById("id-overlay-root").shadowRoot;
    const mainActionButton = shadow.querySelector(".id-overlay-panel__main-action-button");
    const status = shadow.querySelector(".id-overlay-panel__status");
    const image = env.document.querySelector(".id-overlay-image");

    mainActionButton.click();
    assert.equal(mainActionButton.textContent, "Paste…");

    mainActionButton.click();
    assert.equal(mainActionButton.textContent, "Paste");
    assert.equal(status.textContent, "Paste cancelled.");

    resolveClipboardRead([
      {
        types: ["image/png"],
        async getType() {
          return { name: "clipboard-image.png" };
        },
      },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(image.style.display, "none");
    assert.equal(mainActionButton.textContent, "Paste");
  } finally {
    env.cleanup();
  }
});

test("main action button escalates from clear-image confirmation when no pins exist and resets after its timeout", async () => {
  const env = createDomEnvironment({
    storageState: {
      "id-overlay/state": {
        mode: "align",
        opacity: 0.6,
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
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let scheduledTimeout = null;

  globalThis.setTimeout = (callback) => {
    scheduledTimeout = callback;
    return 1;
  };
  globalThis.clearTimeout = () => {};

  try {
    const { bootstrapIdOverlay } = await import(`${repoFileUrl("src/content/main.js")}?clear=${Date.now()}`);
    await bootstrapIdOverlay();

    const shadow = env.document.getElementById("id-overlay-root").shadowRoot;
    const mainActionButton = [...shadow.querySelectorAll(".id-overlay-button")].find(
      (button) => button.textContent === "Clear image"
    );
    const status = shadow.querySelector(".id-overlay-panel__status");
    const image = env.document.querySelector(".id-overlay-image");

    mainActionButton.click();

    assert.equal(mainActionButton.textContent, "Clear image?");
    assert.equal(mainActionButton.classList.contains("id-overlay-button--confirm"), true);
    assert.equal(
      status.textContent,
      "Click Clear image? again to remove the current screenshot, placement, and pins.",
    );
    assert.equal(image.style.display, "block");

    scheduledTimeout?.();

    assert.equal(mainActionButton.textContent, "Clear image");
    assert.equal(mainActionButton.classList.contains("id-overlay-button--confirm"), false);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    env.cleanup();
  }
});

test("main action button clears pins first, then escalates to clear image", async () => {
  const env = createDomEnvironment({
    storageState: {
      "id-overlay/state": {
        mode: "align",
        opacity: 0.6,
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
          pins: [
            { id: 1, imagePx: { x: 10, y: 20 }, mapLatLon: { lat: 1, lon: 2 } },
          ],
          solvedTransform: null,
          dirty: false,
        },
      },
    },
  });

  try {
    const { bootstrapIdOverlay } = await import(`${repoFileUrl("src/content/main.js")}?clear2=${Date.now()}`);
    await bootstrapIdOverlay();

    const shadow = env.document.getElementById("id-overlay-root").shadowRoot;
    const mainActionButton = shadow.querySelector(".id-overlay-panel__main-action-button");
    const [undoButton, redoButton] = shadow.querySelectorAll(".id-overlay-panel__history-button");
    const image = env.document.querySelector(".id-overlay-image");
    mainActionButton.click();
    assert.equal(image.style.display, "block");
    assert.equal(mainActionButton.textContent, "Clear pins?");

    mainActionButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(mainActionButton.textContent, "Clear image");
    assert.equal(image.style.display, "block");
    assert.equal(undoButton.title, "Restore pins");

    mainActionButton.click();
    assert.equal(mainActionButton.textContent, "Clear image?");

    mainActionButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(image.style.display, "none");
    assert.equal(undoButton.title, "Reload image");

    undoButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(image.style.display, "block");
    assert.equal(redoButton.title, "Clear image");
  } finally {
    env.cleanup();
  }
});

test("scrolling the opacity slider adjusts overlay opacity through the existing slider path", async () => {
  const env = createDomEnvironment({
    storageState: {
      "id-overlay/state": {
        mode: "align",
        opacity: 0.6,
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
    const { bootstrapIdOverlay } = await import(`${repoFileUrl("src/content/main.js")}?opacitywheel=${Date.now()}`);
    await bootstrapIdOverlay();

    const shadow = env.document.getElementById("id-overlay-root").shadowRoot;
    const opacityInput = shadow.querySelector(".id-overlay-field__slider");
    const image = env.document.querySelector(".id-overlay-image");

    assert.equal(opacityInput.value, "0.6");
    assert.equal(image.style.opacity, "0.6");

    opacityInput.dispatchEvent(new env.window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(opacityInput.value, "0.7");
    assert.equal(image.style.opacity, "0.7");
  } finally {
    env.cleanup();
  }
});

test("scrolling the mode switch selects align on wheel-up and trace on wheel-down", async () => {
  const env = createDomEnvironment({
    storageState: {
      "id-overlay/state": {
        mode: "trace",
        opacity: 0.6,
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
    const { bootstrapIdOverlay } = await import(`${repoFileUrl("src/content/main.js")}?modewheel=${Date.now()}`);
    await bootstrapIdOverlay();

    const shadow = env.document.getElementById("id-overlay-root").shadowRoot;
    const modeSwitch = shadow.querySelector(".id-overlay-mode-switch");
    const modeInput = shadow.querySelector(".id-overlay-mode-switch__input");
    const overlay = env.document.querySelector(".id-overlay-viewport");

    assert.equal(shadow.querySelectorAll(".id-overlay-mode-switch__label").length, 0);
    assert.equal(modeInput.checked, true);
    assert.equal(modeInput.getAttribute("aria-label"), "Mode: Trace");
    assert.equal(overlay.dataset.mode, "trace");

    modeSwitch.dispatchEvent(new env.window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(modeInput.checked, false);
    assert.equal(modeInput.getAttribute("aria-label"), "Mode: Align");
    assert.equal(overlay.dataset.mode, "align");

    modeSwitch.dispatchEvent(new env.window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 100,
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(modeInput.checked, true);
    assert.equal(overlay.dataset.mode, "trace");
  } finally {
    env.cleanup();
  }
});

test("mode switch stays disabled while no image session is present", async () => {
  const env = createDomEnvironment({
    storageState: {
      "id-overlay/state": {
        mode: "trace",
        opacity: 0.6,
        image: null,
        registration: {
          pins: [],
          solvedTransform: null,
          dirty: false,
        },
      },
    },
  });

  try {
    const { bootstrapIdOverlay } = await import(`${repoFileUrl("src/content/main.js")}?modewheel-empty=${Date.now()}`);
    await bootstrapIdOverlay();

    const shadow = env.document.getElementById("id-overlay-root").shadowRoot;
    const modeSwitch = shadow.querySelector(".id-overlay-mode-switch");
    const modeInput = shadow.querySelector(".id-overlay-mode-switch__input");

    assert.equal(modeInput.checked, true);
    assert.equal(modeInput.disabled, true);

    modeSwitch.dispatchEvent(new env.window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(modeInput.checked, true);
    assert.equal(modeInput.disabled, true);
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
