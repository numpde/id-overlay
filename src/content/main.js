import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../hex/application/command.js";
import { handleApplicationCommand } from "../../hex/application/handle-command.js";
import { createInitialApplicationState } from "../../hex/application/state.js";
import { selectApplicationView } from "../../hex/application/view-model.js";

const STORAGE_KEY = "id-overlay.durable-state";
const ROOT_ID = "id-overlay-root";

export async function start({
  chrome,
  document,
  location = document.location,
} = {}) {
  if (!isSupportedPage(location)) {
    return null;
  }

  const app = await createContentApp({
    chrome,
    document,
  });
  app.mount();
  return app;
}

async function createContentApp({ chrome, document }) {
  let state = createInitialApplicationState();
  const root = ensureRoot(document);
  const shadow = root.shadowRoot ?? root.attachShadow({ mode: "open" });
  const durableState = await readDurableState({ chrome });
  const pasteListener = (event) => {
    void onPaste(event).catch(reportError);
  };
  applyResult(handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
      durableState,
    }),
  }));

  document.addEventListener("paste", pasteListener, true);

  return {
    mount() {
      render();
    },
    getState() {
      return state;
    },
    dispose() {
      document.removeEventListener("paste", pasteListener, true);
      root.remove();
    },
  };

  async function dispatch(command) {
    const result = handleApplicationCommand({
      state,
      command,
    });
    applyResult(result);
    render();
    await runEffects({
      chrome,
      effects: result.effects,
    });
  }

  function applyResult(result) {
    state = result.state;
  }

  async function onPaste(event) {
    const requestId = state.referenceImageInput?.requestId;
    if (!requestId) {
      return;
    }

    event.preventDefault();
    const outcome = await readPasteOutcome(event);
    await dispatch(createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
      {
        requestId,
        outcome,
      },
    ));
  }

  function render() {
    const view = selectApplicationView(state);
    shadow.replaceChildren(
      styleElement(document),
      panelElement({
        document,
        state,
        view,
        onPrimaryAction: () => {
          dispatchSafely(createApplicationCommand(
            APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
          ));
        },
        onSelectMode: (mode) => {
          dispatchSafely(createApplicationCommand(
            APPLICATION_COMMAND_KIND.SELECT_MODE,
            { mode },
          ));
        },
      }),
      overlayElement({
        document,
        state,
        view,
      }),
    );
  }

  function dispatchSafely(command) {
    void dispatch(command).catch(reportError);
  }
}

function panelElement({
  document,
  state,
  view,
  onPrimaryAction,
  onSelectMode,
}) {
  const panel = document.createElement("section");
  panel.className = "panel";

  const mode = document.createElement("div");
  mode.className = "mode";
  mode.dataset.selectedMode = view.modeSwitch.selected;

  const trace = document.createElement("button");
  trace.className = "modeButton";
  trace.type = "button";
  trace.textContent = "Trace";
  trace.dataset.selected = String(view.modeSwitch.selected === "trace");
  trace.addEventListener("click", () => onSelectMode("trace"));
  mode.append(trace);

  const align = document.createElement("button");
  align.className = "modeButton";
  align.type = "button";
  align.textContent = "Align";
  align.disabled = !view.modeSwitch.align.enabled;
  align.dataset.selected = String(view.modeSwitch.selected === "align");
  align.addEventListener("click", () => onSelectMode("align"));
  mode.append(align);

  const primary = document.createElement("button");
  primary.className = "primary";
  primary.type = "button";
  primary.textContent = primaryActionLabel({ state, view });
  primary.disabled = !view.primaryAction.enabled;
  primary.addEventListener("click", onPrimaryAction);

  const status = document.createElement("div");
  status.className = "status";
  status.textContent = statusText(state);

  panel.append(mode, primary, status);
  return panel;
}

function overlayElement({ document, state, view }) {
  const layer = document.createElement("div");
  layer.className = "overlayLayer";
  layer.dataset.mode = view.mode;
  if (!state.session) {
    return layer;
  }

  const image = document.createElement("img");
  image.className = "overlayImage";
  image.alt = "";
  image.src = state.session.referenceImage.imageDataRef;
  layer.append(image);
  return layer;
}

function primaryActionLabel({ state, view }) {
  if (!state.session) {
    return view.primaryAction.label;
  }
  if (state.panelIntent?.kind === "confirm-clear-reference-image") {
    return "Confirm clear";
  }
  return "Clear image";
}

function statusText(state) {
  if (state.referenceImageInput?.status === "awaiting-paste") {
    return "Paste an image now, or click Cancel paste.";
  }
  if (state.notice?.kind === "reference-image-paste-cancelled") {
    return "Paste cancelled.";
  }
  if (state.notice?.kind === "reference-image-paste-empty") {
    return "No image found in paste.";
  }
  if (state.panelIntent?.kind === "confirm-clear-reference-image") {
    return "Click Confirm clear to remove the image.";
  }
  if (state.session) {
    return `${state.session.referenceImage.intrinsicSizePx.width}x${state.session.referenceImage.intrinsicSizePx.height} image loaded.`;
  }
  return "No image loaded.";
}

async function readPasteOutcome(event) {
  const file = firstImageFile(event.clipboardData);
  if (!file) {
    return {
      kind: "empty",
    };
  }

  try {
    const imageDataRef = await readDataUrl(file);
    const intrinsicSizePx = await readImageSize(imageDataRef);
    return {
      kind: "accepted",
      referenceImage: {
        imageDataRef,
        intrinsicSizePx,
      },
    };
  } catch {
    return {
      kind: "failed",
      reason: "decode-failed",
    };
  }
}

function firstImageFile(clipboardData) {
  for (const item of clipboardData?.items ?? []) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      return item.getAsFile();
    }
  }
  for (const file of clipboardData?.files ?? []) {
    if (file.type.startsWith("image/")) {
      return file;
    }
  }
  return null;
}

function reportError(error) {
  console.error("id-overlay: action failed", error);
}

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function readImageSize(imageDataRef) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    });
    image.addEventListener("error", reject);
    image.src = imageDataRef;
  });
}

async function runEffects({ chrome, effects }) {
  for (const effect of effects) {
    if (effect.kind === "durable-state-changed") {
      await writeDurableState({
        chrome,
        durableState: effect.durableState,
      });
    }
  }
}

async function readDurableState({ chrome }) {
  const storage = chrome?.storage?.local;
  if (!storage) {
    return null;
  }
  const record = await storage.get(STORAGE_KEY);
  return record?.[STORAGE_KEY] ?? null;
}

async function writeDurableState({ chrome, durableState }) {
  const storage = chrome?.storage?.local;
  if (!storage) {
    return;
  }
  await storage.set({
    [STORAGE_KEY]: durableState,
  });
}

function ensureRoot(document) {
  const existing = document.getElementById(ROOT_ID);
  if (existing) {
    return existing;
  }
  const root = document.createElement("div");
  root.id = ROOT_ID;
  document.documentElement.append(root);
  return root;
}

function isSupportedPage(location) {
  return location?.hostname === "www.openstreetmap.org"
    && location.pathname === "/edit";
}

function styleElement(document) {
  const style = document.createElement("style");
  style.textContent = `
    :host {
      all: initial;
      color-scheme: light;
      font-family: ui-sans-serif, system-ui, sans-serif;
    }
    .panel {
      position: fixed;
      z-index: 2147483647;
      top: 16px;
      right: 16px;
      display: grid;
      grid-template-columns: auto minmax(120px, 1fr);
      gap: 8px;
      align-items: center;
      width: 310px;
      padding: 10px;
      border: 1px solid rgba(15, 23, 42, 0.16);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.94);
      box-shadow: 0 18px 44px rgba(15, 23, 42, 0.22);
      backdrop-filter: blur(12px);
    }
    .mode {
      display: inline-grid;
      grid-template-columns: 1fr 1fr;
      padding: 2px;
      border-radius: 999px;
      background: rgba(226, 232, 240, 0.9);
    }
    .modeButton,
    .primary {
      min-height: 32px;
      border: 0;
      border-radius: 999px;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }
    .modeButton {
      padding: 0 10px;
      color: rgb(51, 65, 85);
      background: transparent;
    }
    .modeButton[data-selected="true"] {
      color: white;
      background: rgb(37, 99, 235);
    }
    .modeButton:disabled,
    .primary:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
    .primary {
      color: white;
      background: rgb(15, 23, 42);
    }
    .status {
      grid-column: 1 / -1;
      color: rgb(71, 85, 105);
      font-size: 12px;
      line-height: 1.35;
    }
    .overlayLayer {
      position: fixed;
      z-index: 2147483646;
      inset: 0;
      display: grid;
      place-items: center;
      pointer-events: none;
    }
    .overlayLayer[data-mode="align"] {
      pointer-events: auto;
    }
    .overlayImage {
      max-width: min(80vw, 1200px);
      max-height: 80vh;
      opacity: 0.62;
      transform-origin: center;
      border: 1px solid rgba(15, 23, 42, 0.24);
      box-shadow: 0 18px 60px rgba(15, 23, 42, 0.28);
    }
  `;
  return style;
}
