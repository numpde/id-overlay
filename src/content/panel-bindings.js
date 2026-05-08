export function bindPanelControls({
  elements,
  panelCommands,
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
    panelCommands.activatePanelMode({ checked: modeInput.checked });
  });
  bind(modeSwitch, "wheel", (event) => {
    if (modeInput.disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    panelCommands.activatePanelModeStep({ deltaY: event.deltaY });
  }, { passive: false });

  bind(opacityInput, "input", () => {
    panelCommands.changePanelOpacity(opacityInput.value);
  });
  bind(opacityInput, "wheel", (event) => {
    if (opacityInput.disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    panelCommands.changePanelOpacityByWheel({
      value: opacityInput.value,
      deltaY: event.deltaY,
    });
  }, { passive: false });

  bind(mainActionButton, "click", () => {
    panelCommands.activatePanelPrimary();
  });
  bind(undoButton, "click", () => {
    if (undoButton.disabled) {
      return;
    }
    panelCommands.activateUndo();
  });
  bind(redoButton, "click", () => {
    if (redoButton.disabled) {
      return;
    }
    panelCommands.activateRedo();
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
