import test from "node:test";
import assert from "node:assert/strict";

import {
  generateWebAccessibleResources,
} from "../../../bootstrap/web-accessible-resources.js";

// Class-b, not class-a: deriving extension-loadable resources from the import
// graph is the right architecture, but the returned manifest shape is still
// browser packaging policy. This harness prevents a stale parallel resource
// list without freezing every browser-manifest detail forever.
test("web accessible resources match the content import graph", () => {
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
});
