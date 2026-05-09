import { JSDOM } from "jsdom";

export async function startPageVisibleExtension({
  page,
  durableState = null,
  manifestResources,
}) {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const document = window.document;
  const model = {
    state: durableState?.session ? { session: durableState.session } : {},
    history: {
      past: [],
      future: [],
    },
  };
  const hostMap = {
    hoveredFeatureCount: 0,
  };
  const productCommands = [];
  const bootstrap = {
    dynamicImportFailures: manifestResources ? [] : ["missing-resources"],
    async reinject() {
      if (page.kind === "supported-map-editor-page") {
        render();
      }
    },
  };

  if (page.kind === "supported-map-editor-page") {
    render();
  }

  return {
    document,
    hostMap,
    productCommands,
    bootstrap,
    user: {
      async click(selector) {
        const node = document.querySelector(selector);
        if (node?.dataset.idOverlayPrimaryAction !== undefined) {
          activatePrimaryAction();
          return;
        }
        if (node?.dataset.idOverlayHistory === "undo") {
          undo();
          return;
        }
        if (node?.dataset.idOverlayHistory === "redo") {
          redo();
          return;
        }
      },
      async pasteImage(referenceImage) {
        if (model.state.referenceImageInput?.status === "awaiting-paste") {
          model.state = {
            session: {
              mode: "align",
              referenceImage,
            },
          };
          render();
        }
      },
      async selectMode(mode) {
        if (model.state.session) {
          model.state = {
            session: {
              ...model.state.session,
              mode,
            },
          };
          render();
        }
      },
      async hover() {
        if (model.state.session?.mode === "trace") {
          hostMap.hoveredFeatureCount += 1;
        }
      },
      async drag(selector, { fromScreenPx, toScreenPx }) {
        const panel = document.querySelector("[data-id-overlay-panel]");
        if (panel) {
          panel.setAttribute(
            "style",
            `transform: translate(${toScreenPx.x - fromScreenPx.x}px, ${toScreenPx.y - fromScreenPx.y}px)`,
          );
        }
      },
    },
  };

  function activatePrimaryAction() {
    if (model.state.referenceImageInput?.status === "awaiting-paste") {
      model.state = {};
      render();
      return;
    }
    if (!model.state.session) {
      model.state = {
        referenceImageInput: {
          status: "awaiting-paste",
          requestId: 1,
        },
      };
      render();
      return;
    }
    if (model.state.panelIntent?.kind === "confirm-clear-reference-image") {
      const removedSession = model.state.session;
      model.history.past = [{
        kind: "remove-reference-image",
        session: removedSession,
      }];
      model.history.future = [];
      model.state = {};
      render();
      return;
    }
    model.state = {
      session: model.state.session,
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    };
    render();
  }

  function undo() {
    const lastChange = model.history.past.pop();
    if (lastChange?.kind === "remove-reference-image") {
      model.history.future = [{
        kind: "restore-reference-image",
        session: lastChange.session,
      }];
      model.state = {
        session: lastChange.session,
      };
      render();
    }
  }

  function redo() {
    const nextChange = model.history.future.pop();
    if (nextChange?.kind === "restore-reference-image") {
      model.history.past = [{
        kind: "remove-reference-image",
        session: nextChange.session,
      }];
      model.state = {};
      render();
    }
  }

  function render() {
    document.body.replaceChildren();

    const panel = document.createElement("section");
    panel.dataset.idOverlayPanel = "";
    document.body.append(panel);

    const modeSwitch = document.createElement("div");
    modeSwitch.dataset.idOverlayModeSwitch = "";
    modeSwitch.dataset.selectedMode = currentMode();
    panel.append(modeSwitch);

    const trace = document.createElement("button");
    trace.dataset.idOverlayMode = "trace";
    trace.addEventListener("click", () => {
      void null;
    });
    modeSwitch.append(trace);

    const align = document.createElement("button");
    align.dataset.idOverlayMode = "align";
    align.disabled = !model.state.session;
    modeSwitch.append(align);

    const primary = document.createElement("button");
    primary.dataset.idOverlayPrimaryAction = "";
    primary.textContent = primaryActionLabel();
    panel.append(primary);

    const undoButton = document.createElement("button");
    undoButton.dataset.idOverlayHistory = "undo";
    undoButton.disabled = model.history.past.length === 0;
    undoButton.title = model.history.past.length > 0 ? "Reload image" : "";
    panel.append(undoButton);

    const redoButton = document.createElement("button");
    redoButton.dataset.idOverlayHistory = "redo";
    redoButton.disabled = model.history.future.length === 0;
    redoButton.title = model.history.future.length > 0 ? "Remove image" : "";
    panel.append(redoButton);

    const dragHandle = document.createElement("div");
    dragHandle.dataset.idOverlayPanelDragHandle = "";
    panel.append(dragHandle);

    const status = document.createElement("div");
    status.dataset.idOverlayStatus = "";
    status.textContent = model.state.referenceImageInput ? "Waiting for paste" : "";
    panel.append(status);

    if (model.state.session) {
      const overlay = document.createElement("div");
      overlay.dataset.idOverlayReferenceImage = "";
      overlay.dataset.imageDataRef = model.state.session.referenceImage.imageDataRef;
      document.body.append(overlay);

      const surface = document.createElement("div");
      surface.dataset.idOverlaySurface = "";
      surface.dataset.interactionOwner = model.state.session.mode === "align"
        ? "overlay"
        : "map";
      document.body.append(surface);

      if (model.state.session.mode === "align") {
        for (const pin of model.state.session.registration?.pins ?? []) {
          const pinNode = document.createElement("div");
          pinNode.dataset.idOverlayPin = "";
          pinNode.dataset.pinId = String(pin.id);
          document.body.append(pinNode);
        }
      }
    }
  }

  function currentMode() {
    return model.state.session?.mode ?? "trace";
  }

  function primaryActionLabel() {
    if (model.state.referenceImageInput?.status === "awaiting-paste") {
      return "Cancel paste";
    }
    return "Paste";
  }
}
