import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

const BRIDGE_SOURCE = fs.readFileSync(
  new URL("../../../bootstrap/surface-motion-page-bridge.js", import.meta.url),
  "utf8",
);

// Class-b: the page-world bridge crosses the browser execution-world boundary.
// It publishes iD surface motion as data only; extension-content remains the
// sole owner of overlay DOM rendering.
test("surface motion page bridge publishes motion facts without owning overlay DOM", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "surface motion page bridge publishes motion facts without owning overlay DOM",
  });
  const dom = new JSDOM(
    "<!doctype html><html><body><div class='supersurface'></div><div id='id-overlay'></div></body></html>",
    {
      pretendToBeVisual: true,
      runScripts: "dangerously",
      url: "https://www.openstreetmap.org/id#map=10/22.9/120.2",
    },
  );
  const { window } = dom;
  const { document } = window;
  const surface = document.querySelector(".supersurface");
  const host = document.querySelector("#id-overlay");
  const shadowRoot = host.attachShadow({
    mode: "open",
  });
  const mapLayer = document.createElement("div");
  mapLayer.className = "id-overlay-map-layer";
  shadowRoot.append(mapLayer);
  const postedMessages = [];
  window.addEventListener("message", (event) => {
    postedMessages.push(event.data);
  });

  try {
    surface.style.transformOrigin = "0px 0px";
    surface.style.transform = "matrix(1.1, 0, 0, 1.1, 22, -13)";
    window.eval(BRIDGE_SOURCE);
    await waitFor(() => document.documentElement.dataset.idOverlaySurfaceMotion?.includes("matrix(1.1, 0, 0, 1.1, 22, -13)"));
    assert.equal(mapLayer.style.transform, "");

    surface.style.transform = "matrix(1, 0, 0, 1, 0, 0)";
    await waitFor(() => document.documentElement.dataset.idOverlaySurfaceMotion?.includes("matrix(1, 0, 0, 1, 0, 0)"));
    assert.equal(mapLayer.style.transform, "");
    assert.ok(postedMessages.some((message) => (
      message?.source === "id-overlay"
        && message?.type === "id-overlay:surface-motion"
        && message?.surfaceMotion?.transformCss === "matrix(1, 0, 0, 1, 0, 0)"
    )));

    trace.edge(flowEdge("source.page-world-surface-motion", "port.surface-motion-page", {
      phase: "surface-motion-reset",
      provider: "surface-motion-page-bridge",
    }));
    trace.edge(flowEdge("port.surface-motion-page", "sink.surface-motion-artifact", {
      phase: "surface-motion-reset",
      terminal: "published-fact",
    }));
  } finally {
    window.close();
  }
});

// Class-b: the page-world bridge is injected into the page lifetime, so it
// should be driven by DOM/hash/resize evidence instead of an unconditional
// polling interval that the content-session cannot later dispose.
test("surface motion page bridge is event-driven without page-lifetime polling", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "surface motion page bridge is event-driven without page-lifetime polling",
  });
  const dom = new JSDOM(
    "<!doctype html><html><body><div class='supersurface'></div></body></html>",
    {
      pretendToBeVisual: true,
      runScripts: "dangerously",
      url: "https://www.openstreetmap.org/id#map=10/22.9/120.2",
    },
  );
  const { window } = dom;
  const { document } = window;
  const surface = document.querySelector(".supersurface");
  let intervalCount = 0;
  window.setInterval = () => {
    intervalCount += 1;
    return 1;
  };

  try {
    window.eval(BRIDGE_SOURCE);
    surface.style.transform = "matrix(1, 0, 0, 1, 12, -9)";
    await waitFor(() => document.documentElement.dataset.idOverlaySurfaceMotion?.includes("matrix(1, 0, 0, 1, 12, -9)"));

    assert.equal(intervalCount, 0);
    trace.edge(flowEdge("source.page-world-surface-motion-mutation", "port.surface-motion-page", {
      phase: "mutation-driven",
      provider: "surface-motion-page-bridge",
    }));
    trace.edge(flowEdge("port.surface-motion-page", "sink.surface-motion-artifact", {
      phase: "mutation-driven",
      terminal: "published-fact",
    }));
  } finally {
    window.close();
  }
});

async function waitFor(predicate) {
  const deadline = Date.now() + 500;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (predicate()) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  if (lastError) {
    throw lastError;
  }
  assert.ok(predicate(), "condition did not become true before timeout");
}
