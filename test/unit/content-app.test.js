import test from "node:test";
import assert from "node:assert/strict";

import { createDomEnvironment } from "../helpers/dom-env.js";
import { createContentApp } from "../../src/content/content-app.js";

test("content app composes host, machine, UI, and session in dependency order", async () => {
  const env = createDomEnvironment();
  const calls = [];
  const host = env.document.createElement("div");
  const ownerWindow = {};
  const logger = {};
  const keyboardGateway = {};
  const pagePorts = createPagePorts();
  const machineHost = { label: "machineHost" };
  const interactionPorts = {
    overlayInteractionPort: { label: "overlayInteractionPort" },
  };
  const overlay = { label: "overlay" };
  const panel = { label: "panel" };
  const session = { label: "session" };

  try {
    const result = await createContentApp({
      ownerWindow,
      pagePorts,
      keyboardGateway,
      logger,
      deps: {
        ensureExtensionHost() {
          calls.push("ensure-host");
          return host;
        },
        destroyActiveContentSession(actualHost) {
          calls.push(["destroy-active-session", actualHost]);
        },
        async createContentMachineHost(options) {
          calls.push(["create-machine-host", options]);
          return machineHost;
        },
        createInteractionPorts(options) {
          calls.push(["create-interaction-ports", options]);
          return interactionPorts;
        },
        async attachShadowStyles(shadow) {
          calls.push(["attach-shadow-styles", shadow]);
        },
        clearOwnedShadowNodes(shadow) {
          calls.push(["clear-owned-shadow-nodes", shadow]);
        },
        createOverlay(options) {
          calls.push(["create-overlay", options]);
          return overlay;
        },
        createPanel(options) {
          calls.push(["create-panel", options]);
          return panel;
        },
        installContentSession(options) {
          calls.push(["install-session", options]);
          return session;
        },
      },
    });

    const shadow = host.shadowRoot;
    assert.equal(result, session);
    assert.deepEqual(calls, [
      "ensure-host",
      ["destroy-active-session", host],
      ["create-machine-host", {
        ownerWindow,
        pageObservation: pagePorts.pageObservation,
        logger,
      }],
      ["create-interaction-ports", {
        machineHost,
        pageObservation: pagePorts.pageObservation,
        pageProjection: pagePorts.pageProjection,
        mapGesture: pagePorts.mapGesture,
        keyboardGateway,
      }],
      ["attach-shadow-styles", shadow],
      ["clear-owned-shadow-nodes", shadow],
      ["create-overlay", {
        pageObservation: pagePorts.pageObservation,
        pageProjection: pagePorts.pageProjection,
        isForwardedMapGestureEvent: pagePorts.mapGesture.isForwardedMapGestureEvent,
        machineHost,
        overlayInteractions: interactionPorts.overlayInteractionPort,
      }],
      ["create-panel", {
        shadow,
        machineHost,
      }],
      ["install-session", {
        host,
        ownerWindow,
        machineHost,
        panel,
        overlay,
        interactionPorts,
        pageSession: pagePorts.pageSession,
      }],
    ]);
  } finally {
    env.cleanup();
  }
});

test("content app reuses an existing shadow root", async () => {
  const env = createDomEnvironment();

  try {
    const host = env.document.createElement("div");
    const existingShadow = host.attachShadow({ mode: "open" });
    let styleShadow = null;
    await createContentApp({
      ownerWindow: {},
      pagePorts: createPagePorts(),
      deps: createMinimalDeps({
        host,
        attachShadowStyles(shadow) {
          styleShadow = shadow;
        },
      }),
    });

    assert.equal(styleShadow, existingShadow);
    assert.equal(host.shadowRoot, existingShadow);
  } finally {
    env.cleanup();
  }
});

function createPagePorts() {
  return {
    pageSession: { label: "pageSession" },
    pageObservation: { label: "pageObservation" },
    pageProjection: { label: "pageProjection" },
    mapGesture: {
      label: "mapGesture",
      isForwardedMapGestureEvent: () => false,
    },
  };
}

function createMinimalDeps({ host, attachShadowStyles = () => {} }) {
  return {
    ensureExtensionHost: () => host,
    destroyActiveContentSession: () => {},
    createContentMachineHost: async () => ({}),
    createInteractionPorts: () => ({ overlayInteractionPort: {} }),
    attachShadowStyles,
    clearOwnedShadowNodes: () => {},
    createOverlay: () => ({}),
    createPanel: () => ({}),
    installContentSession: () => ({}),
  };
}
