import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  parseTileMatrixTransform,
} from "../../src/content/page-adapter/map-tile-transform.js";

test("tile transform parser extracts 2d scale and translation", () => {
  const dom = createTileDom("matrix(3, 4, 0, 3, 120, 140)");

  try {
    assert.deepEqual(parseTileMatrixTransform(dom.window.document.querySelector(".tile")), {
      scale: 5,
      tx: 120,
      ty: 140,
    });
  } finally {
    dom.window.close();
  }
});

test("tile transform parser rejects unsupported or invalid transforms", () => {
  for (const transformCss of ["none", "matrix(1, 2, 3)", "matrix(1, 0, 0, 1, x, 2)"]) {
    const dom = createTileDom(transformCss);
    try {
      assert.equal(parseTileMatrixTransform(dom.window.document.querySelector(".tile")), null);
    } finally {
      dom.window.close();
    }
  }
});

function createTileDom(transformCss) {
  const dom = new JSDOM(
    '<!doctype html><html><body><img class="tile"></body></html>',
    { pretendToBeVisual: true },
  );
  dom.window.document.querySelector(".tile").style.transform = transformCss;
  return dom;
}
