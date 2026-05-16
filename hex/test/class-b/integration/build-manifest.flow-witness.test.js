import test from "node:test";
import assert from "node:assert/strict";

import {
  generateWebAccessibleResources,
} from "../../../bootstrap/web-accessible-resources.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: deriving extension-loadable resources from
// the import graph is the anti-drift boundary, while the exact returned manifest
// shape is browser packaging policy and may evolve.
test("web accessible resources match the content import graph", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "web accessible resources match the content import graph",
  });

  assert.deepEqual(generateWebAccessibleResources({
    contentEntrypoint: "hex/adapters/extension/content.js",
    importGraph: {
      "hex/adapters/extension/content.js": [
        "hex/adapters/extension/content-loader.js",
        "hex/adapters/ui/panel-adapter.js",
      ],
      "hex/adapters/extension/content-loader.js": [
        "hex/bootstrap/runtime.js",
      ],
      "hex/adapters/ui/panel-adapter.js": [
        "hex/adapters/ui/panel.css",
      ],
      "hex/bootstrap/runtime.js": [],
      "hex/adapters/ui/panel.css": [],
    },
  }), [
    {
      resources: [
        "hex/adapters/extension/content-loader.js",
        "hex/adapters/ui/panel-adapter.js",
        "hex/bootstrap/runtime.js",
        "hex/adapters/ui/panel.css",
      ],
      matches: ["<all_urls>"],
    },
  ]);
  trace.edge(flowEdge("check.web-accessible-resource-graph", "sink.build-artifact", {
    phase: "content-import-graph",
    terminal: "manifest-resource-result",
  }));
});
