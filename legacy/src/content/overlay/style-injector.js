export const OVERLAY_STYLE_ID = "id-overlay-map-styles";

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

export function createOverlayStyleInjector({
  styleId = OVERLAY_STYLE_ID,
  styleText = OVERLAY_STYLE_TEXT,
} = {}) {
  return {
    ensureInstalled(targetDocument) {
      if (targetDocument.getElementById(styleId)) {
        return;
      }
      const style = targetDocument.createElement("style");
      style.id = styleId;
      style.textContent = styleText;
      (targetDocument.head ?? targetDocument.documentElement ?? targetDocument.body).append(style);
    },
  };
}
