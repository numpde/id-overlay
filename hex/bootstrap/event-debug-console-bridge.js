(function installIdOverlayEventDebugConsoleBridge() {
  const marker = "__idOverlayEventDebugConsoleBridgeInstalled";
  if (window[marker]) {
    return;
  }
  window[marker] = true;

  document.addEventListener("id-overlay:debug-event", (event) => {
    if (typeof event.detail !== "string") {
      console.info("[id-overlay-event]", event.detail);
      return;
    }
    console.info(`[id-overlay-event] ${event.detail}`);
  });
}());
