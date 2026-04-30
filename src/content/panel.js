import { clampOpacity, opacityFromWheelDelta } from "../core/transform.js";
import {
  createBrowserImageNormalizationDeps,
  getOverlayImageLoadStats,
  normalizeOverlayImageBlob,
} from "../core/image-normalization.js";
import {
  PANEL_FEEDBACK_ACTION,
  PANEL_REPO_URL,
  PANEL_TITLE,
  describePanelActionPresentation,
  resolvePanelViewModel,
} from "../core/presentation.js";
import {
  PANEL_ACTION_DEFAULTS,
  createInitialPanelActionState,
  isPanelActionSessionActive,
} from "../core/panel-state.js";
import { UI_EVENT_KIND } from "../core/ui-event-model.js";
import { UI_PANEL_INTENT_KIND } from "../core/ui-state-model.js";
import {
  runUiLiveEffects,
} from "../core/ui-live-effect-runner.js";
import {
  syncPanelActionStateToUiIntent,
} from "../core/ui-live-state.js";
import {
  UI_LIVE_FEEDBACK_KIND,
  transitionLiveUi,
} from "../core/ui-live-transition.js";
import { INTERACTION_MODE, normalizeInteractionMode } from "../core/interaction-mode.js";
import { formatBuildLabel, createLogger } from "../core/logger.js";

const PANEL_MARGIN_PX = 8;
const SVG_NS = "http://www.w3.org/2000/svg";

export function createPanel({ shadow, store, interactions, statusController }) {
  const logger = createLogger("panel");
  const imageNormalizationDeps = createBrowserImageNormalizationDeps(window);
  const root = document.createElement("section");
  root.className = "id-overlay-panel";
  root.dataset.idOverlayOwned = "true";

  const header = document.createElement("div");
  header.className = "id-overlay-panel__header";
  header.title = "Drag to move";

  const titleRow = document.createElement("div");
  titleRow.className = "id-overlay-panel__title-row";

  const heading = document.createElement("h1");
  heading.className = "id-overlay-panel__title";
  heading.textContent = PANEL_TITLE;

  const repoLink = document.createElement("a");
  repoLink.className = "id-overlay-panel__repo-link";
  repoLink.href = PANEL_REPO_URL;
  repoLink.target = "_blank";
  repoLink.rel = "noopener noreferrer";
  repoLink.setAttribute("aria-label", "Open id-overlay on GitHub");
  repoLink.title = "GitHub";
  repoLink.append(createGithubIcon());
  repoLink.addEventListener("mousedown", (event) => {
    event.stopPropagation();
  });

  const buildMeta = document.createElement("p");
  buildMeta.className = "id-overlay-panel__meta";
  buildMeta.textContent = formatBuildLabel();
  titleRow.append(heading, repoLink);
  header.append(titleRow, buildMeta);

  const controls = document.createElement("div");
  controls.className = "id-overlay-panel__controls";

  const pasteButton = createButton("Paste");
  const clearPinsButton = createButton("Clear pins");
  const clearButton = createButton("Clear");
  clearButton.classList.add("id-overlay-panel__clear-button");

  controls.append(pasteButton, clearPinsButton);

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

  const statusDetail = document.createElement("div");
  statusDetail.className = "id-overlay-panel__status-detail";

  const statusDetailSurface = document.createElement("div");
  statusDetailSurface.className = "id-overlay-panel__status-detail-surface";
  statusDetail.append(statusDetailSurface);

  statusWrap.append(statusElement, statusDetail);

  root.append(header, modeSwitch, controls, opacityGroup, clearButton, statusWrap);
  shadow.append(root);

  let latestState = store.getState();
  let latestStatusMessage = statusController.getMessage();
  let isPasteListenerAttached = false;
  let panelPosition = captureInitialPanelPosition();
  let activePanelDrag = null;
  let panelActionState = createInitialPanelActionState();
  let latestPanelViewModel = null;
  let clearConfirmTimer = null;
  applyPanelPosition();
  window.addEventListener("resize", handleWindowResize);

  header.addEventListener("mousedown", handlePanelDragStart);

  pasteButton.addEventListener("click", async () => {
    await handlePasteActionClick();
  });

  modeInput.addEventListener("change", () => {
    applyModeSelection(
      modeInput.checked ? INTERACTION_MODE.ALIGN : INTERACTION_MODE.TRACE,
    );
  });
  modeSwitch.addEventListener("wheel", (event) => {
    event.preventDefault();
    event.stopPropagation();
    applyModeSelection(
      event.deltaY < 0 ? INTERACTION_MODE.ALIGN : INTERACTION_MODE.TRACE,
    );
  }, { passive: false });

  clearPinsButton.addEventListener("click", () => {
    interactions.clearPins();
    logger.info("Cleared pins from panel action");
  });

  opacityInput.addEventListener("input", () => {
    interactions.setOpacity(clampOpacity(Number(opacityInput.value)));
  });
  opacityInput.addEventListener("wheel", (event) => {
    if (opacityInput.disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nextOpacity = opacityFromWheelDelta(Number(opacityInput.value), event.deltaY);
    interactions.setOpacity(nextOpacity);
  }, { passive: false });

  clearButton.addEventListener("click", async () => {
    await dispatchCanonicalUiEvent({
      kind: UI_EVENT_KIND.MAIN_ACTION_TRIGGERED,
    });
  });

  const unsubscribeStore = store.subscribe((state) => {
    latestState = state;
    const panelViewModel = resolveCurrentPanelViewModel();
    if (panelViewModel.actionSemantics.shouldReset) {
      setPanelActionState(
        syncPanelActionStateToUiIntent({
          previousPanelActionState: panelActionState,
          nextIntent: UI_PANEL_INTENT_KIND.IDLE,
        }),
      );
      return;
    }
    applyPanelViewModel(panelViewModel);
  });
  const unsubscribeStatus = statusController.subscribe((message) => {
    latestStatusMessage = message;
    applyPanelViewModel(resolveCurrentPanelViewModel());
  });

  applyPanelViewModel(resolveCurrentPanelViewModel());

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

  function resolveCurrentPanelViewModel() {
    return resolvePanelViewModel({
      state: latestState,
      statusMessage: latestStatusMessage,
      panelActionState,
    });
  }

  function applyPanelViewModel(panelViewModel) {
    latestPanelViewModel = panelViewModel;
    const { presentation } = panelViewModel;
    pasteButton.textContent = presentation.pasteLabel;
    pasteButton.disabled = !presentation.canPasteImage;
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
    clearPinsButton.disabled = !presentation.canClearPins;
    clearPinsButton.textContent = presentation.clearPinsLabel;
    statusElement.textContent = presentation.statusMessage;
    statusDetailSurface.textContent = presentation.statusMessage;
  }

  function applyModeSelection(mode) {
    dispatchCanonicalUiEvent({
      kind: UI_EVENT_KIND.MODE_SELECTED,
      mode: normalizeInteractionMode(mode),
    });
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

  async function handlePasteActionClick() {
    if (getPanelActionSemantics().pasteArmed) {
      const cancelPromise = dispatchCanonicalUiEvent({
        kind: UI_EVENT_KIND.PASTE_CANCELLED,
      });
      logger.info("Cancelled paste capture");
      statusController.showTransient(describePanelActionPresentation(PANEL_FEEDBACK_ACTION.PASTE_CANCELLED));
      await cancelPromise;
      return;
    }

    await dispatchCanonicalUiEvent({
      kind: UI_EVENT_KIND.MAIN_ACTION_TRIGGERED,
    });
  }

  async function handleWindowPaste(event) {
    if (!getPanelActionSemantics().pasteArmed) {
      return;
    }

    event.preventDefault();
    await dispatchCanonicalUiEvent({
      kind: UI_EVENT_KIND.PASTE_CANCELLED,
    });

    const item = [...(event.clipboardData?.items ?? [])].find((candidate) =>
      candidate.type.startsWith("image/"),
    );
    if (!item) {
      logger.warn("Window paste event did not contain an image");
      statusController.showTransient(describePanelActionPresentation(PANEL_FEEDBACK_ACTION.CLIPBOARD_MISSING_IMAGE));
      return;
    }

    const file = item.getAsFile();
    if (!file) {
      logger.warn("Window paste event image could not be converted to a file");
      statusController.showTransient(describePanelActionPresentation(PANEL_FEEDBACK_ACTION.CLIPBOARD_IMAGE_UNREADABLE));
      return;
    }

    await loadClipboardImage(file, "window paste event");
  }

  async function tryLoadClipboardImageFromApi({ sessionId }) {
    if (typeof navigator?.clipboard?.read !== "function") {
      return null;
    }

    try {
      const clipboardItems = await navigator.clipboard.read();
      if (!isPanelActionSessionActive(panelActionState, sessionId)) {
        logger.info("Ignoring clipboard API result because paste capture was cancelled");
        return null;
      }
      const imageType = clipboardItems
        .flatMap((item) => item.types)
        .find((type) => type.startsWith("image/"));

      if (!imageType) {
        logger.warn("Clipboard API read succeeded but no image type was present");
        statusController.showTransient(describePanelActionPresentation(PANEL_FEEDBACK_ACTION.CLIPBOARD_MISSING_IMAGE_WITH_PROMPT));
        return null;
      }

      const clipboardItem = clipboardItems.find((item) => item.types.includes(imageType));
      const blob = await clipboardItem.getType(imageType);
      if (!isPanelActionSessionActive(panelActionState, sessionId)) {
        logger.info("Ignoring clipboard image because paste capture was cancelled");
        return null;
      }
      return loadClipboardImage(blob, "Clipboard API");
    } catch (error) {
      logger.warn("Clipboard API read failed; falling back to manual paste", {
        message: error?.message ?? String(error),
      });
      return null;
    }
  }

  function setPanelActionState(nextState) {
    if (nextState === panelActionState) {
      return;
    }
    panelActionState = nextState;
    const panelViewModel = resolveCurrentPanelViewModel();
    syncPanelActionSideEffects(panelViewModel.actionSemantics);
    applyPanelViewModel(panelViewModel);
  }

  function getPanelActionSemantics() {
    return latestPanelViewModel?.actionSemantics ?? resolveCurrentPanelViewModel().actionSemantics;
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

  function syncPanelActionSideEffects(semantics = getPanelActionSemantics()) {
    if (!semantics.clearConfirming) {
      clearClearConfirmTimer();
    }
    syncPasteListener(semantics);
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
      describePanelActionPresentation(PANEL_FEEDBACK_ACTION.CLIPBOARD_IMAGE_LOADED, image),
    );
    return image;
  }

  async function dispatchCanonicalUiEvent(event) {
    const liveTransition = transitionLiveUi({
      state: latestState,
      panelActionState,
      event,
    });
    await applyCanonicalUiTransition({
      event,
      liveTransition,
    });
    return liveTransition.transitionResult;
  }

  async function applyCanonicalUiTransition({
    event,
    liveTransition,
  }) {
    const {
      transitionResult,
      nextPanelActionState,
      modeExecution,
      feedbackKind,
    } = liveTransition;

    setPanelActionState(nextPanelActionState);

    if (modeExecution) {
      interactions.applyResolvedModeTransition(modeExecution);
    }

    if (feedbackKind === UI_LIVE_FEEDBACK_KIND.PASTE_CANCELLED) {
      logger.info("Cancelled paste capture");
      statusController.showTransient(
        describePanelActionPresentation(PANEL_FEEDBACK_ACTION.PASTE_CANCELLED),
      );
    }

    await runCanonicalUiEffects(transitionResult.effects, nextPanelActionState);
  }

  async function runCanonicalUiEffects(effects, nextPanelActionState) {
    await runUiLiveEffects(effects, {
      requestPasteInput: async () => {
        logger.info("Paste requested");
        const image = await tryLoadClipboardImageFromApi({
          sessionId: nextPanelActionState.sessionId,
        });
        if (image) {
          await dispatchCanonicalUiEvent({
            kind: UI_EVENT_KIND.PASTE_SUCCEEDED,
            image,
            placement: null,
          });
        }
      },
      clearPins: async () => {
        logger.info("Cleared pins from canonical destructive action");
        interactions.clearPins();
      },
      clearImage: async () => {
        logger.info("Cleared image from canonical destructive action");
        interactions.clearImage();
        statusController.showTransient(
          describePanelActionPresentation(PANEL_FEEDBACK_ACTION.CLEAR_IMAGE),
        );
      },
      startPanelTimeout: async () => {
        clearClearConfirmTimer();
        clearConfirmTimer = globalThis.setTimeout(() => {
          clearConfirmTimer = null;
          void dispatchCanonicalUiEvent({
            kind: UI_EVENT_KIND.PANEL_TIMEOUT_ELAPSED,
          });
        }, PANEL_ACTION_DEFAULTS.clearConfirmationTimeoutMs);
      },
      cancelPanelTimeout: async () => {
        clearClearConfirmTimer();
      },
    });
  }
}

function createGithubIcon() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("id-overlay-panel__repo-icon");

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute(
    "d",
    "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .22.15.47.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z",
  );
  path.setAttribute("fill", "currentColor");
  svg.append(path);

  return svg;
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
