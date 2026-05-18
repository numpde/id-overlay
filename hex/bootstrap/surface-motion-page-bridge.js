(() => {
  const TYPE = "id-overlay:surface-motion";
  const KEY = "__idOverlaySurfaceMotionBridge";
  if (window[KEY]) {
    return;
  }
  window[KEY] = true;

  let lastSignature = "";

  function readSurfaceMotion() {
    const surface = document?.querySelector?.(".supersurface");
    if (!surface) {
      return {
        transformCss: "none",
        transformOriginCss: "0px 0px",
      };
    }
    const style = getComputedStyle(surface);
    return {
      transformCss: style.transform || surface.style.transform || "none",
      transformOriginCss: style.transformOrigin || surface.style.transformOrigin || "0px 0px",
    };
  }

  function syncSurfaceMotion() {
    const surfaceMotion = readSurfaceMotion();
    const signature = JSON.stringify(surfaceMotion);
    if (signature === lastSignature) {
      return;
    }
    lastSignature = signature;
    if (!document?.documentElement) {
      return;
    }
    document.documentElement.dataset.idOverlaySurfaceMotion = signature;
    document.dispatchEvent(new CustomEvent(TYPE, {
      detail: surfaceMotion,
    }));
    window.postMessage({
      source: "id-overlay",
      type: TYPE,
      surfaceMotion,
    }, window.location.origin);
  }

  const observer = new MutationObserver(syncSurfaceMotion);
  if (document?.documentElement) {
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
      childList: true,
      subtree: true,
    });
  }
  window.addEventListener("hashchange", syncSurfaceMotion);
  window.addEventListener("resize", syncSurfaceMotion);
  syncSurfaceMotion();
})();
