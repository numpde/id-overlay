import test from "node:test";
import assert from "node:assert/strict";

import { createDomEnvironment } from "../helpers/dom-env.js";
import { attachShadowStyles } from "../../src/content/shadow-styles.js";

test("shadow styles attach the extension stylesheet once", async () => {
  const env = createDomEnvironment();

  try {
    const host = env.document.createElement("div");
    env.document.documentElement.append(host);
    const shadow = host.attachShadow({ mode: "open" });

    const firstAttach = attachShadowStyles(shadow);
    shadow.querySelector("link").dispatchEvent(new env.window.Event("load"));
    await firstAttach;
    await attachShadowStyles(shadow);

    const links = shadow.querySelectorAll('link[data-id-overlay-styles="true"]');
    assert.equal(links.length, 1);
    assert.equal(links[0].rel, "stylesheet");
    assert.equal(links[0].getAttribute("href").endsWith("/src/content/content.css"), true);
  } finally {
    env.cleanup();
  }
});
