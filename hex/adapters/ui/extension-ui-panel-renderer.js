import {
  createPanelAdapter,
} from "./panel-adapter.js";
import {
  createPanelViewportPositioner,
} from "./panel-viewport-positioner.js";
import {
  resolvePanelPosition,
} from "./panel-position-adapter.js";

export function createExtensionPanelRenderer({
  document,
  eventDebugLogger = null,
  hotPathWatchdog = null,
}) {
  let positioner = null;
  let positionedPanel = null;
  let isPanelPositionPreviewActive = false;

  return {
    renderPanel({
      root,
      panelChrome,
      view,
      dispatchCommand = () => {},
      dispatchPanelChromeChange = () => {},
      previewOpacity = () => {},
    }) {
      bindPanelPositioner({
        ownerWindow: document.defaultView,
        panel: root.panel,
        eventDebugLogger,
      });
      if (!isPanelPositionPreviewActive) {
        applyPanelChrome({
          panel: root.panel,
          panelChrome,
        });
        positioner?.setPreferredScreenPx(panelChrome?.position?.screenPx ?? null);
      }
      const panelSignature = panelRenderSignature(view);
      if (root.panelRenderSignature === panelSignature) {
        const patchResult = patchMutablePanelFacts({
          panel: root.panel,
          view,
        });
        if (patchResult.contentSizeMayChange) {
          positioner?.syncAfterContentChange({
            smooth: true,
          });
        }
        return;
      }
      const hasRenderedPanel = root.panelRenderSignature !== undefined;
      const panelAdapter = createPanelAdapter({
        document,
        emitCommand: dispatchCommand,
        writePanelPosition(position) {
          dispatchPanelChromeChange({
            position,
          });
        },
        previewPanelPosition(position) {
          applyPreviewPanelPosition({
            panel: root.panel,
            position,
          });
        },
        setPanelPositionPreviewActive(active) {
          isPanelPositionPreviewActive = active;
        },
        previewOpacity,
        eventDebugLogger,
        hotPathWatchdog,
      });
      root.panel.replaceChildren(panelAdapter.render(view));
      root.panelRenderSignature = panelSignature;
      patchMutablePanelFacts({
        panel: root.panel,
        view,
      });
      positioner?.syncAfterContentChange({
        smooth: hasRenderedPanel,
      });
    },
    destroy() {
      positioner?.destroy();
      positioner = null;
      positionedPanel = null;
      isPanelPositionPreviewActive = false;
    },
  };

  function bindPanelPositioner({
    ownerWindow,
    panel,
    eventDebugLogger,
  }) {
    if (!ownerWindow) {
      return;
    }
    if (!positioner) {
      positioner = createPanelViewportPositioner({
        ownerWindow,
        panel,
        eventDebugLogger,
      });
      positionedPanel = panel;
      return;
    }
    if (positionedPanel === panel) {
      return;
    }
    positioner.setPanel(panel);
    positionedPanel = panel;
  }
}

function applyPanelChrome({
  panel,
  panelChrome,
}) {
  if (!panelChrome?.position?.screenPx) {
    return;
  }
  panel.style.left = `${panelChrome.position.screenPx.x}px`;
  panel.style.top = `${panelChrome.position.screenPx.y}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";
}

function applyPreviewPanelPosition({
  panel,
  position,
}) {
  const resolved = resolvePanelPosition(position);
  panel.dataset.idOverlayPanelMotion = "direct";
  panel.style.left = `${resolved.x}px`;
  panel.style.top = `${resolved.y}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";
}

function panelRenderSignature(view) {
  return JSON.stringify({
    primaryAction: primaryActionStructuralSignature(view.primaryAction),
    centerOverlayInViewAction: actionStructuralSignature(view.centerOverlayInViewAction),
    centerMapOnOverlayAction: actionStructuralSignature(view.centerMapOnOverlayAction),
    modeSwitch: view.modeSwitch,
    opacityControl: opacityControlStructuralSignature(view.opacityControl),
  });
}

function primaryActionStructuralSignature(primaryAction) {
  if (!primaryAction) {
    return null;
  }
  return {
    icon: primaryAction.icon ?? null,
  };
}

function actionStructuralSignature(action) {
  if (!action) {
    return null;
  }
  return {
    kind: action.kind,
    icon: action.icon ?? null,
  };
}

function opacityControlStructuralSignature(opacityControl) {
  if (!opacityControl) {
    return null;
  }
  return {
    min: opacityControl.min,
    max: opacityControl.max,
    step: opacityControl.step,
  };
}

function patchMutablePanelFacts({
  panel,
  view,
}) {
  const statusChanged = patchStatus({
    panel,
    status: view.status,
  });
  patchOpacityControl({
    panel,
    opacityControl: view.opacityControl,
  });
  patchActionControls({
    panel,
    view,
  });
  patchPanelTitle({
    panel,
    panelTitle: view.panelTitle,
  });
  return {
    contentSizeMayChange: statusChanged,
  };
}

function patchPanelTitle({
  panel,
  panelTitle,
}) {
  const title = panel.querySelector(".id-overlay-panel__title");
  if (!title) {
    return;
  }
  title.textContent = String(panelTitle ?? "");
}

function patchActionControls({
  panel,
  view,
}) {
  patchButton(panel, {
    control: "primary",
    label: view.primaryAction?.label ?? "",
    enabled: view.primaryAction?.enabled ?? false,
    tone: view.primaryAction?.tone ?? "normal",
    confirmation: view.primaryAction?.confirmation ?? "none",
    actionKind: view.primaryAction?.kind ?? null,
    ariaLabel: view.primaryAction?.label ?? "Primary action",
  });
  patchButton(panel, actionButtonPatch({
    control: "center-overlay",
    action: view.centerOverlayInViewAction,
  }));
  patchButton(panel, actionButtonPatch({
    control: "center-map",
    action: view.centerMapOnOverlayAction,
  }));
  patchButton(panel, historyButtonPatch({
    control: "undo",
    fallbackLabel: "Undo",
    historyAction: view.history?.undo,
  }));
  patchButton(panel, historyButtonPatch({
    control: "redo",
    fallbackLabel: "Redo",
    historyAction: view.history?.redo,
  }));
}

function actionButtonPatch({
  control,
  action,
}) {
  return {
    control,
    label: action?.label ?? "",
    enabled: action?.enabled ?? false,
    tone: "normal",
    confirmation: "none",
    actionKind: action?.kind ?? null,
    title: action?.label ?? null,
    ariaLabel: action?.label ?? control,
  };
}

function historyButtonPatch({
  control,
  fallbackLabel,
  historyAction,
}) {
  return {
    control,
    enabled: historyAction?.enabled ?? false,
    tone: "normal",
    confirmation: "none",
    title: historyAction?.label ?? null,
    ariaLabel: historyAction?.label ?? fallbackLabel,
  };
}

function patchButton(
  panel,
  {
    control,
    label = null,
    enabled = false,
    tone = "normal",
    confirmation = "none",
    actionKind = null,
    title = null,
    ariaLabel,
  },
) {
  const button = panel.querySelector(`[data-control='${control}']`);
  if (!button) {
    return;
  }
  if (label !== null && !button.querySelector("svg")) {
    button.textContent = label;
  }
  button.disabled = !enabled;
  button.dataset.tone = tone;
  button.dataset.confirmation = confirmation;
  button.classList.toggle("id-overlay-button--confirm", confirmation === "armed");
  setNullableDataset(button, "actionKind", actionKind);
  setNullableAttribute(button, "title", title);
  button.setAttribute("aria-label", ariaLabel);
}

function setNullableDataset(element, key, value) {
  if (value === null || value === undefined) {
    delete element.dataset[key];
    return;
  }
  element.dataset[key] = String(value);
}

function setNullableAttribute(element, name, value) {
  if (value === null || value === undefined) {
    element.removeAttribute(name);
    return;
  }
  element.setAttribute(name, String(value));
}

function patchOpacityControl({
  panel,
  opacityControl,
}) {
  const opacity = panel.querySelector("[data-control='opacity']");
  if (!opacity || !opacityControl) {
    return;
  }
  opacity.disabled = !opacityControl.enabled;
  opacity.value = String(opacityControl.value);
}

function patchStatus({
  panel,
  status: statusText,
}) {
  const status = panel.querySelector("[data-region='status']");
  const statusDetail = panel.querySelector(".id-overlay-panel__status-detail-surface");
  if (!status || !statusDetail) {
    return false;
  }
  const nextText = String(statusText ?? "");
  const changed = status.textContent !== nextText || statusDetail.textContent !== nextText;
  status.textContent = nextText;
  statusDetail.textContent = nextText;
  return changed;
}
