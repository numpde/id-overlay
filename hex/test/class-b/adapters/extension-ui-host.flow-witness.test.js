import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createExtensionUiHost,
} from "../../../adapters/ui/extension-ui-host.js";
import {
  hexPath,
  readSource,
} from "../../class-a/architecture/source-files.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

const EXTENSION_UI_HOST_SOURCE = hexPath("adapters/ui/extension-ui-host.js");
const EXTENSION_UI_ROOT_SOURCE = hexPath("adapters/ui/extension-ui-root.js");
const EXTENSION_UI_STYLES_SOURCE = hexPath("adapters/ui/extension-ui-styles.js");

// Class-b, deliberately not class-a: the exact internal modules may change,
// but the host facade must stay a composition boundary. If it starts creating
// DOM, embedding CSS, constructing panel/overlay adapters, or formatting debug
// summaries directly again, the old mixed-role smell has returned.
test("extension UI host facade delegates concrete UI roles", () => {
  const trace = createExtensionUiHostTrace("extension UI host facade delegates concrete UI roles");
  trace.edge(flowEdge("check.extension-ui-host-role-boundary", "sink.architecture-boundary", {
    terminal: "architecture-check",
  }));

  assert.deepEqual(collectHostFacadeViolations(readSource(EXTENSION_UI_HOST_SOURCE)), []);
  assert.deepEqual(trace.edges, [
    flowEdge("check.extension-ui-host-role-boundary", "sink.architecture-boundary", {
      terminal: "architecture-check",
    }),
  ]);
});

// Class-b, deliberately not class-a: shadow DOM is a browser-adapter tactic,
// not an eternal architecture law. The stable boundary is that the extension UI
// may style only its owned controls; it must not assert ambient page policy such
// as global backgrounds, root selectors, or a forced page color scheme.
test("extension UI host does not assert ambient page style policy", () => {
  const trace = createExtensionUiHostTrace("extension UI host does not assert ambient page style policy");
  trace.edge(flowEdge("check.extension-ui-host-style-policy", "sink.architecture-boundary", {
    terminal: "architecture-check",
  }));

  assert.deepEqual(collectAmbientStylePolicyViolations({
    rootSource: readSource(EXTENSION_UI_ROOT_SOURCE),
    stylesSource: readSource(EXTENSION_UI_STYLES_SOURCE),
  }), []);
  assert.deepEqual(trace.edges, [
    flowEdge("check.extension-ui-host-style-policy", "sink.architecture-boundary", {
      terminal: "architecture-check",
    }),
  ]);
});

// Class-b, deliberately not class-a: exact DOM APIs may change if the adapter
// moves to a different renderer. The boundary is stable: mounting extension UI
// must not mutate host document theme/style/class state as a side effect.
test("extension UI host does not mutate document-level style state", () => {
  const trace = createExtensionUiHostTrace("extension UI host does not mutate document-level style state");
  const { window } = new JSDOM("<!doctype html><html><body></body></html>");
  const document = window.document;
  const uiHost = createExtensionUiHost({
    document,
  });

  trace.withSource("source.extension-ui-host.mount", () => {
    uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
  });

  assert.equal(document.documentElement.getAttribute("style"), null);
  assert.equal(document.documentElement.getAttribute("class"), null);
  assert.equal(document.body.getAttribute("style"), null);
  assert.equal(document.body.getAttribute("class"), null);
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
  ]);
});

// Class-b: the host render boundary receives a complete application view. It
// must not repair a missing overlay input posture because doing so can turn a
// pass-through overlay into an editable one.
test("extension UI host requires explicit overlay input view facts", () => {
  const trace = createExtensionUiHostTrace("extension UI host requires explicit overlay input view facts");
  const { window } = new JSDOM("<!doctype html><body></body>");
  const uiHost = createExtensionUiHost({
    document: window.document,
  });
  const root = uiHost.mountOwnedRoot("id-overlay");
  const incompleteView = createMinimalViewModel();
  delete incompleteView.overlayInput;

  assert.throws(
    () => uiHost.renderApplicationView({
      root,
      view: incompleteView,
      dispatchCommand() {},
      dispatchInteractionFact() {},
    }),
    /view\.overlayInput is required/u,
  );
  trace.edge(flowEdge("source.application-view", "sink.adapter-contract", {
    phase: "missing-overlay-input",
    terminal: "contract-error",
  }));
});

// Class-b, deliberately not class-a: exact focus restoration may change if the
// UI host gains active onboarding. The stable adapter boundary is passive
// mounting: injecting extension chrome must not steal focus from the map editor.
test("extension UI host does not steal focus during passive mount", () => {
  const trace = createExtensionUiHostTrace("extension UI host does not steal focus during passive mount");
  const { window } = new JSDOM("<!doctype html><body><button id='map-control'>Map</button></body>");
  const button = window.document.getElementById("map-control");
  const uiHost = createExtensionUiHost({
    document: window.document,
  });

  button.focus();
  trace.withSource("source.extension-ui-host.mount", () => {
    uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
  });

  assert.equal(window.document.activeElement, button);
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
  ]);
});

// Class-b, deliberately not class-a: exact CSS can change with the renderer.
// The stable host behavior is layering and isolation: overlay image input stays
// below the panel, the panel stays clickable, and host-level CSS does not force
// a page theme.
test("extension UI host layers panel above overlay without page-theme policy", () => {
  const trace = createExtensionUiHostTrace("extension UI host layers panel above overlay without page-theme policy");
  const { window } = new JSDOM("<!doctype html><html><body></body></html>");
  const uiHost = createExtensionUiHost({
    document: window.document,
  });

  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
    return mountedRoot;
  });
  const css = root.hostElement.shadowRoot.querySelector("style").textContent;

  assert.match(css, /:host\s*\{[\s\S]*\ball:\s*initial\b/);
  assert.match(css, /\[data-region="overlay"\]\s*\{[\s\S]*\bpointer-events:\s*none\b/);
  assert.ok(
    readZIndex(css, "panel") > readZIndex(css, "overlay"),
    "panel must layer above overlay",
  );
  assert.doesNotMatch(css, /(^|[,{]\s*)(html|body|:root)\b/m);
  assert.doesNotMatch(readCssBlock(css, ":host"), /\bcolor-scheme\s*:/);
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
  ]);
});

// Class-b: panel chrome persistence is only user-visible if restored screen
// coordinates are applied to the rendered panel container. Storage, clamping,
// and exact panel markup stay outside this host-level assertion.
test("extension UI host applies restored panel screen position to the panel DOM", () => {
  const trace = createExtensionUiHostTrace("extension UI host applies restored panel screen position to the panel DOM");
  const { window } = new JSDOM("<!doctype html><body></body>");
  const uiHost = createExtensionUiHost({
    document: window.document,
  });
  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
    return mountedRoot;
  });

  trace.withSource("source.extension-ui-host.render", () => {
    uiHost.renderApplicationView({
      root,
      panelChrome: {
        position: {
          screenPx: {
            x: 42,
            y: 24,
          },
        },
      },
      view: createMinimalViewModel(),
      dispatchCommand() {},
    });
    trace.edge(flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      terminal: "render-result",
    }));
    trace.edge(flowEdge("source.extension-ui-host.render", "sink.panel-chrome.position", {
      terminal: "shell-preference",
    }));
  });

  assert.equal(root.panel.style.left, "42px");
  assert.equal(root.panel.style.top, "24px");
  assert.equal(root.panel.style.right, "auto");
  assert.equal(root.panel.style.bottom, "auto");
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
    flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      terminal: "render-result",
    }),
    flowEdge("source.extension-ui-host.render", "sink.panel-chrome.position", {
      terminal: "shell-preference",
    }),
  ]);
});

// Class-b: the host wrapper owns fixed screen placement; the rendered panel
// chrome is content inside that wrapper. Reusing the host data-region on the
// inner panel lets wrapper CSS collapse or reposition the panel itself.
test("extension UI host keeps panel wrapper region separate from panel chrome", () => {
  const trace = createExtensionUiHostTrace("extension UI host keeps panel wrapper region separate from panel chrome");
  const { window } = new JSDOM("<!doctype html><body></body>");
  const uiHost = createExtensionUiHost({
    document: window.document,
  });
  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
    return mountedRoot;
  });

  trace.withSource("source.extension-ui-host.render", () => {
    uiHost.renderApplicationView({
      root,
      view: createMinimalViewModel(),
      dispatchCommand() {},
    });
    trace.edge(flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      terminal: "render-result",
    }));
  });

  const innerPanel = root.panel.querySelector(".id-overlay-panel");
  assert.ok(innerPanel, "panel chrome should render inside the host panel wrapper");
  assert.equal(root.panel.dataset.region, "panel");
  assert.equal(innerPanel.getAttribute("data-region"), null);
  assert.equal(root.panel.querySelectorAll("[data-region='panel']").length, 0);
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
    flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      terminal: "render-result",
    }),
  ]);
});

// Class-b: the host wrapper owns fixed screen placement, but the rendered
// header is the browser gesture surface. Dragging that header must cross the UI
// host boundary as shell chrome, not as a product command.
test("extension UI host routes panel header drag to panel chrome", () => {
  const trace = createExtensionUiHostTrace("extension UI host routes panel header drag to panel chrome");
  const { window } = new JSDOM("<!doctype html><body></body>");
  const panelChromeChanges = [];
  const commands = [];
  const uiHost = createExtensionUiHost({
    document: window.document,
  });
  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
    return mountedRoot;
  });

  trace.withSource("source.extension-ui-host.render", () => {
    uiHost.renderApplicationView({
      root,
      view: createMinimalViewModel(),
      dispatchCommand(command) {
        commands.push(command);
      },
      dispatchPanelChromeChange(change) {
        panelChromeChanges.push(change);
        trace.edge(flowEdge("source.panel.drag", "sink.panel-chrome.change", {
          terminal: "shell-preference",
        }));
      },
    });
    trace.edge(flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      terminal: "render-result",
    }));
  });

  const innerPanel = root.panel.querySelector(".id-overlay-panel");
  innerPanel.getBoundingClientRect = () => ({
    left: 728,
    top: 16,
    width: 280,
    height: 220,
    right: 1008,
    bottom: 236,
    x: 728,
    y: 16,
    toJSON() {
      return this;
    },
  });
  trace.withSource("source.panel.drag", () => {
    const header = innerPanel.querySelector(".id-overlay-panel__header");
    header.dispatchEvent(new window.MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 760,
      clientY: 40,
    }));
    window.dispatchEvent(new window.MouseEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 620,
      clientY: 110,
    }));
    assert.equal(innerPanel.classList.contains("id-overlay-panel--dragging"), true);
    window.dispatchEvent(new window.MouseEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 620,
      clientY: 110,
    }));
  });

  assert.deepEqual(commands, []);
  assert.deepEqual(panelChromeChanges, [{
    position: {
      requestedScreenPx: {
        x: 588,
        y: 86,
      },
      panelSizePx: {
        width: 280,
        height: 220,
      },
      viewportPx: {
        width: 1024,
        height: 768,
      },
    },
  }]);
  assert.equal(innerPanel.classList.contains("id-overlay-panel--dragging"), false);
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
    flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      terminal: "render-result",
    }),
    flowEdge("source.panel.drag", "sink.panel-chrome.change", {
      terminal: "shell-preference",
    }),
  ]);
});

// Class-b: page observation can re-render while a browser-owned panel drag is
// still in progress. That render must not reapply stale persisted panel chrome
// over the active local preview; otherwise the panel visibly snaps under the
// pointer and the drag feels slow.
test("extension UI host preserves active panel drag preview across ambient render", () => {
  const trace = createExtensionUiHostTrace("extension UI host preserves active panel drag preview across ambient render");
  const { window } = new JSDOM("<!doctype html><body></body>");
  const panelChromeChanges = [];
  const uiHost = createExtensionUiHost({
    document: window.document,
  });
  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
    return mountedRoot;
  });
  const view = createMinimalViewModel();
  const panelChrome = {
    position: {
      screenPx: {
        x: 728,
        y: 16,
      },
    },
  };

  trace.withSource("source.extension-ui-host.render", () => {
    uiHost.renderApplicationView({
      root,
      panelChrome,
      view,
      dispatchCommand() {},
      dispatchPanelChromeChange(change) {
        panelChromeChanges.push(change);
        trace.edge(flowEdge("source.panel.drag.commit", "sink.panel-chrome.change", {
          terminal: "shell-preference",
        }));
      },
    });
    trace.edge(flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      phase: "initial-panel-chrome",
      terminal: "render-result",
    }));
  });

  const innerPanel = root.panel.querySelector(".id-overlay-panel");
  innerPanel.getBoundingClientRect = () => ({
    left: 728,
    top: 16,
    width: 280,
    height: 220,
    right: 1008,
    bottom: 236,
    x: 728,
    y: 16,
    toJSON() {
      return this;
    },
  });
  const header = innerPanel.querySelector(".id-overlay-panel__header");
  trace.withSource("source.panel.drag.preview", () => {
    header.dispatchEvent(new window.MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 760,
      clientY: 40,
    }));
    window.dispatchEvent(new window.MouseEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 620,
      clientY: 110,
    }));
    trace.edge(flowEdge("source.panel.drag.preview", "sink.panel-dom", {
      phase: "local-preview",
      terminal: "render-result",
    }));
  });
  assert.equal(root.panel.style.left, "588px");
  assert.equal(root.panel.style.top, "86px");
  assert.deepEqual(panelChromeChanges, []);

  trace.withSource("source.page-observation.render", () => {
    uiHost.renderApplicationView({
      root,
      panelChrome,
      view: {
        ...view,
        overlay: visibleOverlay({
          pageSurfaceMotion: {
            transformCss: "matrix(1, 0, 0, 1, 12, 0)",
            transformOriginCss: "0px 0px",
          },
        }),
      },
      dispatchCommand() {},
      dispatchPanelChromeChange(change) {
        panelChromeChanges.push(change);
      },
    });
    trace.edge(flowEdge("source.page-observation.render", "sink.panel-dom", {
      phase: "active-drag-preserved",
      terminal: "render-result",
    }));
  });

  assert.equal(root.panel.style.left, "588px");
  assert.equal(root.panel.style.top, "86px");
  assert.deepEqual(panelChromeChanges, []);

  trace.withSource("source.panel.drag.commit", () => {
    window.dispatchEvent(new window.MouseEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 620,
      clientY: 110,
    }));
  });

  assert.deepEqual(panelChromeChanges, [{
    position: {
      requestedScreenPx: {
        x: 588,
        y: 86,
      },
      panelSizePx: {
        width: 280,
        height: 220,
      },
      viewportPx: {
        width: 1024,
        height: 768,
      },
    },
  }]);
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
    flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      phase: "initial-panel-chrome",
      terminal: "render-result",
    }),
    flowEdge("source.panel.drag.preview", "sink.panel-dom", {
      phase: "local-preview",
      terminal: "render-result",
    }),
    flowEdge("source.page-observation.render", "sink.panel-dom", {
      phase: "active-drag-preserved",
      terminal: "render-result",
    }),
    flowEdge("source.panel.drag.commit", "sink.panel-chrome.change", {
      terminal: "shell-preference",
    }),
  ]);
});

// Class-b: restored or dragged panel chrome is the user's preference; viewport
// resize is environmental pressure. The host must keep the rendered panel
// reachable without rewriting shell preference, and restore the preference when
// the viewport can fit it again.
test("extension UI host keeps panel visible on resize without rewriting panel chrome", () => {
  const trace = createExtensionUiHostTrace("extension UI host keeps panel visible on resize without rewriting panel chrome");
  const { window } = new JSDOM("<!doctype html><body></body>");
  const panelChromeChanges = [];
  const uiHost = createExtensionUiHost({
    document: window.document,
  });
  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
    return mountedRoot;
  });

  trace.withSource("source.extension-ui-host.render", () => {
    uiHost.renderApplicationView({
      root,
      panelChrome: {
        position: {
          screenPx: {
            x: 700,
            y: 500,
          },
        },
      },
      view: createMinimalViewModel(),
      dispatchCommand() {},
      dispatchPanelChromeChange(change) {
        panelChromeChanges.push(change);
      },
    });
    trace.edge(flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      terminal: "render-result",
    }));
  });

  root.panel.getBoundingClientRect = () => ({
    left: Number.parseFloat(root.panel.style.left) || 0,
    top: Number.parseFloat(root.panel.style.top) || 0,
    width: 280,
    height: 220,
    right: (Number.parseFloat(root.panel.style.left) || 0) + 280,
    bottom: (Number.parseFloat(root.panel.style.top) || 0) + 220,
    x: Number.parseFloat(root.panel.style.left) || 0,
    y: Number.parseFloat(root.panel.style.top) || 0,
    toJSON() {
      return this;
    },
  });
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 800,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 600,
  });

  trace.withSource("source.window.resize", () => {
    window.dispatchEvent(new window.Event("resize"));
    trace.edge(flowEdge("source.window.resize", "sink.panel-dom", {
      phase: "clamped-for-small-viewport",
      terminal: "render-result",
    }));
  });

  assert.equal(root.panel.style.left, "520px");
  assert.equal(root.panel.style.top, "380px");

  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1200,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 900,
  });
  trace.withSource("source.window.resize", () => {
    window.dispatchEvent(new window.Event("resize"));
    trace.edge(flowEdge("source.window.resize", "sink.panel-dom", {
      phase: "preferred-position-restored",
      terminal: "render-result",
    }));
  });

  assert.deepEqual(panelChromeChanges, []);
  assert.equal(root.panel.style.left, "700px");
  assert.equal(root.panel.style.top, "500px");
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
    flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      terminal: "render-result",
    }),
    flowEdge("source.window.resize", "sink.panel-dom", {
      phase: "clamped-for-small-viewport",
      terminal: "render-result",
    }),
    flowEdge("source.window.resize", "sink.panel-dom", {
      phase: "preferred-position-restored",
      terminal: "render-result",
    }),
  ]);
});

// Class-b: status text is live UI content, not stored panel chrome. If a long
// status makes a bottom-placed panel taller, the rendered wrapper should slide
// upward just enough to remain reachable while preserving the user's preferred
// chrome position.
test("extension UI host smoothly reclamps bottom panel when status text grows", () => {
  const trace = createExtensionUiHostTrace("extension UI host smoothly reclamps bottom panel when status text grows");
  const { window } = new JSDOM("<!doctype html><body></body>");
  const panelChromeChanges = [];
  const uiHost = createExtensionUiHost({
    document: window.document,
  });
  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
    return mountedRoot;
  });
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 800,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 600,
  });
  root.panel.getBoundingClientRect = () => {
    const top = Number.parseFloat(root.panel.style.top) || 0;
    const height = root.panel.textContent.includes("Click Clear image? again")
      ? 220
      : 80;
    return {
      left: Number.parseFloat(root.panel.style.left) || 0,
      top,
      width: 280,
      height,
      right: (Number.parseFloat(root.panel.style.left) || 0) + 280,
      bottom: top + height,
      x: Number.parseFloat(root.panel.style.left) || 0,
      y: top,
      toJSON() {
        return this;
      },
    };
  };

  trace.withSource("source.extension-ui-host.render", () => {
    uiHost.renderApplicationView({
      root,
      panelChrome: {
        position: {
          screenPx: {
            x: 500,
            y: 500,
          },
        },
      },
      view: createMinimalViewModel({
        status: "Loaded screenshot 640x480.",
      }),
      dispatchCommand() {},
      dispatchPanelChromeChange(change) {
        panelChromeChanges.push(change);
      },
    });
    trace.edge(flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      phase: "short-status",
      terminal: "render-result",
    }));
  });
  assert.equal(root.panel.style.left, "500px");
  assert.equal(root.panel.style.top, "500px");
  assert.equal(root.panel.dataset.idOverlayPanelMotion, "direct");

  trace.withSource("source.extension-ui-host.render", () => {
    uiHost.renderApplicationView({
      root,
      panelChrome: {
        position: {
          screenPx: {
            x: 500,
            y: 500,
          },
        },
      },
      view: createMinimalViewModel({
        status: "Click Clear image? again to remove the current screenshot, placement, and pins.",
      }),
      dispatchCommand() {},
      dispatchPanelChromeChange(change) {
        panelChromeChanges.push(change);
      },
    });
    trace.edge(flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      phase: "long-status",
      terminal: "render-result",
    }));
  });

  assert.equal(root.panel.style.left, "500px");
  assert.equal(root.panel.style.top, "380px");
  assert.equal(root.panel.dataset.idOverlayPanelMotion, "smooth");
  assert.deepEqual(panelChromeChanges, []);
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
    flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      phase: "short-status",
      terminal: "render-result",
    }),
    flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      phase: "long-status",
      terminal: "render-result",
    }),
  ]);
});

// Class-b: resize re-normalization is a browser resource owned by the mounted
// UI host. Disposing the owned root must release that listener with the rest of
// the host chrome.
test("extension UI host removes panel resize listener on dispose", () => {
  const trace = createExtensionUiHostTrace("extension UI host removes panel resize listener on dispose");
  const { window } = new JSDOM("<!doctype html><body></body>");
  const added = [];
  const removed = [];
  const nativeAddEventListener = window.addEventListener.bind(window);
  const nativeRemoveEventListener = window.removeEventListener.bind(window);
  window.addEventListener = (type, listener, options) => {
    if (type === "resize") {
      added.push(type);
    }
    return nativeAddEventListener(type, listener, options);
  };
  window.removeEventListener = (type, listener, options) => {
    if (type === "resize") {
      removed.push(type);
    }
    return nativeRemoveEventListener(type, listener, options);
  };
  const uiHost = createExtensionUiHost({
    document: window.document,
  });
  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
    return mountedRoot;
  });

  trace.withSource("source.extension-ui-host.render", () => {
    uiHost.renderApplicationView({
      root,
      view: createMinimalViewModel(),
      dispatchCommand() {},
      dispatchPanelChromeChange() {},
    });
    trace.edge(flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      terminal: "render-result",
    }));
  });
  trace.withSource("source.extension-ui-host.dispose", () => {
    root.dispose();
    trace.edge(flowEdge("source.extension-ui-host.dispose", "sink.extension-ui-root-disposed", {
      terminal: "shell-resource",
    }));
  });

  assert.deepEqual(added, ["resize"]);
  assert.deepEqual(removed, ["resize"]);
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
    flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      terminal: "render-result",
    }),
    flowEdge("source.extension-ui-host.dispose", "sink.extension-ui-root-disposed", {
      terminal: "shell-resource",
    }),
  ]);
});

// Class-b: extension UI host owns the browser stylesheet that makes the panel
// legible. The panel adapter owns markup; without host CSS, the live page shows
// raw controls and text over the map.
test("extension UI host ships panel chrome styles", () => {
  const trace = createExtensionUiHostTrace("extension UI host ships panel chrome styles");
  const { window } = new JSDOM("<!doctype html><body></body>");
  const uiHost = createExtensionUiHost({
    document: window.document,
  });
  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
    return mountedRoot;
  });
  const css = root.hostElement.shadowRoot.querySelector("style").textContent;

  assert.match(css, /:host\s*>\s*\[data-region="panel"\]\s*\{/);
  assert.doesNotMatch(css, /(^|\n)\s*\[data-region="panel"\]\s*\{/);
  assert.match(css, /\.id-overlay-panel\s*\{[\s\S]*\bbackground\s*:/);
  assert.match(css, /\.id-overlay-panel\s*\{[\s\S]*\bborder\s*:/);
  assert.match(css, /\.id-overlay-panel__controls-row\s*\{/);
  assert.match(css, /\.id-overlay-mode-switch\s*\{/);
  assert.match(css, /\.id-overlay-field__slider\s*\{/);
  assert.ok(
    css.indexOf(".id-overlay-button--confirm:hover:not(:disabled)") >
      css.indexOf(".id-overlay-button--primary:hover:not(:disabled)"),
  );
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
  ]);
});

// Class-b: page observation and overlay projection can refresh while the user
// is pressing a panel button. Those overlay-only renders must not replace panel
// control nodes, otherwise the browser can lose the target before it synthesizes
// the click.
test("extension UI host preserves panel controls across overlay-only refresh", () => {
  const trace = createExtensionUiHostTrace("extension UI host preserves panel controls across overlay-only refresh");
  const { window } = new JSDOM("<!doctype html><body></body>");
  const uiHost = createExtensionUiHost({
    document: window.document,
  });
  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
    return mountedRoot;
  });
  const firstView = createMinimalViewModel({
    overlay: visibleOverlay({
      pageSurfaceMotion: {
        transformCss: "matrix(1, 0, 0, 1, 0, 0)",
        transformOriginCss: "0px 0px",
      },
    }),
  });

  trace.withSource("source.extension-ui-host.render", () => {
    uiHost.renderApplicationView({
      root,
      view: firstView,
      dispatchCommand() {},
      dispatchInteractionFact() {},
    });
    trace.edge(flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      phase: "initial-panel",
      terminal: "render-result",
    }));
    trace.edge(flowEdge("source.extension-ui-host.render", "sink.overlay-dom", {
      phase: "initial-overlay",
      terminal: "render-result",
    }));
  });

  const modeSwitch = root.panel.querySelector("[data-control='mode-switch']");
  assert.ok(modeSwitch, "mode switch must render");

  trace.withSource("source.page-overlay-refresh", () => {
    uiHost.renderApplicationView({
      root,
      view: {
        ...firstView,
        overlay: visibleOverlay({
          pageSurfaceMotion: {
            transformCss: "matrix(1, 0, 0, 1, 16, -8)",
            transformOriginCss: "0px 0px",
          },
        }),
      },
      dispatchCommand() {},
      dispatchInteractionFact() {},
    });
    trace.edge(flowEdge("source.page-overlay-refresh", "sink.overlay-dom", {
      phase: "overlay-only-refresh",
      terminal: "render-result",
    }));
    trace.edge(flowEdge("source.page-overlay-refresh", "sink.panel-dom", {
      phase: "panel-node-preserved",
      terminal: "render-result",
    }));
  });

  assert.equal(root.panel.querySelector("[data-control='mode-switch']"), modeSwitch);
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
    flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      phase: "initial-panel",
      terminal: "render-result",
    }),
    flowEdge("source.extension-ui-host.render", "sink.overlay-dom", {
      phase: "initial-overlay",
      terminal: "render-result",
    }),
    flowEdge("source.page-overlay-refresh", "sink.overlay-dom", {
      phase: "overlay-only-refresh",
      terminal: "render-result",
    }),
    flowEdge("source.page-overlay-refresh", "sink.panel-dom", {
      phase: "panel-node-preserved",
      terminal: "render-result",
    }),
  ]);
});

// Class-b: slider value changes are high-churn mutable panel facts. The host
// must patch the existing opacity input instead of replacing it, otherwise a
// browser drag loses its active target while the user is still moving the thumb.
test("extension UI host patches opacity value without replacing the slider", () => {
  const trace = createExtensionUiHostTrace("extension UI host patches opacity value without replacing the slider");
  const { window } = new JSDOM("<!doctype html><body></body>");
  const uiHost = createExtensionUiHost({
    document: window.document,
  });
  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
    return mountedRoot;
  });
  const firstView = createMinimalViewModel({
    opacityControl: {
      value: 0.6,
      min: 0,
      max: 1,
      step: 0.01,
      enabled: true,
    },
  });

  trace.withSource("source.extension-ui-host.render", () => {
    uiHost.renderApplicationView({
      root,
      view: firstView,
      dispatchCommand() {},
      dispatchInteractionFact() {},
    });
    trace.edge(flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      phase: "initial-opacity",
      terminal: "render-result",
    }));
  });
  const opacity = root.panel.querySelector("[data-control='opacity']");
  assert.ok(opacity, "opacity control must render");

  trace.withSource("source.panel.opacity-rerender", () => {
    uiHost.renderApplicationView({
      root,
      view: {
        ...firstView,
        opacityControl: {
          ...firstView.opacityControl,
          value: 0.25,
        },
      },
      dispatchCommand() {},
      dispatchInteractionFact() {},
    });
    trace.edge(flowEdge("source.panel.opacity-rerender", "sink.panel-dom", {
      phase: "opacity-value-patch",
      terminal: "render-result",
    }));
  });

  assert.equal(root.panel.querySelector("[data-control='opacity']"), opacity);
  assert.equal(opacity.value, "0.25");
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
    flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      phase: "initial-opacity",
      terminal: "render-result",
    }),
    flowEdge("source.panel.opacity-rerender", "sink.panel-dom", {
      phase: "opacity-value-patch",
      terminal: "render-result",
    }),
  ]);
});

// Class-b: button labels, enabled flags, tooltips, and confirmation styling are
// mutable panel affordance facts when the control identity and command boundary
// stay the same. Refreshing them must not replace neighboring active controls.
test("extension UI host patches panel action affordances without replacing controls", () => {
  const trace = createExtensionUiHostTrace("extension UI host patches panel action affordances without replacing controls");
  const { window } = new JSDOM("<!doctype html><body></body>");
  const uiHost = createExtensionUiHost({
    document: window.document,
  });
  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
    return mountedRoot;
  });
  const firstView = createMinimalViewModel({
    primaryAction: {
      kind: "arm-clear-reference-image",
      label: "Clear image",
      enabled: true,
      tone: "normal",
      confirmation: "none",
    },
    centerOverlayInViewAction: {
      kind: "center-overlay-in-view",
      label: "Center overlay in view",
      enabled: false,
      icon: "center-overlay",
    },
    history: {
      undo: {
        enabled: false,
        label: null,
      },
      redo: {
        enabled: false,
        label: null,
      },
    },
  });

  trace.withSource("source.extension-ui-host.render", () => {
    uiHost.renderApplicationView({
      root,
      view: firstView,
      dispatchCommand() {},
      dispatchInteractionFact() {},
    });
    trace.edge(flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      phase: "initial-actions",
      terminal: "render-result",
    }));
  });
  const primary = root.panel.querySelector("[data-control='primary']");
  const centerOverlay = root.panel.querySelector("[data-control='center-overlay']");
  const undo = root.panel.querySelector("[data-control='undo']");
  assert.ok(primary, "primary action must render");
  assert.ok(centerOverlay, "center overlay action must render");
  assert.ok(undo, "undo action must render");

  trace.withSource("source.panel.action-rerender", () => {
    uiHost.renderApplicationView({
      root,
      view: {
        ...firstView,
        primaryAction: {
          kind: "confirm-clear-reference-image",
          label: "Clear image?",
          enabled: true,
          tone: "danger",
          confirmation: "armed",
        },
        centerOverlayInViewAction: {
          ...firstView.centerOverlayInViewAction,
          enabled: true,
        },
        history: {
          ...firstView.history,
          undo: {
            enabled: true,
            label: "Move overlay",
          },
        },
      },
      dispatchCommand() {},
      dispatchInteractionFact() {},
    });
    trace.edge(flowEdge("source.panel.action-rerender", "sink.panel-dom", {
      phase: "affordance-patch",
      terminal: "render-result",
    }));
  });

  assert.equal(root.panel.querySelector("[data-control='primary']"), primary);
  assert.equal(root.panel.querySelector("[data-control='center-overlay']"), centerOverlay);
  assert.equal(root.panel.querySelector("[data-control='undo']"), undo);
  assert.equal(primary.textContent, "Clear image?");
  assert.equal(primary.dataset.actionKind, "confirm-clear-reference-image");
  assert.equal(primary.dataset.tone, "danger");
  assert.equal(primary.dataset.confirmation, "armed");
  assert.equal(primary.classList.contains("id-overlay-button--confirm"), true);
  assert.equal(centerOverlay.disabled, false);
  assert.equal(centerOverlay.title, "Center overlay in view");
  assert.equal(undo.disabled, false);
  assert.equal(undo.title, "Move overlay");
  assert.equal(undo.getAttribute("aria-label"), "Move overlay");
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
    flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      phase: "initial-actions",
      terminal: "render-result",
    }),
    flowEdge("source.panel.action-rerender", "sink.panel-dom", {
      phase: "affordance-patch",
      terminal: "render-result",
    }),
  ]);
});

// Class-b: status copy is mutable panel content. Updating it must not replace
// active controls next to it, but it still has to refresh both visible status
// surfaces so bottom-panel reclamping can respond to the new content height.
test("extension UI host patches status copy without replacing panel controls", () => {
  const trace = createExtensionUiHostTrace("extension UI host patches status copy without replacing panel controls");
  const { window } = new JSDOM("<!doctype html><body></body>");
  const uiHost = createExtensionUiHost({
    document: window.document,
  });
  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
    return mountedRoot;
  });
  const firstView = createMinimalViewModel({
    status: "Loaded screenshot 640x480.",
  });

  trace.withSource("source.extension-ui-host.render", () => {
    uiHost.renderApplicationView({
      root,
      view: firstView,
      dispatchCommand() {},
      dispatchInteractionFact() {},
    });
    trace.edge(flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      phase: "initial-status",
      terminal: "render-result",
    }));
  });
  const opacity = root.panel.querySelector("[data-control='opacity']");
  const status = root.panel.querySelector("[data-region='status']");
  const statusDetail = root.panel.querySelector(".id-overlay-panel__status-detail-surface");
  assert.ok(opacity, "opacity control must render");
  assert.ok(status, "status must render");
  assert.ok(statusDetail, "status detail must render");

  trace.withSource("source.panel.status-rerender", () => {
    uiHost.renderApplicationView({
      root,
      view: {
        ...firstView,
        status: "Click Clear image? again to remove the current screenshot, placement, and pins.",
      },
      dispatchCommand() {},
      dispatchInteractionFact() {},
    });
    trace.edge(flowEdge("source.panel.status-rerender", "sink.panel-dom", {
      phase: "status-text-patch",
      terminal: "render-result",
    }));
  });

  assert.equal(root.panel.querySelector("[data-control='opacity']"), opacity);
  assert.equal(root.panel.querySelector("[data-region='status']"), status);
  assert.equal(root.panel.querySelector(".id-overlay-panel__status-detail-surface"), statusDetail);
  assert.equal(status.textContent, "Click Clear image? again to remove the current screenshot, placement, and pins.");
  assert.equal(statusDetail.textContent, "Click Clear image? again to remove the current screenshot, placement, and pins.");
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
    flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      phase: "initial-status",
      terminal: "render-result",
    }),
    flowEdge("source.panel.status-rerender", "sink.panel-dom", {
      phase: "status-text-patch",
      terminal: "render-result",
    }),
  ]);
});

// Class-b: the title is user-facing state, not static panel chrome. Mode/image
// changes should update the visible heading without rebuilding active controls.
test("extension UI host patches panel title without replacing controls", () => {
  const trace = createExtensionUiHostTrace("extension UI host patches panel title without replacing controls");
  const { window } = new JSDOM("<!doctype html><body></body>");
  const uiHost = createExtensionUiHost({
    document: window.document,
  });
  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
    return mountedRoot;
  });
  const firstView = createMinimalViewModel({
    panelTitle: "Overlay: no image",
  });

  trace.withSource("source.extension-ui-host.render", () => {
    uiHost.renderApplicationView({
      root,
      view: firstView,
      dispatchCommand() {},
      dispatchInteractionFact() {},
    });
    trace.edge(flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      phase: "initial-title",
      terminal: "render-result",
    }));
  });
  const title = root.panel.querySelector(".id-overlay-panel__title");
  const primary = root.panel.querySelector("[data-control='primary']");
  assert.ok(title, "panel title must render");
  assert.ok(primary, "primary action must render");

  trace.withSource("source.panel.title-rerender", () => {
    uiHost.renderApplicationView({
      root,
      view: {
        ...firstView,
        panelTitle: "Overlay: align mode",
      },
      dispatchCommand() {},
      dispatchInteractionFact() {},
    });
    trace.edge(flowEdge("source.panel.title-rerender", "sink.panel-dom", {
      phase: "title-patch",
      terminal: "render-result",
    }));
  });

  assert.equal(root.panel.querySelector(".id-overlay-panel__title"), title);
  assert.equal(root.panel.querySelector("[data-control='primary']"), primary);
  assert.equal(title.textContent, "Overlay: align mode");
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
    flowEdge("source.extension-ui-host.render", "sink.panel-dom", {
      phase: "initial-title",
      terminal: "render-result",
    }),
    flowEdge("source.panel.title-rerender", "sink.panel-dom", {
      phase: "title-patch",
      terminal: "render-result",
    }),
  ]);
});

// Class-b: live map surface motion is high-churn page data. Refreshing that
// fact must patch the existing map layer instead of rebuilding the whole
// overlay subtree and risking flicker, stale nodes, or input teardown.
test("extension UI host patches surface motion without replacing overlay DOM", () => {
  const trace = createExtensionUiHostTrace("extension UI host patches surface motion without replacing overlay DOM");
  const { window } = new JSDOM("<!doctype html><body></body>");
  const uiHost = createExtensionUiHost({
    document: window.document,
  });
  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
    return mountedRoot;
  });
  const firstView = createMinimalViewModel({
    overlay: visibleOverlay({
      pageSurfaceMotion: {
        transformCss: "matrix(1, 0, 0, 1, 0, 0)",
        transformOriginCss: "0px 0px",
      },
    }),
  });

  uiHost.renderApplicationView({
    root,
    view: firstView,
    dispatchCommand() {},
    dispatchInteractionFact() {},
  });
  const overlayRoot = root.overlay.firstElementChild;
  const image = root.overlay.querySelector("[data-overlay-image]");
  const mapLayer = root.overlay.querySelector(".id-overlay-map-layer");
  assert.ok(overlayRoot, "initial overlay root must render");
  assert.ok(image, "initial overlay image must render");
  assert.ok(mapLayer, "initial map layer must render");

  trace.withSource("source.page-surface-motion", () => {
    uiHost.renderApplicationView({
      root,
      view: {
        ...firstView,
        overlay: visibleOverlay({
          pageSurfaceMotion: {
            transformCss: "matrix(1.1, 0, 0, 1.1, 22, -13)",
            transformOriginCss: "0px 0px",
          },
        }),
      },
      dispatchCommand() {},
      dispatchInteractionFact() {},
    });
    trace.edge(flowEdge("source.page-surface-motion", "sink.overlay-dom", {
      phase: "surface-motion-patch",
      terminal: "render-result",
    }));
  });

  assert.equal(root.overlay.firstElementChild, overlayRoot);
  assert.equal(root.overlay.querySelector("[data-overlay-image]"), image);
  assert.equal(root.overlay.querySelector(".id-overlay-map-layer"), mapLayer);
  assert.equal(mapLayer.style.transform, "matrix(1.1, 0, 0, 1.1, 22, -13)");
  assert.equal(mapLayer.style.transformOrigin, "0px 0px");
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
    flowEdge("source.page-surface-motion", "sink.overlay-dom", {
      phase: "surface-motion-patch",
      terminal: "render-result",
    }),
  ]);
});

// Class-b: Align-mode plain drag is a live native-map gesture. The map editor
// can report a new page snapshot after the first forwarded move, so the UI host
// must patch projected overlay geometry without tearing down the active input
// sequence.
test("extension UI host preserves active native-map pan across projected overlay refresh", () => {
  const testName = "extension UI host preserves active native-map pan across projected overlay refresh";
  const trace = createExtensionUiHostTrace(testName);
  const { window } = new JSDOM("<!doctype html><body></body>");
  const interactionFacts = [];
  const interactionFactCounts = new Map();
  const uiHost = createExtensionUiHost({
    document: window.document,
  });
  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
    return mountedRoot;
  });
  const firstView = createMinimalViewModel({
    overlayInput: {
      kind: "overlay-editing",
      canEditOverlay: true,
      arePinsVisible: true,
    },
    overlay: projectedOverlay({
      imageLeft: 110,
      imageTop: 80,
      mapTranslateX: 0,
      mapTranslateY: 0,
    }),
  });

  trace.withSource("source.extension-ui-host.render", () => {
    uiHost.renderApplicationView({
      root,
      view: firstView,
      dispatchCommand() {},
      dispatchInteractionFact(fact) {
        recordNativePanFact({
          fact,
          interactionFacts,
          interactionFactCounts,
          trace,
        });
      },
    });
    trace.edge(flowEdge("source.extension-ui-host.render", "sink.overlay-dom", {
      terminal: "render-result",
    }));
  });

  const overlayRoot = root.overlay.firstElementChild;
  const image = root.overlay.querySelector("[data-overlay-image]");
  assert.ok(overlayRoot, "initial overlay root must render");
  assert.ok(image, "projected overlay image must render");

  trace.withSource("source.overlay.native-pan", () => {
    image.dispatchEvent(new window.MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 220,
      clientY: 180,
    }));
    window.dispatchEvent(new window.MouseEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 232,
      clientY: 184,
    }));
  });

  trace.withSource("source.page-projection-refresh", () => {
    uiHost.renderApplicationView({
      root,
      view: {
        ...firstView,
        overlay: projectedOverlay({
          imageLeft: 118,
          imageTop: 83,
          mapTranslateX: 8,
          mapTranslateY: 3,
        }),
      },
      dispatchCommand() {},
      dispatchInteractionFact(fact) {
        recordNativePanFact({
          fact,
          interactionFacts,
          interactionFactCounts,
          trace,
        });
      },
    });
    trace.edge(flowEdge("source.page-projection-refresh", "sink.overlay-dom", {
      phase: "projection-patch",
      terminal: "render-result",
    }));
  });

  assert.equal(root.overlay.firstElementChild, overlayRoot);
  assert.equal(root.overlay.querySelector("[data-overlay-image]"), image);
  assert.equal(image.style.left, "118px");
  assert.equal(image.style.top, "83px");

  trace.withSource("source.overlay.native-pan", () => {
    window.dispatchEvent(new window.MouseEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 258,
      clientY: 196,
    }));
    window.dispatchEvent(new window.MouseEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 258,
      clientY: 196,
    }));
  });

  assert.deepEqual(interactionFacts, [
    {
      kind: "native-map-gesture-requested",
      gestureKind: "pan",
      phase: "start",
      screenPx: {
        x: 220,
        y: 180,
      },
    },
    {
      kind: "native-map-gesture-requested",
      gestureKind: "pan",
      phase: "move",
      screenPx: {
        x: 232,
        y: 184,
      },
    },
    {
      kind: "native-map-gesture-requested",
      gestureKind: "pan",
      phase: "move",
      screenPx: {
        x: 258,
        y: 196,
      },
    },
    {
      kind: "native-map-gesture-requested",
      gestureKind: "pan",
      phase: "end",
      screenPx: {
        x: 258,
        y: 196,
      },
    },
  ]);
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
    flowEdge("source.extension-ui-host.render", "sink.overlay-dom", {
      terminal: "render-result",
    }),
    flowEdge("source.overlay.native-pan", "callback.interaction-fact.start", {
      provider: "extension-ui-host",
    }),
    flowEdge("callback.interaction-fact.start", "sink.interaction-fact", {
      phase: "start",
      terminal: "interaction-fact",
    }),
    flowEdge("source.overlay.native-pan", "callback.interaction-fact.move", {
      provider: "extension-ui-host",
    }),
    flowEdge("callback.interaction-fact.move", "sink.interaction-fact", {
      phase: "move",
      terminal: "interaction-fact",
    }),
    flowEdge("source.page-projection-refresh", "sink.overlay-dom", {
      phase: "projection-patch",
      terminal: "render-result",
    }),
    flowEdge("source.overlay.native-pan", "callback.interaction-fact.move-2", {
      provider: "extension-ui-host",
      phase: "move-2",
    }),
    flowEdge("callback.interaction-fact.move-2", "sink.interaction-fact", {
      phase: "move-2",
      terminal: "interaction-fact",
    }),
    flowEdge("source.overlay.native-pan", "callback.interaction-fact.end", {
      provider: "extension-ui-host",
    }),
    flowEdge("callback.interaction-fact.end", "sink.interaction-fact", {
      phase: "end",
      terminal: "interaction-fact",
    }),
  ]);
});

// Class-b: rendered overlay input must not stop at DOM paint. The UI host has
// to bind the overlay adapter input surface to the interaction boundary so a
// real browser wheel transform can cross inward as a semantic interaction fact.
test("extension UI host routes rendered overlay modifier wheel gestures to interaction facts", () => {
  const testName = "extension UI host routes rendered overlay modifier wheel gestures to interaction facts";
  const trace = createExtensionUiHostTrace(testName);
  const caseId = "overlay-alt-wheel";
  const { window } = new JSDOM("<!doctype html><body></body>");
  const interactionFacts = [];
  const uiHost = createExtensionUiHost({
    document: window.document,
  });
  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", flowAttrs({
      caseId,
      phase: "mount",
      surface: "extension-ui-host",
      terminal: "shell-resource",
    })));
    return mountedRoot;
  });

  trace.withSource("source.extension-ui-host.render", () => {
    uiHost.renderApplicationView({
      root,
      view: createMinimalViewModel({
        overlayInput: {
          kind: "overlay-editing",
          canEditOverlay: true,
          arePinsVisible: true,
          pointerAffordances: {
            default: "native-map-pan",
            shift: "move-overlay",
            ctrl: "scale-overlay",
            alt: "rotate-overlay",
          },
        },
        overlay: {
          visible: true,
          imageDataRef: "data:image/png;base64,b3ZlcmxheS1pbnB1dA==",
          intrinsicSizePx: {
            width: 640,
            height: 480,
          },
          placement: null,
          opacity: 1,
          pins: [],
        },
      }),
      dispatchCommand() {},
      emitInteractionFact(fact) {
        interactionFacts.push(fact);
        const callbackNode = `callback.interaction-fact.${fact.kind}`;
        trace.edge(flowEdge(trace.activeSource() ?? "source.overlay-input", callbackNode, flowAttrs({
          caseId,
          phase: "alt-wheel",
          surface: "extension-ui-host",
          provider: "overlay-adapter",
        })));
        trace.edge(flowEdge(callbackNode, "sink.interaction-fact", flowAttrs({
          caseId,
          phase: "alt-wheel",
          surface: "extension-ui-host",
          terminal: "interaction-fact",
        })));
      },
    });
    trace.edge(flowEdge("source.extension-ui-host.render", "sink.overlay-dom", flowAttrs({
      caseId,
      phase: "render",
      surface: "extension-ui-host",
      terminal: "render-result",
    })));
  });

  const image = root.overlay.querySelector("[data-overlay-image]");
  assert.ok(image, "loaded overlay must render an image element");
  const wheel = new window.WheelEvent("wheel", {
    altKey: true,
    bubbles: true,
    cancelable: true,
    clientX: 24,
    clientY: 36,
    deltaY: -100,
  });
  trace.withSource("source.overlay.alt-wheel", () => {
    image.dispatchEvent(wheel);
  });

  assert.deepEqual(interactionFacts, [{
    kind: "placement-edit-requested",
    editKind: "rotate",
    inputDelta: {
      y: -100,
    },
    anchorScreenPx: {
      x: 24,
      y: 36,
    },
  }]);
  assert.equal(wheel.defaultPrevented, true);
});

// Class-b: the host-level overlay layer is intentionally click-through so the
// native map remains usable outside the image. The rendered image itself must
// explicitly opt back into hit testing, otherwise the browser paints an inert
// overlay and no user gesture can enter the interaction boundary.
test("extension UI host renders a hit-testable overlay image inside click-through chrome", () => {
  const testName = "extension UI host renders a hit-testable overlay image inside click-through chrome";
  const trace = createExtensionUiHostTrace(testName);
  const { window } = new JSDOM("<!doctype html><body></body>");
  const uiHost = createExtensionUiHost({
    document: window.document,
  });
  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
    return mountedRoot;
  });

  trace.withSource("source.extension-ui-host.render", () => {
    uiHost.renderApplicationView({
      root,
      view: createMinimalViewModel({
        overlayInput: {
          kind: "overlay-editing",
          canEditOverlay: true,
          arePinsVisible: true,
        },
        overlay: {
          visible: true,
          imageDataRef: "data:image/png;base64,aGl0LXRlc3Q=",
          intrinsicSizePx: {
            width: 640,
            height: 480,
          },
          placement: null,
          opacity: 1,
          pins: [],
        },
      }),
      dispatchCommand() {},
      dispatchInteractionFact() {},
    });
    trace.edge(flowEdge("source.extension-ui-host.render", "sink.overlay-dom", {
      terminal: "render-result",
    }));
  });

  const css = root.hostElement.shadowRoot.querySelector("style").textContent;
  const image = root.overlay.querySelector("[data-overlay-image]");

  assert.match(css, /\[data-region="overlay"\]\s*\{[\s\S]*\bpointer-events:\s*none\b/);
  assert.ok(image, "loaded overlay must render an image element");
  assert.equal(image.style.pointerEvents, "auto");
  assert.equal(image.style.touchAction, "none");
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
    flowEdge("source.extension-ui-host.render", "sink.overlay-dom", {
      terminal: "render-result",
    }),
  ]);
});

// Class-b: Trace and temporary native-map access are real browser pass-through
// postures. The overlay remains visible, but its painted image must not become
// the event target and the host must not bind semantic overlay input to it.
test("extension UI host renders native-map overlay posture as paint-only pass-through", () => {
  const testName = "extension UI host renders native-map overlay posture as paint-only pass-through";
  const trace = createExtensionUiHostTrace(testName);
  const { window } = new JSDOM("<!doctype html><body></body>");
  const interactionFacts = [];
  const uiHost = createExtensionUiHost({
    document: window.document,
  });
  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
    return mountedRoot;
  });

  trace.withSource("source.extension-ui-host.render", () => {
    uiHost.renderApplicationView({
      root,
      view: createMinimalViewModel({
        overlayInput: {
          kind: "native-map",
          canEditOverlay: false,
          arePinsVisible: false,
        },
        overlay: {
          visible: true,
          imageDataRef: "data:image/png;base64,cGFpbnQtb25seQ==",
          intrinsicSizePx: {
            width: 640,
            height: 480,
          },
          placement: null,
          opacity: 1,
          pins: [],
        },
      }),
      dispatchCommand() {},
      dispatchInteractionFact(fact) {
        interactionFacts.push(fact);
      },
    });
    trace.edge(flowEdge("source.extension-ui-host.render", "sink.overlay-dom", {
      terminal: "render-result",
    }));
  });

  const image = root.overlay.querySelector("[data-overlay-image]");
  assert.ok(image, "loaded overlay must render an image element");
  assert.equal(image.style.pointerEvents, "none");

  const wheel = new window.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: 24,
    clientY: 36,
    deltaY: -100,
  });
  trace.withSource("source.rendered-overlay.native-map-posture-input", () => {
    image.dispatchEvent(wheel);
    trace.edge(flowEdge("source.rendered-overlay.native-map-posture-input", "sink.native-browser-hit-testing", {
      terminal: "pass-through",
    }));
  });

  assert.deepEqual(interactionFacts, []);
  assert.equal(wheel.defaultPrevented, false);
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
    flowEdge("source.extension-ui-host.render", "sink.overlay-dom", {
      terminal: "render-result",
    }),
    flowEdge("source.rendered-overlay.native-map-posture-input", "sink.native-browser-hit-testing", {
      terminal: "pass-through",
    }),
  ]);
});

// Class-b: the UI host must honor the shell render contract. Overlay gestures
// cannot terminate inside the host because bootstrap provides
// `dispatchInteractionFact`, not the older harness-only callback name.
test("extension UI host routes overlay input through the shell interaction contract", () => {
  const testName = "extension UI host routes overlay input through the shell interaction contract";
  const trace = createExtensionUiHostTrace(testName);
  const { window } = new JSDOM("<!doctype html><body></body>");
  const interactionFacts = [];
  let bubbledToOverlayContainer = 0;
  const uiHost = createExtensionUiHost({
    document: window.document,
  });
  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
    return mountedRoot;
  });
  root.overlay.addEventListener("wheel", () => {
    bubbledToOverlayContainer += 1;
  });

  trace.withSource("source.extension-ui-host.render", () => {
    uiHost.renderApplicationView({
      root,
      view: createMinimalViewModel({
        overlayInput: {
          kind: "overlay-editing",
          canEditOverlay: true,
          arePinsVisible: true,
        },
        overlay: {
          visible: true,
          imageDataRef: "data:image/png;base64,b3ZlcmxheS1pbnB1dA==",
          intrinsicSizePx: {
            width: 640,
            height: 480,
          },
          placement: null,
          opacity: 1,
          pins: [],
        },
      }),
      dispatchCommand() {},
      dispatchInteractionFact(fact) {
        interactionFacts.push(fact);
        trace.edge(flowEdge(trace.activeSource() ?? "source.overlay.plain-wheel", `callback.interaction-fact.${fact.kind}`, {
          provider: "extension-ui-host",
        }));
        trace.edge(flowEdge(`callback.interaction-fact.${fact.kind}`, "sink.interaction-fact", {
          terminal: "interaction-fact",
        }));
      },
    });
    trace.edge(flowEdge("source.extension-ui-host.render", "sink.overlay-dom", {
      terminal: "render-result",
    }));
  });

  const image = root.overlay.querySelector("[data-overlay-image]");
  assert.ok(image, "loaded overlay must render an image element");
  const wheel = new window.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    clientX: 24,
    clientY: 36,
    deltaY: -100,
  });
  trace.withSource("source.overlay.plain-wheel", () => {
    image.dispatchEvent(wheel);
  });

  assert.deepEqual(interactionFacts, [{
    kind: "native-map-gesture-requested",
    gestureKind: "zoom",
    inputDelta: {
      y: -100,
    },
    anchorScreenPx: {
      x: 24,
      y: 36,
    },
  }]);
  assert.equal(wheel.defaultPrevented, true);
  assert.equal(bubbledToOverlayContainer, 0);
});

// Class-b: the application exposes a durable image ref; the UI host is the
// adapter boundary that must resolve it into a display resource before handing
// it to the overlay renderer. Opaque durable refs are intentionally used here
// so this cannot pass by string-shape sniffing a data URL.
test("extension UI host resolves overlay image refs through an explicit display-resource boundary", () => {
  const testName = "extension UI host resolves overlay image refs through an explicit display-resource boundary";
  const trace = createExtensionUiHostTrace(testName);
  const { window } = new JSDOM("<!doctype html><body></body>");
  const resolvedRefs = [];
  const uiHost = createExtensionUiHost({
    document: window.document,
    displayImageResourcePort: {
      resolveDisplayImageUrl({ imageDataRef }) {
        resolvedRefs.push(imageDataRef);
        trace.edge(flowEdge("source.extension-ui-host.render", "port.display-image-resource.resolve", {
          phase: "display-resource-resolution",
          surface: "extension-ui-host",
          provider: "display-resource-resolver",
        }));
        return "blob:https://www.openstreetmap.org/display-resource-1";
      },
    },
  });
  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
    return mountedRoot;
  });

  trace.withSource("source.extension-ui-host.render", () => {
    uiHost.renderApplicationView({
      root,
      view: createMinimalViewModel({
        overlay: {
          visible: true,
          imageDataRef: "reference-image-data-1",
          intrinsicSizePx: {
            width: 640,
            height: 480,
          },
          placement: null,
          opacity: 1,
          pins: [],
        },
      }),
      dispatchCommand() {},
    });
    if (resolvedRefs.length > 0) {
      trace.edge(flowEdge("port.display-image-resource.resolve", "sink.overlay-dom", {
        phase: "display-resource-resolution",
        surface: "extension-ui-host",
        terminal: "render-result",
      }));
    }
  });

  const image = root.overlay.querySelector("[data-overlay-image]");
  assert.deepEqual(resolvedRefs, ["reference-image-data-1"]);
  assert.ok(image, "loaded overlay must render an image element");
  assert.equal(image.dataset.imageDataRef, "reference-image-data-1");
  assert.match(image.style.backgroundImage, /display-resource-1/);
  assert.doesNotMatch(image.style.backgroundImage, /reference-image-data-1/);
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
    flowEdge("source.extension-ui-host.render", "port.display-image-resource.resolve", {
      phase: "display-resource-resolution",
      surface: "extension-ui-host",
      provider: "display-resource-resolver",
    }),
    flowEdge("port.display-image-resource.resolve", "sink.overlay-dom", {
      phase: "display-resource-resolution",
      surface: "extension-ui-host",
      terminal: "render-result",
    }),
  ]);
});

// Class-b: unresolved durable refs remain non-renderable. This keeps the
// display-resource boundary honest: rendering must not fall back to treating an
// arbitrary application image ref as a browser URL.
test("extension UI host does not render unresolved durable image refs as display URLs", () => {
  const trace = createExtensionUiHostTrace("extension UI host does not render unresolved durable image refs as display URLs");
  const { window } = new JSDOM("<!doctype html><body></body>");
  const resolvedRefs = [];
  const uiHost = createExtensionUiHost({
    document: window.document,
    displayImageResourcePort: {
      resolveDisplayImageUrl({ imageDataRef }) {
        resolvedRefs.push(imageDataRef);
        trace.edge(flowEdge("source.extension-ui-host.render", "port.display-image-resource.resolve", {
          phase: "display-resource-unavailable",
          surface: "extension-ui-host",
          provider: "display-resource-resolver",
        }));
        return null;
      },
    },
  });
  const root = trace.withSource("source.extension-ui-host.mount", () => {
    const mountedRoot = uiHost.mountOwnedRoot("id-overlay");
    trace.edge(flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }));
    return mountedRoot;
  });

  trace.withSource("source.extension-ui-host.render", () => {
    uiHost.renderApplicationView({
      root,
      view: createMinimalViewModel({
        overlay: {
          visible: true,
          imageDataRef: "reference-image-data-2",
          intrinsicSizePx: {
            width: 320,
            height: 240,
          },
          placement: null,
          opacity: 1,
          pins: [],
        },
      }),
      dispatchCommand() {},
    });
    if (resolvedRefs.length > 0) {
      trace.edge(flowEdge("port.display-image-resource.resolve", "sink.overlay-dom", {
        phase: "display-resource-unavailable",
        surface: "extension-ui-host",
        terminal: "render-result",
      }));
    }
  });

  const image = root.overlay.querySelector("[data-overlay-image]");
  assert.deepEqual(resolvedRefs, ["reference-image-data-2"]);
  assert.ok(image, "loaded overlay still renders the image box");
  assert.equal(image.style.backgroundImage, "");
  assert.deepEqual(trace.edges, [
    flowEdge("source.extension-ui-host.mount", "sink.extension-ui-root", {
      terminal: "shell-resource",
    }),
    flowEdge("source.extension-ui-host.render", "port.display-image-resource.resolve", {
      phase: "display-resource-unavailable",
      surface: "extension-ui-host",
      provider: "display-resource-resolver",
    }),
    flowEdge("port.display-image-resource.resolve", "sink.overlay-dom", {
      phase: "display-resource-unavailable",
      surface: "extension-ui-host",
      terminal: "render-result",
    }),
  ]);
});

function createExtensionUiHostTrace(test) {
  return createFlowTrace({
    file: import.meta.url,
    test,
  });
}

function flowAttrs({
  caseId,
  phase,
  surface,
  provider,
  terminal,
} = {}) {
  const attributes = {};
  if (caseId !== undefined) {
    attributes.case = caseId;
  }
  if (phase !== undefined) {
    attributes.phase = phase;
  }
  if (surface !== undefined) {
    attributes.surface = surface;
  }
  if (provider !== undefined) {
    attributes.provider = provider;
  }
  if (terminal !== undefined) {
    attributes.terminal = terminal;
  }
  return attributes;
}

function recordNativePanFact({
  fact,
  interactionFacts,
  interactionFactCounts,
  trace,
}) {
  interactionFacts.push(fact);
  const count = (interactionFactCounts.get(fact.phase) ?? 0) + 1;
  interactionFactCounts.set(fact.phase, count);
  const evidencePhase = count === 1 ? fact.phase : `${fact.phase}-${count}`;
  const callbackNode = `callback.interaction-fact.${evidencePhase}`;
  trace.edge(flowEdge(trace.activeSource() ?? "source.overlay.native-pan", callbackNode, {
    provider: "extension-ui-host",
    ...(count === 1 ? {} : {
      phase: evidencePhase,
    }),
  }));
  trace.edge(flowEdge(callbackNode, "sink.interaction-fact", {
    phase: evidencePhase,
    terminal: "interaction-fact",
  }));
}

function collectHostFacadeViolations(source) {
  const violations = [];
  for (const { label, pattern } of [
    {
      label: "direct dom construction",
      pattern: /\bdocument\.createElement\b/u,
    },
    {
      label: "inline stylesheet ownership",
      pattern: /\bstyle\.textContent\b/u,
    },
    {
      label: "direct overlay adapter ownership",
      pattern: /\bcreateOverlayAdapter\b/u,
    },
    {
      label: "direct panel adapter ownership",
      pattern: /\bcreatePanelAdapter\b/u,
    },
    {
      label: "direct debug probe ownership",
      pattern: /\bcreateEventDebugProbe\b/u,
    },
    {
      label: "render signature ownership",
      pattern: /\b(?:overlayStructuralRenderSignature|panelRenderSignature)\b/u,
    },
    {
      label: "debug summary ownership",
      pattern: /\boverlayDomDebugSummary\b/u,
    },
  ]) {
    if (pattern.test(source)) {
      violations.push(label);
    }
  }
  return violations;
}

function collectAmbientStylePolicyViolations({
  rootSource,
  stylesSource,
}) {
  return [
    ...collectStyleTextViolations(stylesSource),
    ...collectSourceMutationViolations(rootSource),
  ];
}

function collectStyleTextViolations(source) {
  const styleText = /EXTENSION_UI_STYLES\s*=\s*`(?<css>[\s\S]*?)`;/u.exec(source)?.groups.css ?? "";
  const violations = [];
  for (const { label, pattern } of [
    {
      label: "host color-scheme",
      pattern: /:host\s*\{[^}]*\bcolor-scheme\s*:/iu,
    },
    {
      label: "page root selector",
      pattern: /(^|[,{]\s*)(html|body|:root)\b/imu,
    },
  ]) {
    if (pattern.test(styleText)) {
      violations.push(label);
    }
  }
  return violations;
}

function collectSourceMutationViolations(source) {
  const violations = [];
  for (const { label, pattern } of [
    {
      label: "document element mutation",
      pattern: /document\.documentElement\.(?:classList|style|setAttribute)\b/u,
    },
    {
      label: "body mutation",
      pattern: /document\.body\.(?:classList|style|setAttribute)\b/u,
    },
  ]) {
    if (pattern.test(source)) {
      violations.push(label);
    }
  }
  return violations;
}

function readZIndex(css, region) {
  const match = new RegExp(`\\[data-region="${region}"\\]\\s*\\{[\\s\\S]*?\\bz-index:\\s*(?<zIndex>\\d+)`, "u")
    .exec(css);
  assert.ok(match, `missing z-index for ${region}`);
  return Number(match.groups.zIndex);
}

function readCssBlock(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`, "u")
    .exec(css)?.groups.body ?? "";
}

function createMinimalViewModel(overrides = {}) {
  return {
    panelTitle: "Overlay: no image",
    primaryAction: {
      label: "Paste",
      enabled: true,
    },
    centerOverlayInViewAction: {
      kind: "center-overlay-in-view",
      label: "Center overlay in view",
      enabled: false,
      icon: "center-overlay",
    },
    centerMapOnOverlayAction: {
      kind: "center-map-on-overlay",
      label: "Center map on overlay",
      enabled: false,
      icon: "center-map",
    },
    modeSwitch: {
      selected: "trace",
      align: {
        enabled: false,
      },
      trace: {
        enabled: false,
      },
    },
    opacityControl: {
      value: 1,
      min: 0,
      max: 1,
      step: 0.01,
      enabled: false,
    },
    history: {
      undo: {
        enabled: false,
        label: null,
      },
      redo: {
        enabled: false,
        label: null,
      },
    },
    status: "",
    overlay: {
      visible: false,
    },
    overlayInput: {
      kind: "native-map",
      canEditOverlay: false,
      arePinsVisible: false,
      pointerAffordances: {
        default: "native-map-pass-through",
      },
    },
    ...overrides,
  };
}

function visibleOverlay(overrides = {}) {
  return {
    visible: true,
    imageDataRef: "data:image/png;base64,cGFuZWwtc3RhYmlsaXR5",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
    placement: null,
    opacity: 1,
    pins: [],
    ...overrides,
  };
}

function projectedOverlay({
  imageLeft,
  imageTop,
  mapTranslateX,
  mapTranslateY,
}) {
  return visibleOverlay({
    viewport: {
      mode: "align",
      isPassThrough: false,
      rect: {
        left: 0,
        top: 55,
        width: 1024,
        height: 713,
      },
    },
    mapLayer: {
      transformCss: `matrix(1, 0, 0, 1, ${mapTranslateX}, ${mapTranslateY})`,
      transformOriginCss: "0px 0px",
    },
    image: {
      src: "blob:https://www.openstreetmap.org/reference-image",
      left: imageLeft,
      top: imageTop,
      width: 320,
      height: 240,
      rotationDeg: 0,
      opacity: 0.72,
    },
    frame: {
      left: imageLeft,
      top: imageTop,
      width: 320,
      height: 240,
      rotationDeg: 0,
      ownsPointerHitTesting: true,
    },
  });
}
