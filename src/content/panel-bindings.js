export function bindPanelControls({
  elements,
  machineHost,
}) {
  const {
    repoLink,
    opacityInput,
    modeInput,
    modeSwitch,
    mainActionButton,
    undoButton,
    redoButton,
  } = elements;
  const subscriptions = [];

  bind(repoLink, "mousedown", (event) => {
    event.stopPropagation();
  });

  bind(modeInput, "change", () => {
    if (modeInput.disabled) {
      return;
    }
    machineHost.activatePanelMode({ checked: modeInput.checked });
  });
  bind(modeSwitch, "wheel", (event) => {
    if (modeInput.disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    machineHost.activatePanelModeStep({ deltaY: event.deltaY });
  }, { passive: false });

  bind(opacityInput, "input", () => {
    machineHost.changePanelOpacity(opacityInput.value);
  });
  bind(opacityInput, "wheel", (event) => {
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

  bind(mainActionButton, "click", () => {
    machineHost.activatePanelPrimary();
  });
  bind(undoButton, "click", () => {
    if (undoButton.disabled) {
      return;
    }
    machineHost.activateUndo();
  });
  bind(redoButton, "click", () => {
    if (redoButton.disabled) {
      return;
    }
    machineHost.activateRedo();
  });

  return {
    destroy() {
      for (const unsubscribe of subscriptions.splice(0)) {
        unsubscribe();
      }
    },
  };

  function bind(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    subscriptions.push(() => {
      target.removeEventListener(type, listener, options);
    });
  }
}
