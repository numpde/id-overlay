const OVERLAY_STYLE_ID = "id-overlay-map-styles";

// TODO(smell): Overlay CSS lives in JS because it must be injected into the
// current page or iframe document after remounts. Replace this with a generated
// style asset plus document-scoped injector before expanding overlay styling.
const OVERLAY_STYLE_TEXT = `
.id-overlay-viewport {
  position: absolute;
  overflow: hidden;
  pointer-events: none;
  z-index: 1;
}

.id-overlay-map-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  transform-origin: 0 0;
  pointer-events: none;
}

.id-overlay-image {
  position: absolute;
  display: none;
  max-width: none;
  max-height: none;
  user-select: none;
  pointer-events: none;
}

.id-overlay-frame {
  position: absolute;
  display: none;
  border: 1px solid rgba(15, 23, 42, 0.42);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.36) inset;
  user-select: none;
  pointer-events: none;
}

.id-overlay-pin-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.id-overlay-map-pin-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.id-overlay-pin {
  position: absolute;
  min-width: 22px;
  min-height: 22px;
  padding: 0 6px;
  border: 2px solid #ffffff;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.95);
  color: #ffffff;
  font: 11px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-weight: 700;
  text-align: center;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.2);
}

.id-overlay-map-pin {
  position: absolute;
  min-width: 18px;
  min-height: 18px;
  padding: 0 4px;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.52);
  color: rgba(255, 255, 255, 0.94);
  font: 10px/16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-weight: 700;
  text-align: center;
  transform: translate(-50%, -50%);
  box-shadow:
    0 0 0 1px rgba(15, 23, 42, 0.12),
    0 1px 6px rgba(15, 23, 42, 0.1);
  opacity: 0.88;
}

`;

export function createOverlayHost({
  root,
  getMountElement,
  render,
  onMountChange,
  frameTarget = globalThis,
}) {
  let renderFrame = null;
  let mountElement = null;

  function getCurrentMountElement() {
    return mountElement;
  }

  function scheduleRender() {
    if (renderFrame !== null) {
      return;
    }
    if (typeof frameTarget.requestAnimationFrame !== "function") {
      renderMounted();
      return;
    }
    renderFrame = frameTarget.requestAnimationFrame(() => {
      renderFrame = null;
      renderMounted();
    });
  }

  function destroy() {
    if (renderFrame !== null && typeof frameTarget.cancelAnimationFrame === "function") {
      frameTarget.cancelAnimationFrame(renderFrame);
    }
    renderFrame = null;
    root.remove();
    mountElement = null;
    onMountChange?.(null);
  }

  function renderMounted() {
    ensureMounted();
    render();
  }

  function ensureMounted() {
    const nextMountElement = getMountElement();
    if (!nextMountElement) {
      return;
    }
    ensureOverlayStyles(nextMountElement.ownerDocument);
    if (mountElement === nextMountElement) {
      return;
    }
    root.remove();
    nextMountElement.prepend(root);
    mountElement = nextMountElement;
    onMountChange?.(mountElement);
  }

  return {
    getMountElement: getCurrentMountElement,
    scheduleRender,
    destroy,
  };
}

function ensureOverlayStyles(targetDocument) {
  if (targetDocument.getElementById(OVERLAY_STYLE_ID)) {
    return;
  }
  const style = targetDocument.createElement("style");
  style.id = OVERLAY_STYLE_ID;
  style.textContent = OVERLAY_STYLE_TEXT;
  (targetDocument.head ?? targetDocument.documentElement ?? targetDocument.body).append(style);
}
