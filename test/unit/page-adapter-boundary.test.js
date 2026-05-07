import test from "node:test";
import assert from "node:assert/strict";

import { createPageAdapterBoundary } from "../../src/content/page-adapter/boundary.js";

test("page adapter boundary returns successful adapter results without logging", () => {
  const logger = createRecordingLogger();
  const runBoundary = createPageAdapterBoundary({ logger });

  const result = runBoundary("screen-to-map", () => {
    return { lat: -1.2, lon: 36.8 };
  }, { lat: 0, lon: 0 });

  assert.deepEqual(result, { lat: -1.2, lon: 36.8 });
  assert.deepEqual(logger.errors, []);
});

test("page adapter boundary logs failing operations and returns the explicit fallback value", () => {
  const logger = createRecordingLogger();
  const runBoundary = createPageAdapterBoundary({ logger });
  const error = new Error("projection failed");

  const result = runBoundary("screen-to-map", () => {
    throw error;
  }, { lat: 0, lon: 0 });

  assert.deepEqual(result, { lat: 0, lon: 0 });
  assert.deepEqual(logger.errors, [
    {
      message: "Page adapter boundary failed",
      meta: { operation: "screen-to-map" },
      error,
    },
  ]);
});

test("page adapter boundary returns undefined when a failing operation has no fallback", () => {
  const logger = createRecordingLogger();
  const runBoundary = createPageAdapterBoundary({ logger });

  const result = runBoundary("end-map-pan", () => {
    throw new Error("mouseup failed");
  });

  assert.equal(result, undefined);
  assert.equal(logger.errors.length, 1);
  assert.equal(logger.errors[0].meta.operation, "end-map-pan");
});

test("page adapter boundary treats fallback functions as values, not deferred policy", () => {
  const logger = createRecordingLogger();
  const runBoundary = createPageAdapterBoundary({ logger });
  const fallback = () => ({ x: 0, y: 0 });

  const result = runBoundary("map-to-screen", () => {
    throw new Error("projection failed");
  }, fallback);

  assert.equal(result, fallback);
});

function createRecordingLogger() {
  return {
    errors: [],
    error(message, meta, error) {
      this.errors.push({ message, meta, error });
    },
  };
}
