import test from "node:test";
import assert from "node:assert/strict";

import {
  createClipboardUnavailableFact,
} from "../../src/core/clipboard-facts.js";
import { createContentMachineHostServices } from "../../src/content/content-machine-host-services.js";

test("content machine host services compose persistence, paste, and timer ports", async () => {
  const storage = createStorageHarness();
  const ownerWindow = createOwnerWindowHarness();
  const pageObservation = {
    getSnapshot() {
      throw new Error("paste fallback should not read page context");
    },
  };
  const services = createContentMachineHostServices({
    ownerWindow,
    pageObservation,
    persistence: createPersistenceHarness({ storage }),
    clipboardReader: createClipboardReaderHarness(),
    timerEffects: createTimerEffectsHarness(),
  });

  assert.deepEqual(Object.keys(services), [
    "persistence",
    "pasteEffects",
    "timerEffects",
  ]);
  assert.equal(await services.persistence.loadPersistedSession(), null);
  await services.persistence.savePersistedSession({ mode: "trace" });
  assert.deepEqual(storage.saves, [{ mode: "trace" }]);
  assert.equal(await services.pasteEffects.readPasteImage(), null);
  assert.deepEqual(services.timerEffects.setPanelTimeout(() => {}, { delayMs: 1 }), { delayMs: 1 });
});

function createStorageHarness() {
  const saves = [];
  return {
    saves,
    async load() {
      return null;
    },
    async save(session) {
      saves.push(session);
    },
  };
}

function createPersistenceHarness({ storage }) {
  return {
    loadPersistedSession: () => storage.load(),
    savePersistedSession: (session) => storage.save(session),
  };
}

function createClipboardReaderHarness() {
  return {
    readClipboardApiImage: () => createClipboardUnavailableFact(),
  };
}

function createTimerEffectsHarness() {
  return {
    setPanelTimeout(_callback, { delayMs }) {
      return { delayMs };
    },
    clearPanelTimeout() {},
    setStatusTimeout(_callback, { delayMs }) {
      return { delayMs };
    },
    clearStatusTimeout() {},
  };
}

function createOwnerWindowHarness() {
  return {
    addEventListener() {},
    removeEventListener() {},
  };
}
