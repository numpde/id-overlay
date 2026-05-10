import { createOverlayAdapter } from "./overlay-adapter.js";
import { createPanelAdapter } from "./panel-adapter.js";

export function createExtensionUiHost({ document }) {
  return {
    mountOwnedRoot(ownerId) {
      if (!document?.createElement) {
        return null;
      }

      const existingHost = document.querySelector?.(`[data-id-overlay-owner="${ownerId}"]`);
      if (existingHost?.shadowRoot) {
        return readOwnedRoot(existingHost.shadowRoot);
      }

      const hostElement = document.createElement("div");
      hostElement.dataset.idOverlayOwner = ownerId;
      const shadowRoot = hostElement.attachShadow({ mode: "open" });
      shadowRoot.append(createStyleElement(document));

      const overlay = document.createElement("div");
      overlay.dataset.region = "overlay";
      const panel = document.createElement("div");
      panel.dataset.region = "panel";
      shadowRoot.append(overlay, panel);

      const mountParent = document.body ?? document.documentElement;
      mountParent?.append(hostElement);
      return {
        ownerId,
        hostElement,
        overlay,
        panel,
      };
    },
    renderApplicationView({
      root,
      view,
      dispatchCommand,
    }) {
      if (!document?.createElement || !root?.panel || !root?.overlay) {
        return;
      }

      const panelAdapter = createPanelAdapter({
        document,
        emitCommand: dispatchCommand,
      });
      root.panel.replaceChildren(panelAdapter.render(view));

      const overlayAdapter = createOverlayAdapter({
        document,
      });
      root.overlay.replaceChildren(overlayAdapter.render(view.overlay));
    },
  };
}

function readOwnedRoot(shadowRoot) {
  return {
    hostElement: shadowRoot.host,
    overlay: shadowRoot.querySelector('[data-region="overlay"]'),
    panel: shadowRoot.querySelector('[data-region="panel"]'),
  };
}

function createStyleElement(document) {
  const style = document.createElement("style");
  style.textContent = `
    :host {
      all: initial;
      color-scheme: light;
      font-family: ui-sans-serif, system-ui, sans-serif;
    }

    [data-region="overlay"] {
      inset: 0;
      pointer-events: none;
      position: fixed;
      z-index: 2147483646;
    }

    [data-control="overlay"] {
      inset: 0;
      position: absolute;
    }

    [data-overlay-image] {
      background: var(--id-overlay-image-data, rgba(37, 99, 235, 0.18));
      border: 1px solid rgba(37, 99, 235, 0.45);
      box-sizing: border-box;
      pointer-events: auto;
      position: absolute;
    }

    [data-region="panel"] {
      position: fixed;
      right: 16px;
      top: 16px;
      z-index: 2147483647;
    }

    [data-region="panel"] section {
      align-items: center;
      background: rgba(255, 255, 255, 0.96);
      border: 1px solid rgba(15, 23, 42, 0.14);
      border-radius: 8px;
      box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
      display: flex;
      gap: 6px;
      padding: 8px;
    }

    button {
      appearance: none;
      background: #0f766e;
      border: 0;
      border-radius: 6px;
      color: white;
      cursor: pointer;
      font: 600 12px/1 ui-sans-serif, system-ui, sans-serif;
      min-height: 28px;
      padding: 0 10px;
    }

    button:disabled {
      background: #cbd5e1;
      color: #64748b;
      cursor: default;
    }

    output {
      color: #334155;
      font: 500 12px/1.2 ui-sans-serif, system-ui, sans-serif;
      max-width: 220px;
    }
  `;
  return style;
}
