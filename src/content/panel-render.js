export function createPanelViewReconciler({
  opacityInput,
  modeInput,
  modeSwitch,
  mainActionButton,
  undoButton,
  redoButton,
  statusElement,
  statusDetailSurface,
}) {
  return function reconcilePanelView(panelView) {
    opacityInput.value = panelView.opacityControl.value;
    opacityInput.disabled = panelView.opacityControl.disabled;

    modeInput.checked = panelView.modeSwitch.checked;
    modeInput.disabled = panelView.modeSwitch.disabled;
    modeInput.setAttribute("aria-label", panelView.modeSwitch.accessibleLabel);
    modeSwitch.dataset.mode = panelView.modeSwitch.mode;

    applyPrimaryButtonPresentation(mainActionButton, panelView.mainAction);
    applyButtonPresentation(undoButton, panelView.historyControls.undo);
    applyButtonPresentation(redoButton, panelView.historyControls.redo);

    statusElement.textContent = panelView.status;
    statusDetailSurface.textContent = panelView.status;
  };
}

function applyPrimaryButtonPresentation(button, presentation) {
  button.textContent = presentation.label;
  button.disabled = presentation.disabled;
  button.classList.toggle(
    "id-overlay-button--confirm",
    presentation.presentationKind === "confirm",
  );
}

function applyButtonPresentation(button, presentation) {
  button.disabled = presentation.disabled;
  button.title = presentation.title;
  button.setAttribute("aria-label", presentation.accessibleLabel);
}
