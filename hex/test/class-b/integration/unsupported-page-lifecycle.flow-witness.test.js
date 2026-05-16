import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  startExtensionContent,
} from "../../../bootstrap/extension-content.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: unsupported-page detection is browser-shell
// policy. The stable contract is stricter than "no visible UI": unsupported
// pages must not read storage, mount roots, start runtime work, render, or bind
// input listeners.
test("unsupported page performs no extension host work", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "unsupported page performs no extension host work",
  });
  const calls = [];
  const result = await trace.withSource("source.bootstrap-browser-extension", () => (
    bootstrapBrowserExtension({
      pageContext: {
        kind: "unsupported-page",
      },
      durableStatePort: {
        async readDurableState() {
          calls.push("read-durable-state");
          return null;
        },
        async writeDurableState() {
          calls.push("write-durable-state");
        },
      },
      mountOwnedRoot() {
        calls.push("mount-owned-root");
      },
      renderApplicationView() {
        calls.push("render-application-view");
      },
      startRuntime() {
        calls.push("start-runtime");
      },
      bindInputListeners() {
        calls.push("bind-input-listeners");
      },
    })
  ));
  trace.edge(flowEdge("source.bootstrap-browser-extension", "inert.unsupported-page", {
    terminal: "intentionally-inert",
  }));

  assert.deepEqual(result, {
    kind: "unsupported-page",
  });
  assert.deepEqual(calls, []);
  assert.deepEqual(trace.edges, [
    flowEdge("source.bootstrap-browser-extension", "inert.unsupported-page", {
      terminal: "intentionally-inert",
    }),
  ]);
});

// Class-b: the iD editor frame is an observed map surface, not an app host.
// Starting a product runtime inside /id would couple overlay state/lifecycle to
// the map surface being observed and can turn frame-local startup churn into
// product truth.
test("extension content does not bootstrap the app inside the iD frame", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "extension content does not bootstrap the app inside the iD frame",
  });
  const { JSDOM } = await import("jsdom");
  const { window } = new JSDOM("<!doctype html><html><body><div class='main-map'></div></body></html>", {
    url: "https://www.openstreetmap.org/id#map=13/23.1/120.6",
  });
  Object.defineProperty(window.document, "readyState", {
    configurable: true,
    value: "complete",
  });
  const chromeApi = {
    storage: {
      local: {
        async get() {
          throw new Error("iD frame must not read product storage");
        },
      },
    },
  };

  const result = await trace.withSource("source.extension-content-start", () => (
    startExtensionContent({
      location: window.location,
      document: window.document,
      ownerWindow: window,
      chromeApi,
    })
  ));

  assert.equal(result.kind, "unsupported-page");
  assert.equal(window.document.querySelector("#id-overlay"), null);
  trace.edge(flowEdge("source.extension-content-start", "inert.id-frame-app-host", {
    phase: "id-frame-unsupported",
    terminal: "composition-result",
  }));
});
