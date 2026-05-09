import test from "node:test";
import assert from "node:assert/strict";

import { createDomEnvironment } from "../helpers/dom-env.js";
import {
  clearActiveSession,
  clearOwnedShadowNodes,
  destroyExistingSession,
  ensureExtensionHost,
  storeActiveSession,
} from "../../src/content/host-lifecycle.js";

test("host lifecycle creates and reuses one extension host", () => {
  const env = createDomEnvironment();

  try {
    const first = ensureExtensionHost({ document: env.document });
    const second = ensureExtensionHost({ document: env.document });

    assert.equal(first, second);
    assert.equal(first.id, "id-overlay-root");
    assert.equal(env.document.querySelectorAll("#id-overlay-root").length, 1);
  } finally {
    env.cleanup();
  }
});

test("host lifecycle destroys and clears only the active session", () => {
  const env = createDomEnvironment();

  try {
    const host = ensureExtensionHost({ document: env.document });
    const destroyed = [];
    const activeSession = {
      destroy() {
        destroyed.push("active");
      },
    };
    const staleSession = {
      destroy() {
        destroyed.push("stale");
      },
    };

    storeActiveSession(host, activeSession);
    destroyExistingSession(host);
    clearActiveSession(host, staleSession);
    destroyExistingSession(host);

    assert.deepEqual(destroyed, ["active"]);
  } finally {
    env.cleanup();
  }
});

test("host lifecycle clears only extension-owned shadow nodes", () => {
  const env = createDomEnvironment();

  try {
    const host = ensureExtensionHost({ document: env.document });
    const shadow = host.attachShadow({ mode: "open" });
    const owned = env.document.createElement("div");
    owned.dataset.idOverlayOwned = "true";
    const foreign = env.document.createElement("div");
    shadow.append(owned, foreign);

    clearOwnedShadowNodes(shadow);

    assert.equal(shadow.contains(owned), false);
    assert.equal(shadow.contains(foreign), true);
  } finally {
    env.cleanup();
  }
});
