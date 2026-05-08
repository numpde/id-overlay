import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  deriveTileMapView,
} from "../../src/content/page-adapter/map-view-facts.js";
import { unprojectWorldToLatLon } from "../../src/core/geometry.js";

test("tile map view derivation reads XYZ tile URLs and tile transforms", () => {
  const dom = createTileDom({
    src: "https://tile.openstreetmap.org/3/4/5.png",
    transformCss: "matrix(2, 0, 0, 2, 120, 140)",
  });

  try {
    const mapView = deriveTileMapView({
      viewportDocument: dom.window.document,
      viewportRect: {
        left: 120,
        top: 80,
        width: 800,
        height: 600,
      },
    });
    const expectedCenter = unprojectWorldToLatLon({
      x: 128 - (120 - 400) / 16,
      y: 160 - (140 - 300) / 16,
    });

    assert.equal(mapView.zoom, 4);
    assert.ok(Math.abs(mapView.center.lat - expectedCenter.lat) < 1e-9);
    assert.ok(Math.abs(mapView.center.lon - expectedCenter.lon) < 1e-9);
  } finally {
    dom.window.close();
  }
});

test("tile map view derivation supports Bing quadkey tile URLs", () => {
  const dom = createTileDom({
    src: "https://ecn.t0.tiles.virtualearth.net/tiles/a213.jpeg?g=1",
    transformCss: "matrix(1, 0, 0, 1, 0, 0)",
  });

  try {
    const mapView = deriveTileMapView({
      viewportDocument: dom.window.document,
      viewportRect: {
        left: 0,
        top: 0,
        width: 512,
        height: 512,
      },
    });
    const expectedCenter = unprojectWorldToLatLon({
      x: 128,
      y: 192,
    });

    assert.equal(mapView.zoom, 3);
    assert.ok(Math.abs(mapView.center.lat - expectedCenter.lat) < 1e-9);
    assert.ok(Math.abs(mapView.center.lon - expectedCenter.lon) < 1e-9);
  } finally {
    dom.window.close();
  }
});

test("tile map view derivation rejects missing tiles or invalid transforms", () => {
  const emptyDom = new JSDOM("<!doctype html><html><body></body></html>");
  const invalidTransformDom = createTileDom({
    src: "https://tile.openstreetmap.org/3/4/5.png",
    transformCss: "none",
  });

  try {
    assert.equal(deriveTileMapView({
      viewportDocument: emptyDom.window.document,
      viewportRect: createViewportRect(),
    }), null);
    assert.equal(deriveTileMapView({
      viewportDocument: invalidTransformDom.window.document,
      viewportRect: createViewportRect(),
    }), null);
  } finally {
    emptyDom.window.close();
    invalidTransformDom.window.close();
  }
});

function createTileDom({ src, transformCss }) {
  const dom = new JSDOM(
    `<!doctype html><html><body><img class="tile tile-center" src="${src}"></body></html>`,
    { pretendToBeVisual: true },
  );
  const tile = dom.window.document.querySelector(".tile-center");
  tile.style.transform = transformCss;
  return dom;
}

function createViewportRect() {
  return {
    left: 0,
    top: 0,
    width: 800,
    height: 600,
  };
}
