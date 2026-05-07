import {
  selectPanelView,
} from "./panel-view-model.js";
import { createPanelElements } from "./panel-elements.js";
import { createPanelViewReconciler } from "./panel-render.js";
import { createPanelDragController } from "./panel-drag.js";

export function createPanel({
  shadow,
  machineHost,
}) {
  const elements = createPanelElements();
  const {
    root,
    header,
    repoLink,
    opacityInput,
    modeInput,
    modeSwitch,
    mainActionButton,
    undoButton,
    redoButton,
  } = elements;
  const reconcilePanelView = createPanelViewReconciler(elements);

  repoLink.addEventListener("mousedown", (event) => {
    event.stopPropagation();
  });
  shadow.append(root);

  const panelDrag = createPanelDragController({
    root,
    handle: header,
    ownerWindow: window,
  });

  modeInput.addEventListener("change", () => {
    // TODO(smell): Product activations are correctly host-owned, but DOM event
    // normalization is still ad hoc per control. Move control event adapters
    // behind named panel input bindings if this grows.
    if (modeInput.disabled) {
      return;
    }
    machineHost.activatePanelMode({ checked: modeInput.checked });
  });
  modeSwitch.addEventListener("wheel", (event) => {
    if (modeInput.disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    machineHost.activatePanelModeStep({ deltaY: event.deltaY });
  }, { passive: false });

  opacityInput.addEventListener("input", () => {
    machineHost.changePanelOpacity(opacityInput.value);
  });
  opacityInput.addEventListener("wheel", (event) => {
    if (opacityInput.disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    machineHost.changePanelOpacityByWheel({
      value: opacityInput.value,
      deltaY: event.deltaY,
    });
  }, { passive: false });

  mainActionButton.addEventListener("click", () => {
    machineHost.activatePanelPrimary();
  });
  undoButton.addEventListener("click", () => {
    if (undoButton.disabled) {
      return;
    }
    machineHost.activateUndo();
  });
  redoButton.addEventListener("click", () => {
    if (redoButton.disabled) {
      return;
    }
    machineHost.activateRedo();
  });

  const unsubscribeMachine = machineHost.subscribe((state) => {
    reconcilePanelView(selectPanelView(state));
  });

  return {
    destroy() {
      panelDrag.destroy();
      unsubscribeMachine();
      root.remove();
    },
  };
}
