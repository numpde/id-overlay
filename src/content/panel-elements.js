import { formatBuildLabel } from "../core/logger.js";

const PANEL_TITLE = "Reference Overlay";
const PANEL_REPO_URL = "https://github.com/numpde/id-overlay";
const SVG_NS = "http://www.w3.org/2000/svg";

export function createPanelElements({
  ownerDocument = document,
  buildLabel = formatBuildLabel(),
} = {}) {
  const root = ownerDocument.createElement("section");
  root.className = "id-overlay-panel";
  root.dataset.idOverlayOwned = "true";

  const header = ownerDocument.createElement("div");
  header.className = "id-overlay-panel__header";
  header.title = "Drag to move";

  const titleRow = ownerDocument.createElement("div");
  titleRow.className = "id-overlay-panel__title-row";

  const heading = ownerDocument.createElement("h1");
  heading.className = "id-overlay-panel__title";
  heading.textContent = PANEL_TITLE;

  const repoLink = ownerDocument.createElement("a");
  repoLink.className = "id-overlay-panel__repo-link";
  repoLink.href = PANEL_REPO_URL;
  repoLink.target = "_blank";
  repoLink.rel = "noopener noreferrer";
  repoLink.setAttribute("aria-label", "Open id-overlay on GitHub");
  repoLink.title = "GitHub";
  repoLink.append(createGithubIcon(ownerDocument));

  const buildMeta = ownerDocument.createElement("p");
  buildMeta.className = "id-overlay-panel__meta";
  buildMeta.textContent = buildLabel;
  titleRow.append(heading, repoLink);
  header.append(titleRow, buildMeta);

  const mainActionButton = createButton(ownerDocument, "");
  mainActionButton.classList.add("id-overlay-panel__main-action-button");

  const controlsRow = ownerDocument.createElement("div");
  controlsRow.className = "id-overlay-panel__controls-row";

  const undoButton = createButton(ownerDocument, "↶");
  undoButton.classList.add("id-overlay-panel__history-button");

  const redoButton = createButton(ownerDocument, "↷");
  redoButton.classList.add("id-overlay-panel__history-button");

  const historyActions = ownerDocument.createElement("div");
  historyActions.className = "id-overlay-panel__history-actions";
  historyActions.append(undoButton, redoButton);

  const modeSwitch = ownerDocument.createElement("label");
  modeSwitch.className = "id-overlay-mode-switch";

  const modeInput = ownerDocument.createElement("input");
  modeInput.type = "checkbox";
  modeInput.className = "id-overlay-mode-switch__input";

  const modeTrack = ownerDocument.createElement("span");
  modeTrack.className = "id-overlay-mode-switch__track";
  const modeThumb = ownerDocument.createElement("span");
  modeThumb.className = "id-overlay-mode-switch__thumb";
  modeTrack.append(modeThumb);
  modeSwitch.append(modeInput, modeTrack);

  const opacityGroup = ownerDocument.createElement("label");
  opacityGroup.className = "id-overlay-field";
  const opacityLabel = ownerDocument.createElement("span");
  opacityLabel.className = "id-overlay-field__label";
  opacityLabel.textContent = "Opacity";
  const opacityInput = ownerDocument.createElement("input");
  opacityInput.type = "range";
  opacityInput.min = "0";
  opacityInput.max = "1";
  opacityInput.step = "0.01";
  opacityInput.className = "id-overlay-field__slider";
  opacityGroup.append(opacityLabel, opacityInput);

  const statusWrap = ownerDocument.createElement("div");
  statusWrap.className = "id-overlay-panel__status-wrap";

  const statusElement = ownerDocument.createElement("p");
  statusElement.className = "id-overlay-panel__status";
  statusElement.tabIndex = 0;

  const statusDetail = ownerDocument.createElement("div");
  statusDetail.className = "id-overlay-panel__status-detail";

  const statusDetailSurface = ownerDocument.createElement("div");
  statusDetailSurface.className = "id-overlay-panel__status-detail-surface";
  statusDetail.append(statusDetailSurface);
  statusWrap.append(statusElement, statusDetail);

  controlsRow.append(mainActionButton, historyActions, modeSwitch);
  root.append(header, controlsRow, opacityGroup, statusWrap);

  return {
    root,
    header,
    repoLink,
    opacityInput,
    modeInput,
    modeSwitch,
    mainActionButton,
    undoButton,
    redoButton,
    statusElement,
    statusDetailSurface,
  };
}

function createGithubIcon(ownerDocument) {
  const svg = ownerDocument.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("id-overlay-panel__repo-icon");

  const path = ownerDocument.createElementNS(SVG_NS, "path");
  path.setAttribute(
    "d",
    "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .22.15.47.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z",
  );
  path.setAttribute("fill", "currentColor");
  svg.append(path);

  return svg;
}

function createButton(ownerDocument, label) {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.className = "id-overlay-button";
  button.textContent = label;
  return button;
}
