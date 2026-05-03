import { clampOpacity, opacityFromWheelDelta } from "../core/transform.js";
import {
  MACHINE_EVENT_KIND,
  MACHINE_MODE,
} from "../core/machine/events.js";
import {
  selectPanelView,
} from "./panel-view-model.js";
import { formatBuildLabel } from "../core/logger.js";

const PANEL_MARGIN_PX = 8;
const PANEL_FALLBACK_WIDTH_PX = 280;
const PANEL_FALLBACK_HEIGHT_PX = 200;
const PANEL_TITLE = "Reference Overlay";
const PANEL_REPO_URL = "https://github.com/numpde/id-overlay";
const SVG_NS = "http://www.w3.org/2000/svg";

export function createPanel({
  shadow,
  machineHost,
}) {
  // TODO(smell): Panel meaning is view-model-owned, but this DOM shell still
  // mixes element construction, event binding, render patching, and panel drag.
  // Extract wiring/render mechanics before adding more panel controls.
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

  const mainActionButton = createButton("");
  mainActionButton.classList.add("id-overlay-panel__main-action-button");

  const controlsRow = document.createElement("div");
  controlsRow.className = "id-overlay-panel__controls-row";

  const undoButton = createButton("↶");
  undoButton.classList.add("id-overlay-panel__history-button");

  const redoButton = createButton("↷");
  redoButton.classList.add("id-overlay-panel__history-button");

  const historyActions = document.createElement("div");
  historyActions.className = "id-overlay-panel__history-actions";
  historyActions.append(undoButton, redoButton);

  const modeSwitch = document.createElement("label");
  modeSwitch.className = "id-overlay-mode-switch";

  const modeInput = document.createElement("input");
  modeInput.type = "checkbox";
  modeInput.className = "id-overlay-mode-switch__input";

  const modeTrack = document.createElement("span");
  modeTrack.className = "id-overlay-mode-switch__track";
  const modeThumb = document.createElement("span");
  modeThumb.className = "id-overlay-mode-switch__thumb";
  modeTrack.append(modeThumb);

  modeSwitch.append(modeInput, modeTrack);

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

  controlsRow.append(mainActionButton, historyActions, modeSwitch);

  root.append(header, controlsRow, opacityGroup, statusWrap);
  shadow.append(root);

  let panelPosition = captureInitialPanelPosition();
  let activePanelDrag = null;
  applyPanelPosition();
  window.addEventListener("resize", handleWindowResize);

  header.addEventListener("mousedown", handlePanelDragStart);

  modeInput.addEventListener("change", () => {
    if (modeInput.disabled) {
      return;
    }
    dispatchMachineEvent({
      type: MACHINE_EVENT_KIND.SELECT_MODE,
      mode: modeInput.checked ? MACHINE_MODE.TRACE : MACHINE_MODE.ALIGN,
    });
  });
  modeSwitch.addEventListener("wheel", (event) => {
    if (modeInput.disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dispatchMachineEvent({
      type: MACHINE_EVENT_KIND.SELECT_MODE,
      mode: event.deltaY < 0 ? MACHINE_MODE.ALIGN : MACHINE_MODE.TRACE,
    });
  }, { passive: false });

  opacityInput.addEventListener("input", () => {
    dispatchMachineEvent({
      type: MACHINE_EVENT_KIND.SET_OPACITY,
      opacity: clampOpacity(Number(opacityInput.value)),
    });
  });
  opacityInput.addEventListener("wheel", (event) => {
    if (opacityInput.disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dispatchMachineEvent({
      type: MACHINE_EVENT_KIND.SET_OPACITY,
      opacity: opacityFromWheelDelta(Number(opacityInput.value), event.deltaY),
    });
  }, { passive: false });

  mainActionButton.addEventListener("click", () => {
    void handleMainActionClick();
  });
  undoButton.addEventListener("click", () => {
    if (undoButton.disabled) {
      return;
    }
    dispatchMachineEvent({ type: MACHINE_EVENT_KIND.UNDO });
  });
  redoButton.addEventListener("click", () => {
    if (redoButton.disabled) {
      return;
    }
    dispatchMachineEvent({ type: MACHINE_EVENT_KIND.REDO });
  });

  const unsubscribeMachine = machineHost.subscribe((state) => {
    applyPanelView(selectPanelView(state));
  }, { emitCurrent: false });

  applyPanelView(selectPanelView(machineHost.getState()));

  return {
    destroy() {
      endPanelDrag();
      window.removeEventListener("resize", handleWindowResize);
      unsubscribeMachine();
      root.remove();
    },
  };

  function handleMainActionClick() {
    const action = selectPanelView(machineHost.getState()).mainAction;
    if (action.disabled || !action.event) {
      return;
    }
    dispatchMachineEvent(action.event);
  }

  function dispatchMachineEvent(event) {
    return machineHost.dispatch(event);
  }

  function applyPanelView(panelView) {
    opacityInput.value = panelView.opacityControl.value;
    opacityInput.disabled = panelView.opacityControl.disabled;
    modeInput.checked = panelView.modeSwitch.checked;
    modeInput.disabled = panelView.modeSwitch.disabled;
    modeInput.setAttribute("aria-label", panelView.modeSwitch.accessibleLabel);
    modeSwitch.dataset.mode = panelView.modeSwitch.mode;
    mainActionButton.textContent = panelView.mainAction.label;
    mainActionButton.disabled = panelView.mainAction.disabled;
    mainActionButton.classList.toggle(
      "id-overlay-button--confirm",
      panelView.mainAction.presentationKind === "confirm",
    );
    applyHistoryButtonPresentation(undoButton, panelView.historyControls.undo);
    applyHistoryButtonPresentation(redoButton, panelView.historyControls.redo);
    statusElement.textContent = panelView.status;
    statusDetailSurface.textContent = panelView.status;
  }

  function applyHistoryButtonPresentation(button, presentation) {
    button.disabled = presentation.disabled;
    button.title = presentation.title;
    button.setAttribute("aria-label", presentation.accessibleLabel);
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
    const panelWidth = rect.width || root.offsetWidth || readCssPixelVariable(
      root,
      "--id-overlay-panel-width",
      PANEL_FALLBACK_WIDTH_PX,
    );
    const panelHeight = rect.height || root.offsetHeight || PANEL_FALLBACK_HEIGHT_PX;
    const maxLeft = Math.max(PANEL_MARGIN_PX, window.innerWidth - panelWidth - PANEL_MARGIN_PX);
    const maxTop = Math.max(PANEL_MARGIN_PX, window.innerHeight - panelHeight - PANEL_MARGIN_PX);
    return {
      left: clampNumber(position.left, PANEL_MARGIN_PX, maxLeft),
      top: clampNumber(position.top, PANEL_MARGIN_PX, maxTop),
    };
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

function readCssPixelVariable(element, name, fallbackValue) {
  const value = Number.parseFloat(
    window.getComputedStyle(element).getPropertyValue(name),
  );
  return Number.isFinite(value) ? value : fallbackValue;
}

function createButton(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "id-overlay-button";
  button.textContent = label;
  return button;
}
