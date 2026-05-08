import test from "node:test";
import assert from "node:assert/strict";

import {
  parseTileCoordinates,
} from "../../src/content/page-adapter/map-tile-url.js";

test("tile URL parser reads XYZ path tile coordinates", () => {
  assert.deepEqual(parseTileCoordinates("https://tile.openstreetmap.org/3/4/5.png"), {
    zoom: 3,
    x: 4,
    y: 5,
  });
});

test("tile URL parser reads XYZ query tile coordinates", () => {
  assert.deepEqual(parseTileCoordinates("https://tiles.example.test/?z=6&x=7&y=8"), {
    zoom: 6,
    x: 7,
    y: 8,
  });
  assert.deepEqual(parseTileCoordinates("https://tiles.example.test/?zoom=9&tilex=10&tiley=11"), {
    zoom: 9,
    x: 10,
    y: 11,
  });
});

test("tile URL parser reads Bing quadkey tile coordinates", () => {
  assert.deepEqual(parseTileCoordinates("https://ecn.t0.tiles.virtualearth.net/tiles/a213.jpeg?g=1"), {
    zoom: 3,
    x: 3,
    y: 5,
  });
});

test("tile URL parser rejects missing or unsupported tile coordinates", () => {
  assert.equal(parseTileCoordinates(""), null);
  assert.equal(parseTileCoordinates(null), null);
  assert.equal(parseTileCoordinates("https://example.test/tile.png"), null);
});
