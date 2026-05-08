import {
  selectPanelView,
} from "./panel-view-model.js";
import { bindPanelControls } from "./panel-bindings.js";
import { createPanelElements } from "./panel-elements.js";
import { createPanelViewReconciler } from "./panel-render.js";
import { createPanelDragController } from "./panel-drag.js";
import { createPanelCommandAdapter } from "./panel-command-adapter.js";

export function createPanel({
  shadow,
  machineHost,
}) {
  const elements = createPanelElements();
  const {
    root,
    header,
  } = elements;
  const reconcilePanelView = createPanelViewReconciler(elements);

  shadow.append(root);

  const panelDrag = createPanelDragController({
    root,
    handle: header,
    ownerWindow: window,
  });
  const panelBindings = bindPanelControls({
    elements,
    panelCommands: createPanelCommandAdapter({ machineHost }),
  });

  const unsubscribeMachine = machineHost.subscribe((state) => {
    reconcilePanelView(selectPanelView(state));
  });

  return {
    destroy() {
      panelBindings.destroy();
      panelDrag.destroy();
      unsubscribeMachine();
      root.remove();
    },
  };
}
