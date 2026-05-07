import test from "node:test";
import assert from "node:assert/strict";

import {
  createClipboardUnavailableFact,
  createDecodedClipboardImageFact,
} from "../../src/core/clipboard-facts.js";
import { MACHINE_PANEL_INTENT } from "../../src/core/machine/events.js";
import { createEmptyRegistration } from "../../src/core/session.js";
import { createPlacementTransform } from "../../src/core/transform.js";
import { createContentMachineHost } from "../../src/content/content-machine-host.js";
import { createContentPasteEffectService } from "../../src/content/paste-effect-service.js";
import { createDomEnvironment } from "../helpers/dom-env.js";
import {
  IMAGE,
  NORMALIZED_IMAGE,
} from "../helpers/session-fixtures.js";

const PAGE_CONTEXT = Object.freeze({
  mapView: Object.freeze({
    center: Object.freeze({ lat: 12, lon: 34 }),
    zoom: 5,
  }),
});

test("content machine host loads storage and ingests current page context before use", async () => {
  const image = Object.freeze({ src: "data:image/png;base64,abc", width: 400, height: 200 });
  const legacySession = {
    mode: "align",
    opacity: 0.5,
    image,
    placement: {
      centerMapLatLon: { lat: 0, lon: 0 },
      scale: 1,
      rotationRad: 0,
    },
    registration: createEmptyRegistration(),
  };
  const storage = createStorageHarness({ loadedSession: legacySession });
  const pageObservation = createPageObservation();
  const ownerWindow = createOwnerWindowHarness();

  const host = await createContentMachineHost({
    ownerWindow,
    pageObservation,
    storage,
    pasteEffects: createContentPasteEffectService({
      ownerWindow,
      pageObservation,
      clipboardReader: createClipboardReaderHarness(),
    }),
    timers: createTimerHarness(),
  });

  assert.equal(pageObservation.callCount, 1);
  assert.equal(host.getState().session.placement.type, "similarity");
  assert.equal(storage.saves.length, 1);
  assert.equal(storage.saves[0].placement.type, "similarity");
  host.destroy();
});

test("content machine host turns Clipboard API image facts into page-placed machine state", async () => {
  const storage = createStorageHarness();
  const pageObservation = createPageObservation();
  const ownerWindow = createOwnerWindowHarness();
  const host = await createContentMachineHost({
    ownerWindow,
    pageObservation,
    storage,
    pasteEffects: createContentPasteEffectService({
      ownerWindow,
      pageObservation,
      clipboardReader: createClipboardReaderHarness({
        apiFact: createDecodedClipboardImageFact({ image: IMAGE }),
      }),
    }),
    timers: createTimerHarness(),
  });

  host.requestPanelIntent(MACHINE_PANEL_INTENT.PASTE_ARMED);
  await flushEffects();

  assert.deepEqual(host.getState().session.image, NORMALIZED_IMAGE);
  assert.deepEqual(host.getState().session.placement, createPlacementTransform({
    image: NORMALIZED_IMAGE,
    centerMapLatLon: PAGE_CONTEXT.mapView.center,
    scale: 1,
    rotationRad: 0,
    zoom: PAGE_CONTEXT.mapView.zoom,
  }));
  assert.equal(host.getState().panel.intent, MACHINE_PANEL_INTENT.IDLE);
  host.destroy();
});

test("content machine host owns manual paste capture and removes it on destroy", async () => {
  const env = createDomEnvironment();
  const pageObservation = createPageObservation();
  const readDataCalls = [];
  const host = await createContentMachineHost({
    ownerWindow: env.window,
    pageObservation,
    storage: createStorageHarness(),
    pasteEffects: createContentPasteEffectService({
      ownerWindow: env.window,
      pageObservation,
      clipboardReader: createClipboardReaderHarness({
        apiFact: createClipboardUnavailableFact(),
        dataFact: createDecodedClipboardImageFact({ image: IMAGE }),
        onReadData: (clipboardData) => readDataCalls.push(clipboardData),
      }),
    }),
    timers: createTimerHarness(),
  });

  try {
    host.requestPanelIntent(MACHINE_PANEL_INTENT.PASTE_ARMED);
    await flushEffects();
    host.destroy();

    const pasteEvent = new env.window.Event("paste", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: { items: [] },
    });
    env.window.dispatchEvent(pasteEvent);
    await flushEffects();

    assert.deepEqual(readDataCalls, []);
  } finally {
    env.cleanup();
  }
});

test("content machine host completes manual paste captures with page-placed image state", async () => {
  const env = createDomEnvironment();
  const pageObservation = createPageObservation();
  const host = await createContentMachineHost({
    ownerWindow: env.window,
    pageObservation,
    storage: createStorageHarness(),
    pasteEffects: createContentPasteEffectService({
      ownerWindow: env.window,
      pageObservation,
      clipboardReader: createClipboardReaderHarness({
        apiFact: createClipboardUnavailableFact(),
        dataFact: createDecodedClipboardImageFact({ image: IMAGE }),
      }),
    }),
    timers: createTimerHarness(),
  });

  try {
    host.requestPanelIntent(MACHINE_PANEL_INTENT.PASTE_ARMED);
    await flushEffects();

    const pasteEvent = new env.window.Event("paste", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: { items: [] },
    });
    env.window.dispatchEvent(pasteEvent);
    await flushEffects();

    assert.equal(pasteEvent.defaultPrevented, true);
    assert.deepEqual(host.getState().session.image, NORMALIZED_IMAGE);
    assert.equal(host.getState().panel.intent, MACHINE_PANEL_INTENT.IDLE);
    host.destroy();
  } finally {
    env.cleanup();
  }
});

function createStorageHarness({ loadedSession = null } = {}) {
  const saves = [];
  return {
    saves,
    async load() {
      return loadedSession;
    },
    async save(session) {
      saves.push(session);
    },
  };
}

function createPageObservation() {
  let callCount = 0;
  return {
    get callCount() {
      return callCount;
    },
    getSnapshot() {
      callCount += 1;
      return PAGE_CONTEXT;
    },
  };
}

function createClipboardReaderHarness({
  apiFact = createClipboardUnavailableFact(),
  dataFact = createClipboardUnavailableFact(),
  onReadData = null,
} = {}) {
  return {
    async readClipboardApiImage() {
      return apiFact;
    },
    async readClipboardDataImage(clipboardData) {
      onReadData?.(clipboardData);
      return dataFact;
    },
  };
}

function createOwnerWindowHarness() {
  return {
    addEventListener() {},
    removeEventListener() {},
  };
}

function createTimerHarness() {
  return {
    setTimeout(callback, delayMs) {
      return { callback, delayMs };
    },
    clearTimeout() {},
  };
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
