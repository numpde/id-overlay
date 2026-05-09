import test from "node:test";
import assert from "node:assert/strict";

import { createDomEnvironment } from "../helpers/dom-env.js";
import { ensureExtensionHost } from "../../src/content/host-lifecycle.js";
import {
  destroyActiveContentSession,
  installContentSession,
} from "../../src/content/content-session.js";

const SESSION_DESTROY_ORDER = [
  "machineHost",
  "panel",
  "overlay",
  "interactionPorts",
  "pageSession",
];

test("content session installs one active beforeunload teardown", () => {
  const env = createDomEnvironment();
  const ownerWindow = createWindowHarness();

  try {
    const destroyed = [];
    const host = ensureExtensionHost({ document: env.document });
    const session = installContentSession({
      host,
      ownerWindow,
      ...createSessionParts({ destroyed }),
    });

    assert.equal(ownerWindow.listenerCount("beforeunload"), 1);
    ownerWindow.dispatch("beforeunload");
    session.destroy();

    assert.deepEqual(destroyed, SESSION_DESTROY_ORDER);
    assert.equal(ownerWindow.listenerCount("beforeunload"), 0);
  } finally {
    env.cleanup();
  }
});

test("content session replacement destroys only the active session", () => {
  const env = createDomEnvironment();
  const ownerWindow = createWindowHarness();

  try {
    const host = ensureExtensionHost({ document: env.document });
    const firstDestroyed = [];
    const secondDestroyed = [];
    const first = installContentSession({
      host,
      ownerWindow,
      ...createSessionParts({ destroyed: firstDestroyed }),
    });
    installContentSession({
      host,
      ownerWindow,
      ...createSessionParts({ destroyed: secondDestroyed }),
    });

    assert.deepEqual(firstDestroyed, SESSION_DESTROY_ORDER);
    assert.equal(ownerWindow.listenerCount("beforeunload"), 1);

    first.destroy();
    destroyActiveContentSession(host);

    assert.deepEqual(firstDestroyed, SESSION_DESTROY_ORDER);
    assert.deepEqual(secondDestroyed, SESSION_DESTROY_ORDER);
    assert.equal(ownerWindow.listenerCount("beforeunload"), 0);
  } finally {
    env.cleanup();
  }
});

function createSessionParts({ destroyed }) {
  return {
    machineHost: createDestroyable("machineHost", destroyed),
    panel: createDestroyable("panel", destroyed),
    overlay: createDestroyable("overlay", destroyed),
    interactionPorts: createDestroyable("interactionPorts", destroyed),
    pageSession: createDestroyable("pageSession", destroyed),
  };
}

function createDestroyable(label, destroyed) {
  return {
    destroy() {
      destroyed.push(label);
    },
  };
}

function createWindowHarness() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener(type, listener) {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
      );
    },
    listenerCount(type) {
      return listeners.get(type)?.length ?? 0;
    },
    dispatch(type) {
      for (const listener of listeners.get(type) ?? []) {
        listener();
      }
    },
  };
}
