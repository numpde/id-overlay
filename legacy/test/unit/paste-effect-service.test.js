import test from "node:test";
import assert from "node:assert/strict";

import {
  createClipboardUnavailableFact,
  createDecodedClipboardImageFact,
} from "../../src/core/clipboard-facts.js";
import { MACHINE_PASTE_READ_OUTCOME_KIND } from "../../src/core/machine/paste-read.js";
import { createPlacementTransform } from "../../src/core/transform.js";
import { createContentPasteEffectService } from "../../src/content/paste-effect-service.js";
import { createDomEnvironment } from "../helpers/dom-env.js";
import { IMAGE } from "../helpers/session-fixtures.js";

const PAGE_CONTEXT = Object.freeze({
  mapView: Object.freeze({
    center: Object.freeze({ lat: 12, lon: 34 }),
    zoom: 5,
  }),
});

test("content paste effect service reads Clipboard API facts into initially placed paste outcomes", async () => {
  const pageObservation = createPageObservation();
  const service = createContentPasteEffectService({
    ownerWindow: createOwnerWindowHarness(),
    pageObservation,
    clipboardReader: createClipboardReaderHarness({
      apiFact: createDecodedClipboardImageFact({ image: IMAGE }),
    }),
  });

  const outcome = await service.readPasteImage();

  assert.equal(outcome.kind, MACHINE_PASTE_READ_OUTCOME_KIND.DECODED_IMAGE);
  assert.deepEqual(outcome.image, IMAGE);
  assert.deepEqual(outcome.placement, createPlacementTransform({
    image: IMAGE,
    centerMapLatLon: PAGE_CONTEXT.mapView.center,
    scale: 1,
    rotationRad: 0,
    zoom: PAGE_CONTEXT.mapView.zoom,
  }));
  assert.equal(pageObservation.callCount, 1);
});

test("content paste effect service leaves unavailable Clipboard API reads as manual fallback", async () => {
  const pageObservation = createPageObservation();
  const service = createContentPasteEffectService({
    ownerWindow: createOwnerWindowHarness(),
    pageObservation,
    clipboardReader: createClipboardReaderHarness({
      apiFact: createClipboardUnavailableFact(),
    }),
  });

  const outcome = await service.readPasteImage();

  assert.equal(outcome, null);
  assert.equal(pageObservation.callCount, 0);
});

test("content paste effect service completes manual paste capture with an initially placed paste outcome", async () => {
  const env = createDomEnvironment();
  const clipboardData = { items: [] };
  const pageObservation = createPageObservation();
  const readDataCalls = [];
  const service = createContentPasteEffectService({
    ownerWindow: env.window,
    pageObservation,
    clipboardReader: createClipboardReaderHarness({
      dataFact: createDecodedClipboardImageFact({ image: IMAGE }),
      onReadData: (data) => readDataCalls.push(data),
    }),
  });

  try {
    const outcomePromise = service.startManualPasteCapture({ requestId: 1 });
    const pasteEvent = createPasteEvent(env.window, clipboardData);

    env.window.dispatchEvent(pasteEvent);
    const outcome = await outcomePromise;

    assert.equal(pasteEvent.defaultPrevented, true);
    assert.deepEqual(readDataCalls, [clipboardData]);
    assert.equal(outcome.kind, MACHINE_PASTE_READ_OUTCOME_KIND.DECODED_IMAGE);
    assert.deepEqual(outcome.placement, createPlacementTransform({
      image: IMAGE,
      centerMapLatLon: PAGE_CONTEXT.mapView.center,
      scale: 1,
      rotationRad: 0,
      zoom: PAGE_CONTEXT.mapView.zoom,
    }));
  } finally {
    env.cleanup();
  }
});

test("content paste effect service replaces manual paste captures atomically", async () => {
  const env = createDomEnvironment();
  const service = createContentPasteEffectService({
    ownerWindow: env.window,
    pageObservation: createPageObservation(),
    clipboardReader: createClipboardReaderHarness(),
  });

  try {
    const firstCapture = service.startManualPasteCapture({ requestId: 1 });
    const secondCapture = service.startManualPasteCapture({ requestId: 2 });

    service.cancelManualPasteCapture({ requestId: 2 });

    assert.equal(await firstCapture, null);
    assert.equal(await secondCapture, null);
  } finally {
    env.cleanup();
  }
});

test("content paste effect service ignores async manual paste results after cancellation", async () => {
  const env = createDomEnvironment();
  const deferredFact = createDeferred();
  const logs = [];
  const readDataCalls = [];
  const service = createContentPasteEffectService({
    ownerWindow: env.window,
    pageObservation: createPageObservation(),
    logger: {
      info: (message) => logs.push(message),
    },
    clipboardReader: createClipboardReaderHarness({
      dataFact: deferredFact.promise,
      onReadData: (data) => readDataCalls.push(data),
    }),
  });

  try {
    const outcomePromise = service.startManualPasteCapture({ requestId: 1 });
    env.window.dispatchEvent(createPasteEvent(env.window, { items: [] }));

    service.cancelManualPasteCapture({ requestId: 1 });
    assert.equal(await outcomePromise, null);

    deferredFact.resolve(createDecodedClipboardImageFact({ image: IMAGE }));
    await flushMicrotasks();

    assert.equal(readDataCalls.length, 1);
    assert.deepEqual(logs, ["Ignoring window paste result because paste capture was cancelled"]);
  } finally {
    env.cleanup();
  }
});

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

function createPasteEvent(ownerWindow, clipboardData) {
  const pasteEvent = new ownerWindow.Event("paste", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(pasteEvent, "clipboardData", {
    value: clipboardData,
  });
  return pasteEvent;
}

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}
