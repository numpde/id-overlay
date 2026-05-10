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

const EXTENSION_UI_HOST_SOURCE = hexPath("adapters/ui/extension-ui-host.js");

// Class-b, deliberately not class-a: shadow DOM is a browser-adapter tactic,
// not an eternal architecture law. The stable boundary is that the extension UI
// may style only its owned controls; it must not assert ambient page policy such
// as global backgrounds, root selectors, or a forced page color scheme.
test("extension UI host does not assert ambient page style policy", () => {
  assert.deepEqual(collectAmbientStylePolicyViolations(readSource(EXTENSION_UI_HOST_SOURCE)), []);
});

// Class-b, deliberately not class-a: exact DOM APIs may change if the adapter
// moves to a different renderer. The boundary is stable: mounting extension UI
// must not mutate host document theme/style/class state as a side effect.
test("extension UI host does not mutate document-level style state", () => {
  const { window } = new JSDOM("<!doctype html><html><body></body></html>");
  const document = window.document;
  const uiHost = createExtensionUiHost({
    document,
  });

  uiHost.mountOwnedRoot("id-overlay");

  assert.equal(document.documentElement.getAttribute("style"), null);
  assert.equal(document.documentElement.getAttribute("class"), null);
  assert.equal(document.body.getAttribute("style"), null);
  assert.equal(document.body.getAttribute("class"), null);
});

// Class-b, deliberately not class-a: exact focus restoration may change if the
// UI host gains active onboarding. The stable adapter boundary is passive
// mounting: injecting extension chrome must not steal focus from the map editor.
test("extension UI host does not steal focus during passive mount", () => {
  const { window } = new JSDOM("<!doctype html><body><button id='map-control'>Map</button></body>");
  const button = window.document.getElementById("map-control");
  const uiHost = createExtensionUiHost({
    document: window.document,
  });

  button.focus();
  uiHost.mountOwnedRoot("id-overlay");

  assert.equal(window.document.activeElement, button);
});

function collectAmbientStylePolicyViolations(source) {
  return [
    ...collectStyleTextViolations(source),
    ...collectSourceMutationViolations(source),
  ];
}

function collectStyleTextViolations(source) {
  const styleText = /style\.textContent\s*=\s*`(?<css>[\s\S]*?)`;/u.exec(source)?.groups.css ?? "";
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
