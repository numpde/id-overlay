import test from "node:test";
import assert from "node:assert/strict";

import { createPageAdapterBoundary } from "../../src/content/page-adapter/boundary.js";

test("page adapter boundary returns successful adapter results without logging", () => {
  const logger = createRecordingLogger();
  const runBoundary = createPageAdapterBoundary({ logger });

  const result = runBoundary("screen-to-map", () => {
    return { lat: -1.2, lon: 36.8 };
  });

  assert.deepEqual(result, {
    ok: true,
    value: { lat: -1.2, lon: 36.8 },
  });
  assert.deepEqual(logger.errors, []);
});

test("page adapter boundary logs failing operations and returns failure facts", () => {
  const logger = createRecordingLogger();
  const runBoundary = createPageAdapterBoundary({ logger });
  const error = new Error("projection failed");

  const result = runBoundary("screen-to-map", () => {
    throw error;
  });

  assert.deepEqual(result, {
    ok: false,
    error,
  });
  assert.deepEqual(logger.errors, [
    {
      message: "Page adapter boundary failed",
      meta: { operation: "screen-to-map" },
      error,
    },
  ]);
});

test("page adapter boundary returns failure facts for void operations", () => {
  const logger = createRecordingLogger();
  const runBoundary = createPageAdapterBoundary({ logger });

  const result = runBoundary("end-map-pan", () => {
    throw new Error("mouseup failed");
  });

  assert.equal(result.ok, false);
  assert.equal(logger.errors.length, 1);
  assert.equal(logger.errors[0].meta.operation, "end-map-pan");
});

function createRecordingLogger() {
  return {
    errors: [],
    error(message, meta, error) {
      this.errors.push({ message, meta, error });
    },
  };
}
