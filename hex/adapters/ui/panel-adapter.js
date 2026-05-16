import {
  domEventPayload,
} from "./event-debug-log.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export function createPanelAdapter({
  document,
  emitCommand = () => {},
  writePanelPosition = () => {},
  eventDebugLogger = null,
}) {
  return {
    render(view) {
      const root = document.createElement("section");
      root.className = "id-overlay-panel";
      root.dataset.idOverlayOwned = "true";

      const header = document.createElement("div");
      header.className = "id-overlay-panel__header";
      header.title = "Drag to move";
      const titleRow = document.createElement("div");
      titleRow.className = "id-overlay-panel__title-row";
      const title = document.createElement("h1");
      title.className = "id-overlay-panel__title";
      title.textContent = "Reference Overlay";
      const repoLink = document.createElement("a");
      repoLink.className = "id-overlay-panel__repo-link";
      repoLink.href = "https://github.com/numpde/id-overlay";
      repoLink.target = "_blank";
      repoLink.rel = "noopener noreferrer";
      repoLink.title = "GitHub";
      repoLink.setAttribute("aria-label", "Open id-overlay on GitHub");
      repoLink.append(createGithubIcon(document));
      const buildMeta = document.createElement("p");
      buildMeta.className = "id-overlay-panel__meta";
      titleRow.append(title, repoLink);
      header.append(titleRow, buildMeta);
      root.append(header);

      const primary = button({
        document,
        control: "primary",
        label: view.primaryAction.label,
        enabled: view.primaryAction.enabled,
        ariaLabel: view.primaryAction.label,
        eventDebugLogger,
        onClick: () => emitCommand({
          kind: "activate-primary-action",
        }),
      });

      const controlsRow = document.createElement("div");
      controlsRow.className = "id-overlay-panel__controls-row";
      controlsRow.append(primary);

      const historyActions = document.createElement("div");
      historyActions.className = "id-overlay-panel__history-actions";

      const modeSwitch = document.createElement("label");
      modeSwitch.className = "id-overlay-mode-switch";
      modeSwitch.dataset.control = "mode-switch";
      modeSwitch.dataset.mode = view.modeSwitch.selected;
      modeSwitch.setAttribute("aria-label", `Mode switch: ${view.modeSwitch.selected === "trace" ? "Trace" : "Align"}`);
      modeSwitch.addEventListener("wheel", (event) => {
        eventDebugLogger?.log("panel.handler", "mode-wheel", domEventPayload(event));
        if (!view.modeSwitch.align?.enabled && !view.modeSwitch.trace?.enabled) {
          eventDebugLogger?.log("panel.command", "mode-wheel-ignored", {
            reason: "disabled",
          });
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        emitCommand({
          kind: "select-mode",
          mode: event.deltaY < 0 ? "align" : "trace",
        });
        eventDebugLogger?.log("panel.command", "mode-wheel-commit", {
          mode: event.deltaY < 0 ? "align" : "trace",
        });
      });
      const modeInput = document.createElement("input");
      modeInput.type = "checkbox";
      modeInput.className = "id-overlay-mode-switch__input";
      modeInput.checked = view.modeSwitch.selected === "align";
      modeInput.disabled = !view.modeSwitch.align?.enabled && !view.modeSwitch.trace?.enabled;
      modeInput.setAttribute("aria-label", `Mode: ${view.modeSwitch.selected === "trace" ? "Trace" : "Align"}`);
      modeInput.addEventListener("change", () => {
        if (modeInput.disabled) {
          return;
        }
        modeInput.setAttribute("aria-label", `Mode: ${modeInput.checked ? "Align" : "Trace"}`);
        emitCommand({
          kind: "select-mode",
          mode: modeInput.checked ? "align" : "trace",
        });
        eventDebugLogger?.log("panel.command", "mode-switch-change-commit", {
          mode: modeInput.checked ? "align" : "trace",
        });
      });
      const modeTrack = document.createElement("span");
      modeTrack.className = "id-overlay-mode-switch__track";
      const modeThumb = document.createElement("span");
      modeThumb.className = "id-overlay-mode-switch__thumb";
      modeTrack.append(modeThumb);
      modeSwitch.append(modeInput, modeTrack);
      controlsRow.append(modeSwitch);

      historyActions.append(button({
        document,
        control: "undo",
        label: "↶",
        enabled: view.history.undo.enabled,
        title: view.history.undo.label,
        ariaLabel: view.history.undo.label ?? "Undo",
        eventDebugLogger,
        onClick: () => emitCommand({
          kind: "undo",
        }),
      }));
      historyActions.append(button({
        document,
        control: "redo",
        label: "↷",
        enabled: view.history.redo.enabled,
        title: view.history.redo.label,
        ariaLabel: view.history.redo.label ?? "Redo",
        eventDebugLogger,
        onClick: () => emitCommand({
          kind: "redo",
        }),
      }));
      controlsRow.append(historyActions);
      root.append(controlsRow);

      const opacityGroup = document.createElement("label");
      opacityGroup.className = "id-overlay-field";
      const opacityLabel = document.createElement("span");
      opacityLabel.className = "id-overlay-field__label";
      opacityLabel.textContent = "Opacity";
      const opacity = document.createElement("input");
      opacity.dataset.control = "opacity";
      opacity.type = "range";
      opacity.className = "id-overlay-field__slider";
      opacity.min = String(view.opacityControl?.min ?? 0);
      opacity.max = String(view.opacityControl?.max ?? 1);
      opacity.step = "0.01";
      opacity.value = String(view.opacityControl?.value ?? 1);
      opacity.disabled = !(view.opacityControl?.enabled ?? false);
      opacity.addEventListener("wheel", (event) => {
        eventDebugLogger?.log("panel.handler", "opacity-wheel", domEventPayload(event));
        if (opacity.disabled) {
          eventDebugLogger?.log("panel.command", "opacity-wheel-ignored", {
            reason: "disabled",
          });
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const step = Number(view.opacityControl?.step ?? opacity.step);
        const nextOpacity = clamp(
          Number(opacity.value) + (event.deltaY < 0 ? step : -step),
          Number(opacity.min),
          Number(opacity.max),
        );
        opacity.value = String(nextOpacity);
        emitCommand({
          kind: "set-opacity",
          opacity: nextOpacity,
        });
        eventDebugLogger?.log("panel.command", "opacity-wheel-commit", {
          opacity: nextOpacity,
        });
      });
      opacityGroup.append(opacityLabel, opacity);
      root.append(opacityGroup);

      const statusWrap = document.createElement("div");
      statusWrap.className = "id-overlay-panel__status-wrap";
      const status = document.createElement("p");
      status.className = "id-overlay-panel__status";
      status.dataset.region = "status";
      status.tabIndex = 0;
      status.textContent = view.status;
      const statusDetail = document.createElement("div");
      statusDetail.className = "id-overlay-panel__status-detail";
      const statusDetailSurface = document.createElement("div");
      statusDetailSurface.className = "id-overlay-panel__status-detail-surface";
      statusDetailSurface.textContent = view.status;
      statusDetail.append(statusDetailSurface);
      statusWrap.append(status, statusDetail);
      root.append(statusWrap);
      bindPanelDrag({
        root,
        handle: header,
        ownerWindow: document.defaultView,
        writePanelPosition,
        eventDebugLogger,
      });

      return root;
    },
  };
}

function bindPanelDrag({
  root,
  handle,
  ownerWindow,
  writePanelPosition,
  eventDebugLogger,
}) {
  const dragEvents = typeof ownerWindow?.PointerEvent === "function"
    ? {
        start: "pointerdown",
        move: "pointermove",
        end: "pointerup",
        cancel: "pointercancel",
      }
    : {
        start: "mousedown",
        move: "mousemove",
        end: "mouseup",
        cancel: null,
      };
  let activeDrag = null;

  handle.addEventListener(dragEvents.start, handleStart);

  function handleStart(event) {
    if (activeDrag || !isPrimaryDragEvent(event) || isPanelDragExcluded(event.target)) {
      return;
    }
    const rect = root.getBoundingClientRect();
    activeDrag = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      panelSizePx: {
        width: rect.width,
        height: rect.height,
      },
    };
    root.classList.add("id-overlay-panel--dragging");
    ownerWindow?.addEventListener(dragEvents.move, handleMove, true);
    ownerWindow?.addEventListener(dragEvents.end, handleEnd, true);
    if (dragEvents.cancel) {
      ownerWindow?.addEventListener(dragEvents.cancel, handleEnd, true);
    }
    event.preventDefault();
    eventDebugLogger?.log("panel.handler", "drag-start", domEventPayload(event));
  }

  function handleMove(event) {
    if (!activeDrag) {
      return;
    }
    event.preventDefault();
    const position = {
      requestedScreenPx: {
        x: event.clientX - activeDrag.offsetX,
        y: event.clientY - activeDrag.offsetY,
      },
      panelSizePx: activeDrag.panelSizePx,
      viewportPx: {
        width: ownerWindow?.innerWidth ?? 0,
        height: ownerWindow?.innerHeight ?? 0,
      },
    };
    writePanelPosition(position);
    eventDebugLogger?.log("panel.command", "drag-position", {
      requestedScreenPx: position.requestedScreenPx,
      panelSizePx: position.panelSizePx,
      viewportPx: position.viewportPx,
    });
  }

  function handleEnd(event) {
    if (!activeDrag) {
      return;
    }
    activeDrag = null;
    root.classList.remove("id-overlay-panel--dragging");
    ownerWindow?.removeEventListener(dragEvents.move, handleMove, true);
    ownerWindow?.removeEventListener(dragEvents.end, handleEnd, true);
    if (dragEvents.cancel) {
      ownerWindow?.removeEventListener(dragEvents.cancel, handleEnd, true);
    }
    eventDebugLogger?.log("panel.handler", "drag-end", event ? domEventPayload(event) : {});
  }
}

function isPrimaryDragEvent(event) {
  return event.button === 0 && event.isPrimary !== false;
}

function isPanelDragExcluded(target) {
  return Boolean(target?.closest?.([
    "a",
    "button",
    "input",
    "select",
    "textarea",
    "summary",
    "[contenteditable]",
    "[data-id-overlay-panel-drag-excluded=\"true\"]",
  ].join(",")));
}

function createGithubIcon(document) {
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

function button({
  document,
  control,
  label,
  enabled,
  title = null,
  ariaLabel,
  pressed,
  onClick,
  eventDebugLogger = null,
}) {
  const element = document.createElement("button");
  element.className = `id-overlay-button id-overlay-button--${control}`;
  if (control === "primary" && /\?$/.test(label)) {
    element.classList.add("id-overlay-button--confirm");
  }
  element.dataset.control = control;
  element.textContent = label;
  element.disabled = !enabled;
  element.setAttribute("aria-label", ariaLabel);
  if (title !== null) {
    element.title = title;
  }
  if (pressed !== undefined) {
    element.setAttribute("aria-pressed", pressed ? "true" : "false");
  }
  element.addEventListener("click", (event) => {
    eventDebugLogger?.log("panel.handler", `${control}-click`, domEventPayload(event));
    if (!element.disabled) {
      onClick();
      eventDebugLogger?.log("panel.command", `${control}-click-commit`, {
        control,
      });
      return;
    }
    eventDebugLogger?.log("panel.command", `${control}-click-ignored`, {
      control,
      reason: "disabled",
    });
  });
  return element;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
