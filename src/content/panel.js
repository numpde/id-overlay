import { clampOpacity } from "../core/transform.js";
import {
  createBrowserImageNormalizationDeps,
  getOverlayImageLoadStats,
  normalizeOverlayImageBlob,
} from "../core/image-normalization.js";
import {
  PANEL_TITLE,
  describePanelActionPresentation,
  resolvePanelPresentation,
} from "../core/presentation.js";
import {
  PANEL_ACTION_DEFAULTS,
  PANEL_ACTION_EVENT,
  createInitialPanelActionState,
  isPanelActionSessionActive,
  reducePanelActionState,
  resolvePanelActionSemantics,
} from "../core/panel-state.js";
import { hasOverlayImageSession } from "../core/state.js";
import { formatBuildLabel, createLogger } from "../core/logger.js";

const PANEL_MARGIN_PX = 8;

export function createPanel({ shadow, store, interactions, statusController }) {
  const logger = createLogger("panel");
  const imageNormalizationDeps = createBrowserImageNormalizationDeps(window);
  const root = document.createElement("section");
  root.className = "id-overlay-panel";
  root.dataset.idOverlayOwned = "true";

  const header = document.createElement("div");
  header.className = "id-overlay-panel__header";
  header.title = "Drag to move";

  const heading = document.createElement("h1");
  heading.className = "id-overlay-panel__title";
  heading.textContent = PANEL_TITLE;

  const buildMeta = document.createElement("p");
  buildMeta.className = "id-overlay-panel__meta";
  buildMeta.textContent = formatBuildLabel();
  header.append(heading, buildMeta);

  const controls = document.createElement("div");
  controls.className = "id-overlay-panel__controls";

  const pasteButton = createButton("Paste");
  const computeButton = createButton("Compute transform");
  const clearPinsButton = createButton("Clear pins");
  const clearButton = createButton("Clear");
  clearButton.classList.add("id-overlay-panel__clear-button");

  controls.append(pasteButton, computeButton, clearPinsButton);

  const modeSwitch = document.createElement("label");
  modeSwitch.className = "id-overlay-mode-switch";

  const modeAlignLabel = document.createElement("span");
  modeAlignLabel.className = "id-overlay-mode-switch__label";
  modeAlignLabel.textContent = "Align";

  const modeInput = document.createElement("input");
  modeInput.type = "checkbox";
  modeInput.className = "id-overlay-mode-switch__input";

  const modeTrack = document.createElement("span");
  modeTrack.className = "id-overlay-mode-switch__track";
  const modeThumb = document.createElement("span");
  modeThumb.className = "id-overlay-mode-switch__thumb";
  modeTrack.append(modeThumb);

  const modeTraceLabel = document.createElement("span");
  modeTraceLabel.className = "id-overlay-mode-switch__label";
  modeTraceLabel.textContent = "Trace";

  modeSwitch.append(modeAlignLabel, modeInput, modeTrack, modeTraceLabel);

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

  const statusWrap = document.createElement("div");
  statusWrap.className = "id-overlay-panel__status-wrap";

  const statusElement = document.createElement("p");
  statusElement.className = "id-overlay-panel__status";
  statusElement.tabIndex = 0;
  statusWrap.append(statusElement);

  root.append(header, modeSwitch, controls, opacityGroup, clearButton, statusWrap);
  shadow.append(root);

  let latestState = store.getState();
  let latestStatusMessage = statusController.getMessage();
  let isPasteListenerAttached = false;
  let panelPosition = captureInitialPanelPosition();
  let activePanelDrag = null;
  let panelActionState = createInitialPanelActionState();
  let clearConfirmTimer = null;
  applyPanelPosition();
  window.addEventListener("resize", handleWindowResize);

  header.addEventListener("mousedown", handlePanelDragStart);

  pasteButton.addEventListener("click", async () => {
    if (getPanelActionSemantics().pasteArmed) {
      applyPanelAction(PANEL_ACTION_EVENT.CANCEL_PASTE);
      logger.info("Cancelled paste capture");
      statusController.showTransient(describePanelActionPresentation("paste-cancelled"));
      return;
    }

    logger.info("Paste requested");
    const { sessionId } = applyPanelAction(PANEL_ACTION_EVENT.ARM_PASTE);
    const didLoad = await tryLoadClipboardImageFromApi({ sessionId });
    if (didLoad) {
      applyPanelAction(PANEL_ACTION_EVENT.RESET);
    }
  });

  modeInput.addEventListener("change", () => {
    interactions.setMode(modeInput.checked ? "align" : "trace");
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
    if (!hasOverlayImageSession(latestState)) {
      return;
    }
    if (!getPanelActionSemantics().clearConfirming) {
      logger.info("Armed clear image confirmation");
      applyPanelAction(PANEL_ACTION_EVENT.ARM_CLEAR_CONFIRM);
      return;
    }
    applyPanelAction(PANEL_ACTION_EVENT.RESET);
    interactions.clearImage();
    logger.info("Cleared image from panel action");
    statusController.showTransient(describePanelActionPresentation("clear-image"));
  });

  const unsubscribeStore = store.subscribe((state) => {
    latestState = state;
    if (getPanelActionSemantics().shouldReset) {
      applyPanelAction(PANEL_ACTION_EVENT.RESET);
      return;
    }
    renderControls();
  });
  const unsubscribeStatus = statusController.subscribe((message) => {
    latestStatusMessage = message;
    renderControls();
  });

  renderControls();

  return {
    destroy() {
      detachPasteListener();
      endPanelDrag();
      clearClearConfirmTimer();
      window.removeEventListener("resize", handleWindowResize);
      unsubscribeStore();
      unsubscribeStatus();
      root.remove();
    },
  };

  function renderControls() {
    const presentation = resolvePanelPresentation({
      state: latestState,
      statusMessage: latestStatusMessage,
      panelActionState,
    });
    pasteButton.textContent = presentation.pasteLabel;
    opacityInput.value = presentation.opacityValue;
    modeInput.checked = presentation.modeSwitch.checked;
    modeInput.setAttribute("aria-label", presentation.modeSwitch.ariaLabel);
    modeSwitch.dataset.mode = presentation.modeSwitch.label.toLowerCase();
    clearButton.textContent = presentation.clearButtonLabel;
    clearButton.disabled = presentation.clearButtonDisabled;
    clearButton.classList.toggle(
      "id-overlay-button--confirm",
      presentation.clearButtonVariant === "confirm",
    );
    opacityInput.disabled = !presentation.hasImage;
    computeButton.disabled = !presentation.canComputeTransform;
    clearPinsButton.disabled = !presentation.canClearPins;
    clearPinsButton.textContent = presentation.clearPinsLabel;
    statusElement.textContent = presentation.statusMessage;
  }

  function handlePanelDragStart(event) {
    if (event.button !== 0) {
      return;
    }

    const rect = root.getBoundingClientRect();
    panelPosition = {
      left: rect.left,
      top: rect.top,
    };
    activePanelDrag = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    root.classList.add("id-overlay-panel--dragging");
    window.addEventListener("mousemove", handlePanelDragMove, true);
    window.addEventListener("mouseup", handlePanelDragEnd, true);
    event.preventDefault();
  }

  function handlePanelDragMove(event) {
    if (!activePanelDrag) {
      return;
    }

    setPanelPosition({
      left: event.clientX - activePanelDrag.offsetX,
      top: event.clientY - activePanelDrag.offsetY,
    });
    event.preventDefault();
  }

  function handlePanelDragEnd() {
    endPanelDrag();
  }

  function endPanelDrag() {
    if (!activePanelDrag) {
      return;
    }

    activePanelDrag = null;
    root.classList.remove("id-overlay-panel--dragging");
    window.removeEventListener("mousemove", handlePanelDragMove, true);
    window.removeEventListener("mouseup", handlePanelDragEnd, true);
  }

  function handleWindowResize() {
    setPanelPosition(panelPosition);
  }

  async function handleWindowPaste(event) {
    if (!getPanelActionSemantics().pasteArmed) {
      return;
    }

    applyPanelAction(PANEL_ACTION_EVENT.CANCEL_PASTE);
    event.preventDefault();

    const item = [...(event.clipboardData?.items ?? [])].find((candidate) =>
      candidate.type.startsWith("image/"),
    );
    if (!item) {
      logger.warn("Window paste event did not contain an image");
      statusController.showTransient(describePanelActionPresentation("clipboard-missing-image"));
      return;
    }

    const file = item.getAsFile();
    if (!file) {
      logger.warn("Window paste event image could not be converted to a file");
      statusController.showTransient(describePanelActionPresentation("clipboard-image-unreadable"));
      return;
    }

    await loadClipboardImage(file, "window paste event");
  }

  async function tryLoadClipboardImageFromApi({ sessionId }) {
    if (typeof navigator?.clipboard?.read !== "function") {
      return false;
    }

    try {
      const clipboardItems = await navigator.clipboard.read();
      if (!isPanelActionSessionActive(panelActionState, sessionId)) {
        logger.info("Ignoring clipboard API result because paste capture was cancelled");
        return false;
      }
      const imageType = clipboardItems
        .flatMap((item) => item.types)
        .find((type) => type.startsWith("image/"));

      if (!imageType) {
        logger.warn("Clipboard API read succeeded but no image type was present");
        statusController.showTransient(describePanelActionPresentation("clipboard-missing-image-with-prompt"));
        return false;
      }

      const clipboardItem = clipboardItems.find((item) => item.types.includes(imageType));
      const blob = await clipboardItem.getType(imageType);
      if (!isPanelActionSessionActive(panelActionState, sessionId)) {
        logger.info("Ignoring clipboard image because paste capture was cancelled");
        return false;
      }
      await loadClipboardImage(blob, "Clipboard API");
      return true;
    } catch (error) {
      logger.warn("Clipboard API read failed; falling back to manual paste", {
        message: error?.message ?? String(error),
      });
      return false;
    }
  }

  function setPanelActionState(nextState) {
    if (nextState === panelActionState) {
      return;
    }
    panelActionState = nextState;
    syncPanelActionSideEffects();
    renderControls();
  }

  function getPanelActionSemantics() {
    return resolvePanelActionSemantics(panelActionState, {
      ...PANEL_ACTION_DEFAULTS,
      hasImage: hasOverlayImageSession(latestState),
    });
  }

  function setPanelPosition(nextPosition) {
    panelPosition = clampPanelPosition(nextPosition);
    applyPanelPosition();
  }

  function applyPanelPosition() {
    root.style.left = `${panelPosition.left}px`;
    root.style.top = `${panelPosition.top}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
  }

  function captureInitialPanelPosition() {
    const rect = root.getBoundingClientRect();
    return clampPanelPosition({
      left: Number.isFinite(rect.left) ? rect.left : PANEL_MARGIN_PX,
      top: Number.isFinite(rect.top) ? rect.top : PANEL_MARGIN_PX,
    });
  }

  function clampPanelPosition(position) {
    const rect = root.getBoundingClientRect();
    const panelWidth = rect.width || root.offsetWidth || 280;
    const panelHeight = rect.height || root.offsetHeight || 200;
    const maxLeft = Math.max(PANEL_MARGIN_PX, window.innerWidth - panelWidth - PANEL_MARGIN_PX);
    const maxTop = Math.max(PANEL_MARGIN_PX, window.innerHeight - panelHeight - PANEL_MARGIN_PX);
    return {
      left: clampNumber(position.left, PANEL_MARGIN_PX, maxLeft),
      top: clampNumber(position.top, PANEL_MARGIN_PX, maxTop),
    };
  }

  function applyPanelAction(eventType) {
    const nextState = reducePanelActionState(panelActionState, eventType);
    setPanelActionState(nextState);
    return nextState;
  }

  function syncPanelActionSideEffects() {
    const semantics = getPanelActionSemantics();
    syncClearConfirmTimer(semantics);
    syncPasteListener(semantics);
  }

  function syncClearConfirmTimer(semantics) {
    clearClearConfirmTimer();
    const { autoResetTimeoutMs } = semantics;
    if (!autoResetTimeoutMs) {
      return;
    }
    clearConfirmTimer = globalThis.setTimeout(() => {
      clearConfirmTimer = null;
      applyPanelAction(PANEL_ACTION_EVENT.RESET);
    }, autoResetTimeoutMs);
  }

  function syncPasteListener(semantics) {
    const { shouldAttachPasteListener } = semantics;
    if (shouldAttachPasteListener && !isPasteListenerAttached) {
      window.addEventListener("paste", handleWindowPaste, true);
      isPasteListenerAttached = true;
      return;
    }
    if (!shouldAttachPasteListener && isPasteListenerAttached) {
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

  function clearClearConfirmTimer() {
    if (!clearConfirmTimer) {
      return;
    }
    globalThis.clearTimeout(clearConfirmTimer);
    clearConfirmTimer = null;
  }

  async function loadClipboardImage(source, sourceLabel) {
    const image = await normalizeOverlayImageBlob(source, imageNormalizationDeps);
    const imageStats = getOverlayImageLoadStats(image);
    interactions.loadImage(image);
    logger.info("Loaded clipboard image", {
      source: sourceLabel,
      ...imageStats,
    });
    statusController.showTransient(
      describePanelActionPresentation("clipboard-image-loaded", image),
    );
    return image;
  }
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createButton(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "id-overlay-button";
  button.textContent = label;
  return button;
}
