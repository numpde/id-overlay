import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveHashMapView,
} from "../../src/content/page-adapter/map-hash-view.js";

test("hash map view derivation returns a map view fact for valid map hashes", () => {
  assert.deepEqual(deriveHashMapView("#map=16.5/-1.22645/36.82597"), {
    center: {
      lat: -1.22645,
      lon: 36.82597,
    },
    zoom: 16.5,
  });
});

test("hash map view derivation rejects missing or invalid hashes without defaulting", () => {
  assert.equal(deriveHashMapView("#background=Bing"), null);
  assert.equal(deriveHashMapView("#map=x/-1/36"), null);
});
