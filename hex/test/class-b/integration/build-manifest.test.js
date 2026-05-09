import test from "node:test";
import assert from "node:assert/strict";

import {
  generateWebAccessibleResources,
} from "../../../bootstrap/web-accessible-resources.js";

// Class-b: extension-loadable resources are derived from the content import
// graph. The manifest must not become a stale manually maintained parallel list.
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
