import {
  domEventPayload,
} from "./event-debug-log.js";
import {
  createGithubIcon,
  createPanelActionIcon,
} from "./panel-icons.js";

export function createPanelAdapter({
  document,
  emitCommand = () => {},
  writePanelPosition = () => {},
  previewPanelPosition = () => {},
  setPanelPositionPreviewActive = () => {},
  previewOpacity = () => {},
  eventDebugLogger = null,
  hotPathWatchdog = null,
}) {
  return {
    render(view) {
      const root = document.createElement("section");
      root.className = "id-overlay-panel";
      root.dataset.idOverlayOwned = "true";

      const header = renderPanelHeader(document, {
        panelTitle: view.panelTitle,
      });
      root.append(header);

      root.append(renderControlsRow({
        document,
        view,
        emitCommand,
        eventDebugLogger,
      }));
      root.append(renderOpacityField({
        document,
        view,
        emitCommand,
        previewOpacity,
        eventDebugLogger,
        hotPathWatchdog,
      }));
      root.append(renderStatus({
        document,
        status: view.status,
      }));
      bindPanelDrag({
        root,
        handle: header,
        ownerWindow: document.defaultView,
        writePanelPosition,
        previewPanelPosition,
        setPanelPositionPreviewActive,
        eventDebugLogger,
        hotPathWatchdog,
      });

      return root;
    },
  };
}

function renderPanelHeader(document, {
  panelTitle,
}) {
  const header = document.createElement("div");
  header.className = "id-overlay-panel__header";
  header.title = "Drag to move";
  const titleRow = document.createElement("div");
  titleRow.className = "id-overlay-panel__title-row";
  const title = document.createElement("h1");
  title.className = "id-overlay-panel__title";
  title.textContent = panelTitle;
  const repoLink = document.createElement("a");
  repoLink.className = "id-overlay-panel__repo-link";
  repoLink.href = "https://github.com/numpde/id-overlay";
  repoLink.target = "_blank";
  repoLink.rel = "noopener noreferrer";
  repoLink.title = "GitHub";
  repoLink.setAttribute("aria-label", "Open id-overlay on GitHub");
  repoLink.append(createGithubIcon(document, {
    className: "id-overlay-panel__repo-icon",
  }));
  const buildMeta = document.createElement("p");
  buildMeta.className = "id-overlay-panel__meta";
  titleRow.append(title, repoLink);
  header.append(titleRow, buildMeta);
  return header;
}

function renderControlsRow({
  document,
  view,
  emitCommand,
  eventDebugLogger,
}) {
  const controlsRow = document.createElement("div");
  controlsRow.className = "id-overlay-panel__controls-row";

  const centerOverlayInViewAction = requireViewAction(
    view.centerOverlayInViewAction,
    "centerOverlayInViewAction",
  );
  const centerMapOnOverlayAction = requireViewAction(
    view.centerMapOnOverlayAction,
    "centerMapOnOverlayAction",
  );

  controlsRow.append(
    button({
      document,
      control: "primary",
      label: view.primaryAction.label,
      enabled: view.primaryAction.enabled,
      tone: view.primaryAction.tone,
      confirmation: view.primaryAction.confirmation,
      actionKind: view.primaryAction.kind,
      ariaLabel: view.primaryAction.label,
      eventDebugLogger,
      onClick: () => emitCommand({
        kind: "activate-primary-action",
      }),
    }),
    button({
      document,
      control: "center-overlay",
      action: centerOverlayInViewAction,
      eventDebugLogger,
      onClick: () => emitActionCommand(emitCommand, centerOverlayInViewAction),
    }),
    button({
      document,
      control: "center-map",
      action: centerMapOnOverlayAction,
      eventDebugLogger,
      onClick: () => emitActionCommand(emitCommand, centerMapOnOverlayAction),
    }),
    renderModeSwitch({
      document,
      view,
      emitCommand,
      eventDebugLogger,
    }),
    renderHistoryActions({
      document,
      view,
      emitCommand,
      eventDebugLogger,
    }),
  );

  return controlsRow;
}

function requireViewAction(action, name) {
  if (!action) {
    throw new TypeError(`Panel view is missing ${name}.`);
  }
  return action;
}

function requireViewFact(fact, name) {
  if (!fact) {
    throw new TypeError(`Panel view is missing ${name}.`);
  }
  return fact;
}

function emitActionCommand(emitCommand, action) {
  emitCommand({
    kind: action.kind,
  });
}

function renderModeSwitch({
  document,
  view,
  emitCommand,
  eventDebugLogger,
}) {
  const modeSwitchView = requireViewFact(view.modeSwitch, "modeSwitch");
  const alignMode = requireViewFact(modeSwitchView.align, "modeSwitch.align");
  const traceMode = requireViewFact(modeSwitchView.trace, "modeSwitch.trace");
  const targetToggleMode = modeSwitchView.selected === "trace" ? "align" : "trace";
  const isTargetModeEnabled = (mode) => Boolean(mode === "align" ? alignMode.enabled : traceMode.enabled);
  const canToggleMode = isTargetModeEnabled(targetToggleMode);
  const modeSwitch = document.createElement("label");
  modeSwitch.className = "id-overlay-mode-switch";
  modeSwitch.dataset.control = "mode-switch";
  modeSwitch.dataset.mode = modeSwitchView.selected;
  modeSwitch.setAttribute("aria-label", `Mode switch: ${modeSwitchView.selected === "trace" ? "Trace" : "Align"}`);
  modeSwitch.addEventListener("wheel", (event) => {
    eventDebugLogger?.log("panel.handler", "mode-wheel", domEventPayload(event));
    const targetMode = event.deltaY < 0 ? "align" : "trace";
    if (targetMode === modeSwitchView.selected) {
      eventDebugLogger?.log("panel.command", "mode-wheel-ignored", {
        mode: targetMode,
        reason: "current",
      });
      return;
    }
    if (!isTargetModeEnabled(targetMode)) {
      eventDebugLogger?.log("panel.command", "mode-wheel-ignored", {
        mode: targetMode,
        reason: "disabled",
      });
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    emitCommand({
      kind: "select-mode",
      mode: targetMode,
    });
    eventDebugLogger?.log("panel.command", "mode-wheel-commit", {
      mode: targetMode,
    });
  });

  const modeInput = document.createElement("input");
  modeInput.type = "checkbox";
  modeInput.className = "id-overlay-mode-switch__input";
  modeInput.checked = modeSwitchView.selected === "align";
  modeInput.disabled = !canToggleMode;
  modeInput.setAttribute("aria-label", `Mode: ${modeSwitchView.selected === "trace" ? "Trace" : "Align"}`);
  modeInput.addEventListener("change", () => {
    if (modeInput.disabled) {
      return;
    }
    const targetMode = modeInput.checked ? "align" : "trace";
    if (!isTargetModeEnabled(targetMode)) {
      modeInput.checked = modeSwitchView.selected === "align";
      eventDebugLogger?.log("panel.command", "mode-switch-change-ignored", {
        mode: targetMode,
        reason: "disabled",
      });
      return;
    }
    modeInput.setAttribute("aria-label", `Mode: ${targetMode === "align" ? "Align" : "Trace"}`);
    emitCommand({
      kind: "select-mode",
      mode: targetMode,
    });
    eventDebugLogger?.log("panel.command", "mode-switch-change-commit", {
      mode: targetMode,
    });
  });

  const modeTrack = document.createElement("span");
  modeTrack.className = "id-overlay-mode-switch__track";
  const modeThumb = document.createElement("span");
  modeThumb.className = "id-overlay-mode-switch__thumb";
  modeTrack.append(modeThumb);
  modeSwitch.append(modeInput, modeTrack);
  return modeSwitch;
}

function renderHistoryActions({
  document,
  view,
  emitCommand,
  eventDebugLogger,
}) {
  const historyActions = document.createElement("div");
  historyActions.className = "id-overlay-panel__history-actions";
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
  return historyActions;
}

function renderOpacityField({
  document,
  view,
  emitCommand,
  previewOpacity,
  eventDebugLogger,
  hotPathWatchdog,
}) {
  const opacityControl = requireViewFact(view.opacityControl, "opacityControl");
  const opacityGroup = document.createElement("label");
  opacityGroup.className = "id-overlay-field";
  const opacityLabel = document.createElement("span");
  opacityLabel.className = "id-overlay-field__label";
  opacityLabel.textContent = "Opacity";
  const opacity = document.createElement("input");
  opacity.dataset.control = "opacity";
  opacity.type = "range";
  opacity.className = "id-overlay-field__slider";
  opacity.min = String(opacityControl.min);
  opacity.max = String(opacityControl.max);
  opacity.step = String(opacityControl.step);
  opacity.value = String(opacityControl.value);
  opacity.disabled = !opacityControl.enabled;
  opacity.addEventListener("input", () => {
    if (opacity.disabled) {
      eventDebugLogger?.log("panel.command", "opacity-input-ignored", {
        reason: "disabled",
      });
      return;
    }
    const nextOpacity = clampedOpacityValue(opacity);
    if (nextOpacity === null) {
      eventDebugLogger?.log("panel.command", "opacity-input-ignored", {
        reason: "invalid-value",
        value: opacity.value,
      });
      return;
    }
    hotPathWatchdog?.begin({
      interaction: "opacity-slider",
      source: "panel.opacity.input",
    });
    opacity.value = String(nextOpacity);
    previewOpacity(nextOpacity);
    eventDebugLogger?.log("panel.handler", "opacity-input-preview", {
      opacity: nextOpacity,
    });
  });
  opacity.addEventListener("change", () => {
    if (opacity.disabled) {
      hotPathWatchdog?.end({
        interaction: "opacity-slider",
      });
      eventDebugLogger?.log("panel.command", "opacity-change-ignored", {
        reason: "disabled",
      });
      return;
    }
    const nextOpacity = clampedOpacityValue(opacity);
    if (nextOpacity === null) {
      hotPathWatchdog?.end({
        interaction: "opacity-slider",
      });
      eventDebugLogger?.log("panel.command", "opacity-change-ignored", {
        reason: "invalid-value",
        value: opacity.value,
      });
      return;
    }
    opacity.value = String(nextOpacity);
    previewOpacity(nextOpacity);
    hotPathWatchdog?.commit({
      interaction: "opacity-slider",
    });
    emitCommand({
      kind: "set-opacity",
      opacity: nextOpacity,
    });
    hotPathWatchdog?.end({
      interaction: "opacity-slider",
    });
    eventDebugLogger?.log("panel.command", "opacity-change-commit", {
      opacity: nextOpacity,
    });
  });
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
    const step = Number(opacityControl.step);
    const nextOpacity = clamp(
      Number(opacity.value) + (event.deltaY < 0 ? step : -step),
      Number(opacity.min),
      Number(opacity.max),
    );
    opacity.value = String(nextOpacity);
    hotPathWatchdog?.commit({
      interaction: "opacity-slider-wheel",
    });
    emitCommand({
      kind: "set-opacity",
      opacity: nextOpacity,
    });
    hotPathWatchdog?.end({
      interaction: "opacity-slider-wheel",
    });
    eventDebugLogger?.log("panel.command", "opacity-wheel-commit", {
      opacity: nextOpacity,
    });
  });
  opacityGroup.append(opacityLabel, opacity);
  return opacityGroup;
}

function clampedOpacityValue(opacity) {
  const value = Number(opacity.value);
  if (!Number.isFinite(value)) {
    return null;
  }
  return clamp(
    value,
    Number(opacity.min),
    Number(opacity.max),
  );
}

function renderStatus({
  document,
  status: statusText,
}) {
  const statusWrap = document.createElement("div");
  statusWrap.className = "id-overlay-panel__status-wrap";
  const status = document.createElement("p");
  status.className = "id-overlay-panel__status";
  status.dataset.region = "status";
  status.tabIndex = 0;
  status.textContent = statusText;
  const statusDetail = document.createElement("div");
  statusDetail.className = "id-overlay-panel__status-detail";
  const statusDetailSurface = document.createElement("div");
  statusDetailSurface.className = "id-overlay-panel__status-detail-surface";
  statusDetailSurface.textContent = statusText;
  statusDetail.append(statusDetailSurface);
  statusWrap.append(status, statusDetail);
  return statusWrap;
}

function bindPanelDrag({
  root,
  handle,
  ownerWindow,
  writePanelPosition,
  previewPanelPosition,
  setPanelPositionPreviewActive,
  eventDebugLogger,
  hotPathWatchdog,
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
      latestPosition: null,
    };
    hotPathWatchdog?.begin({
      interaction: "panel-drag",
      source: "panel.header.drag",
    });
    setPanelPositionPreviewActive(true);
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
    activeDrag.latestPosition = position;
    previewPanelPosition(position);
    eventDebugLogger?.log("panel.handler", "drag-position-preview", {
      requestedScreenPx: position.requestedScreenPx,
      panelSizePx: position.panelSizePx,
      viewportPx: position.viewportPx,
    });
  }

  function handleEnd(event) {
    if (!activeDrag) {
      return;
    }
    const isCanceled = event?.type === dragEvents.cancel;
    const latestPosition = activeDrag.latestPosition;
    if (latestPosition && !isCanceled) {
      hotPathWatchdog?.commit({
        interaction: "panel-drag",
      });
      writePanelPosition(latestPosition);
      eventDebugLogger?.log("panel.command", "drag-position-commit", {
        requestedScreenPx: latestPosition.requestedScreenPx,
        panelSizePx: latestPosition.panelSizePx,
        viewportPx: latestPosition.viewportPx,
      });
    }
    activeDrag = null;
    setPanelPositionPreviewActive(false);
    hotPathWatchdog?.end({
      interaction: "panel-drag",
    });
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

function button({
  document,
  control,
  action = null,
  label,
  enabled,
  tone = "normal",
  confirmation = "none",
  actionKind = null,
  icon = null,
  title = null,
  ariaLabel,
  pressed,
  onClick,
  eventDebugLogger = null,
}) {
  const element = document.createElement("button");
  const buttonLabel = action?.label ?? label;
  const buttonEnabled = action?.enabled ?? enabled;
  const buttonActionKind = action?.kind ?? actionKind;
  const buttonIcon = action?.icon ?? icon;
  const buttonTitle = title ?? action?.label ?? null;
  const buttonAriaLabel = ariaLabel ?? action?.label;
  element.className = `id-overlay-button id-overlay-button--${control}`;
  if (control === "primary" && confirmation === "armed") {
    element.classList.add("id-overlay-button--confirm");
  }
  element.dataset.control = control;
  element.dataset.tone = tone;
  element.dataset.confirmation = confirmation;
  if (buttonActionKind !== null) {
    element.dataset.actionKind = buttonActionKind;
  }
  const iconElement = buttonIcon ? createPanelActionIcon(document, buttonIcon) : null;
  if (iconElement) {
    element.append(iconElement);
  } else {
    element.textContent = buttonLabel;
  }
  element.disabled = !buttonEnabled;
  element.setAttribute("aria-label", buttonAriaLabel);
  if (buttonTitle !== null) {
    element.title = buttonTitle;
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
