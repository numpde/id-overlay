import { clampOpacity, resolveOverlayRenderSource } from "../core/transform.js";
import {
  getRegistrationPinCount,
  resolveRegistrationSolveState,
} from "../core/state.js";
import { getModeButtonActionLabel } from "./status-controller.js";
import { formatBuildLabel, createLogger } from "../core/logger.js";

const MANUAL_PASTE_PROMPT = "Press Ctrl/Cmd+V to paste an image from your clipboard.";

export function createPanel({ shadow, store, interactions, statusController }) {
  const logger = createLogger("panel");
  const root = document.createElement("section");
  root.className = "id-overlay-panel";
  root.dataset.idOverlayOwned = "true";

  const heading = document.createElement("h1");
  heading.className = "id-overlay-panel__title";
  heading.textContent = "id-overlay";

  const buildMeta = document.createElement("p");
  buildMeta.className = "id-overlay-panel__meta";
  buildMeta.textContent = formatBuildLabel();

  const controls = document.createElement("div");
  controls.className = "id-overlay-panel__controls";

  const pasteButton = createButton("Paste");
  const modeButton = createButton("Trace");
  const computeButton = createButton("Compute transform");
  const clearPinsButton = createButton("Clear pins");
  const clearButton = createButton("Clear");

  controls.append(pasteButton, modeButton, computeButton, clearPinsButton, clearButton);

  const opacityGroup = document.createElement("label");
  opacityGroup.className = "id-overlay-field";
  const opacityLabel = document.createElement("span");
  opacityLabel.className = "id-overlay-field__label";
  opacityLabel.textContent = "Opacity";
  const opacityInput = document.createElement("input");
  opacityInput.type = "range";
  opacityInput.min = "0";
  opacityInput.max = "1";
  opacityInput.step = "0.01";
  opacityInput.className = "id-overlay-field__slider";
  opacityGroup.append(opacityLabel, opacityInput);

  const summary = document.createElement("dl");
  summary.className = "id-overlay-summary";

  const pinsLabel = document.createElement("dt");
  pinsLabel.textContent = "Pins";
  const pinsValue = document.createElement("dd");

  const transformLabel = document.createElement("dt");
  transformLabel.textContent = "Solve";
  const solveValue = document.createElement("dd");

  const renderLabel = document.createElement("dt");
  renderLabel.textContent = "Render";
  const renderValue = document.createElement("dd");

  summary.append(
    pinsLabel,
    pinsValue,
    transformLabel,
    solveValue,
    renderLabel,
    renderValue,
  );

  const statusElement = document.createElement("p");
  statusElement.className = "id-overlay-panel__status";

  root.append(heading, buildMeta, controls, opacityGroup, summary, statusElement);
  shadow.append(root);

  let latestState = store.getState();
  let latestRuntime = interactions.getRuntimeState();
  let isPasteArmed = false;
  let isPasteListenerAttached = false;

  pasteButton.addEventListener("click", async () => {
    logger.info("Paste requested");
    setPasteArmed(true);
    const didLoad = await tryLoadClipboardImageFromApi();
    if (didLoad) {
      setPasteArmed(false);
    }
  });

  modeButton.addEventListener("click", () => {
    interactions.toggleMode();
  });

  computeButton.addEventListener("click", () => {
    interactions.computeTransform();
  });

  clearPinsButton.addEventListener("click", () => {
    interactions.clearPins();
    logger.info("Cleared pins from panel action");
  });

  opacityInput.addEventListener("input", () => {
    interactions.setOpacity(clampOpacity(Number(opacityInput.value)));
  });

  clearButton.addEventListener("click", () => {
    interactions.clearImage();
    logger.info("Cleared image from panel action");
    statusController.showTransient("Cleared the current screenshot.");
  });

  const unsubscribeStore = store.subscribe((state) => {
    latestState = state;
    renderControls();
  });
  const unsubscribeInteractions = interactions.subscribe((runtime) => {
    latestRuntime = runtime;
    renderControls();
  });
  const unsubscribeStatus = statusController.subscribe(() => {
    renderControls();
  });

  renderControls();

  return {
    destroy() {
      detachPasteListener();
      unsubscribeStore();
      unsubscribeInteractions();
      unsubscribeStatus();
      root.remove();
    },
  };

  function renderControls() {
    pasteButton.textContent = isPasteArmed ? "Paste…" : "Paste";
    opacityInput.value = String(latestState.opacity);
    modeButton.textContent = getModeButtonActionLabel(latestState.mode);
    clearButton.disabled = !latestState.image;
    opacityInput.disabled = !latestState.image;
    computeButton.disabled = !latestRuntime.canComputeTransform;
    clearPinsButton.disabled = getRegistrationPinCount(latestState.registration) === 0;
    pinsValue.textContent = String(getRegistrationPinCount(latestState.registration));
    solveValue.textContent = describeSolveState(latestState.registration);
    renderValue.textContent = describeRenderState(latestState);
    statusElement.textContent = getDisplayedStatusMessage();
  }

  async function handleWindowPaste(event) {
    if (!isPasteArmed) {
      return;
    }

    setPasteArmed(false);
    event.preventDefault();

    const item = [...(event.clipboardData?.items ?? [])].find((candidate) =>
      candidate.type.startsWith("image/"),
    );
    if (!item) {
      logger.warn("Window paste event did not contain an image");
      statusController.showTransient("Clipboard does not contain an image.");
      return;
    }

    const file = item.getAsFile();
    if (!file) {
      logger.warn("Window paste event image could not be converted to a file");
      statusController.showTransient("Clipboard image could not be read.");
      return;
    }

    await loadClipboardImage(file, "window paste event");
  }

  async function tryLoadClipboardImageFromApi() {
    if (typeof navigator?.clipboard?.read !== "function") {
      return false;
    }

    try {
      const clipboardItems = await navigator.clipboard.read();
      const imageType = clipboardItems
        .flatMap((item) => item.types)
        .find((type) => type.startsWith("image/"));

      if (!imageType) {
        logger.warn("Clipboard API read succeeded but no image type was present");
        statusController.showTransient(`Clipboard does not contain an image. ${MANUAL_PASTE_PROMPT}`);
        return false;
      }

      const clipboardItem = clipboardItems.find((item) => item.types.includes(imageType));
      const blob = await clipboardItem.getType(imageType);
      await loadClipboardImage(blob, "Clipboard API");
      return true;
    } catch (error) {
      logger.warn("Clipboard API read failed; falling back to manual paste", {
        message: error?.message ?? String(error),
      });
      return false;
    }
  }

  function setPasteArmed(nextValue) {
    isPasteArmed = nextValue;
    syncPasteListener();
    renderControls();
  }

  function syncPasteListener() {
    if (isPasteArmed && !isPasteListenerAttached) {
      window.addEventListener("paste", handleWindowPaste, true);
      isPasteListenerAttached = true;
      return;
    }
    if (!isPasteArmed && isPasteListenerAttached) {
      detachPasteListener();
    }
  }

  function detachPasteListener() {
    if (!isPasteListenerAttached) {
      return;
    }
    window.removeEventListener("paste", handleWindowPaste, true);
    isPasteListenerAttached = false;
  }

  function getDisplayedStatusMessage() {
    if (isPasteArmed) {
      return MANUAL_PASTE_PROMPT;
    }
    return statusController.getMessage();
  }

  async function loadClipboardImage(source, sourceLabel) {
    const image = await readImageFromClipboard(source);
    interactions.loadImage(image);
    logger.info("Loaded clipboard image", {
      source: sourceLabel,
      width: image.width,
      height: image.height,
    });
    statusController.showTransient(`Loaded screenshot ${image.width}×${image.height}.`);
    return image;
  }
}

function createButton(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "id-overlay-button";
  button.textContent = label;
  return button;
}

function describeSolveState(registration) {
  const solveState = resolveRegistrationSolveState(registration);
  if (solveState.kind === "solved") {
    return `Solved from ${registration.solvedTransform.pinCount ?? solveState.pinCount} pin(s)`;
  }
  if (solveState.kind === "dirty") {
    return "Pins changed; recompute needed";
  }
  if (solveState.kind === "insufficient-pins") {
    return "Collect at least 2 pins";
  }
  return "No pins yet";
}

function describeRenderState(state) {
  const renderSource = resolveOverlayRenderSource(state);
  if (renderSource === "solved") {
    return state.mode === "trace"
      ? "Solved transform active"
      : "Solved transform preview active";
  }
  if (renderSource === "placement") {
    return "Manual placement active";
  }
  return "No image";
}

async function readImageFromClipboard(file) {
  const src = await readBlobAsDataUrl(file);
  const { width, height } = await measureImage(src);
  return {
    src,
    width,
    height,
  };
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

function measureImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    });
    image.addEventListener("error", reject);
    image.src = src;
  });
}
