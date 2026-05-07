import test from "node:test";
import assert from "node:assert/strict";

import { createPanelElements } from "../../src/content/panel-elements.js";
import { createPanelViewReconciler } from "../../src/content/panel-render.js";
import { createDomEnvironment } from "../helpers/dom-env.js";

test("panel view reconciler patches controls from one panel view model", () => {
  const env = createDomEnvironment();
  try {
    const elements = createPanelElements({
      ownerDocument: env.document,
      buildLabel: "built test",
    });
    const reconcilePanelView = createPanelViewReconciler(elements);

    reconcilePanelView({
      opacityControl: {
        value: "0.42",
        disabled: true,
      },
      modeSwitch: {
        checked: true,
        disabled: false,
        accessibleLabel: "Mode: Trace",
        mode: "trace",
      },
      mainAction: {
        label: "Clear image?",
        disabled: false,
        presentationKind: "confirm",
      },
      historyControls: {
        undo: {
          disabled: false,
          title: "Reload image",
          accessibleLabel: "Reload image",
        },
        redo: {
          disabled: true,
          title: "",
          accessibleLabel: "Redo",
        },
      },
      status: "Paste an image.",
    });

    assert.equal(elements.opacityInput.value, "0.42");
    assert.equal(elements.opacityInput.disabled, true);
    assert.equal(elements.modeInput.checked, true);
    assert.equal(elements.modeInput.disabled, false);
    assert.equal(elements.modeInput.getAttribute("aria-label"), "Mode: Trace");
    assert.equal(elements.modeSwitch.dataset.mode, "trace");
    assert.equal(elements.mainActionButton.textContent, "Clear image?");
    assert.equal(elements.mainActionButton.disabled, false);
    assert.equal(elements.mainActionButton.classList.contains("id-overlay-button--confirm"), true);
    assert.equal(elements.undoButton.disabled, false);
    assert.equal(elements.undoButton.title, "Reload image");
    assert.equal(elements.undoButton.getAttribute("aria-label"), "Reload image");
    assert.equal(elements.redoButton.disabled, true);
    assert.equal(elements.redoButton.title, "");
    assert.equal(elements.redoButton.getAttribute("aria-label"), "Redo");
    assert.equal(elements.statusElement.textContent, "Paste an image.");
    assert.equal(elements.statusDetailSurface.textContent, "Paste an image.");

    reconcilePanelView({
      opacityControl: {
        value: "0.7",
        disabled: false,
      },
      modeSwitch: {
        checked: false,
        disabled: true,
        accessibleLabel: "Mode: Align",
        mode: "align",
      },
      mainAction: {
        label: "Clear image",
        disabled: false,
        presentationKind: "normal",
      },
      historyControls: {
        undo: {
          disabled: true,
          title: "",
          accessibleLabel: "Undo",
        },
        redo: {
          disabled: false,
          title: "Clear image",
          accessibleLabel: "Clear image",
        },
      },
      status: "Align the image.",
    });

    assert.equal(elements.opacityInput.value, "0.7");
    assert.equal(elements.opacityInput.disabled, false);
    assert.equal(elements.modeInput.checked, false);
    assert.equal(elements.modeInput.disabled, true);
    assert.equal(elements.modeInput.getAttribute("aria-label"), "Mode: Align");
    assert.equal(elements.modeSwitch.dataset.mode, "align");
    assert.equal(elements.mainActionButton.textContent, "Clear image");
    assert.equal(elements.mainActionButton.classList.contains("id-overlay-button--confirm"), false);
    assert.equal(elements.redoButton.disabled, false);
    assert.equal(elements.redoButton.title, "Clear image");
    assert.equal(elements.redoButton.getAttribute("aria-label"), "Clear image");
    assert.equal(elements.statusElement.textContent, "Align the image.");
    assert.equal(elements.statusDetailSurface.textContent, "Align the image.");
  } finally {
    env.cleanup();
  }
});
