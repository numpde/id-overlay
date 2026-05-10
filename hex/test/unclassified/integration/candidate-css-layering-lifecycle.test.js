import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createExtensionUiHost,
} from "../../../adapters/ui/extension-ui-host.js";

// Unclassified: exact CSS can change with the renderer. The stable browser
// behavior is layering and isolation: overlay image input must sit below the
// panel, the panel must stay clickable, and the page must remain themable.
test("candidate: extension shadow CSS isolates UI while layering panel above overlay", () => {
  const { window } = new JSDOM("<!doctype html><html><body></body></html>");
  const host = createExtensionUiHost({
    document: window.document,
  });

  const root = host.mountOwnedRoot("id-overlay");
  const css = root.hostElement.shadowRoot.querySelector("style").textContent;

  assert.match(css, /:host\s*\{[\s\S]*\ball:\s*initial\b/);
  assert.match(css, /\[data-region="overlay"\]\s*\{[\s\S]*\bpointer-events:\s*none\b/);
  assert.ok(
    readZIndex(css, "panel") > readZIndex(css, "overlay"),
    "panel must layer above overlay",
  );
  assert.doesNotMatch(css, /(^|[,{]\s*)(html|body|:root)\b/m);
  assert.doesNotMatch(readCssBlock(css, ":host"), /\bcolor-scheme\s*:/);
});

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
