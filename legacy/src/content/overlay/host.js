import { createOverlayStyleInjector } from "./style-injector.js";

export function createOverlayHost({
  root,
  getMountElement,
  render,
  onMountChange,
  frameTarget = globalThis,
  styleInjector = createOverlayStyleInjector(),
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
    styleInjector.ensureInstalled(nextMountElement.ownerDocument);
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
