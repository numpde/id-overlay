import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { createDomEnvironment } from "../helpers/dom-env.js";
import { createPageAdapter } from "../../src/content/page-adapter.js";
import { unprojectWorldToLatLon } from "../../src/core/transform.js";

test("page adapter uses the viewport element and keeps map/screen projection consistent", () => {
  const env = createDomEnvironment({
    url: "https://www.openstreetmap.org/edit?editor=id#map=16/-1.22645/36.82597",
    viewportHtml: '<div id="map"></div>',
  });

  try {
    const viewport = env.document.getElementById("map");
    viewport.getBoundingClientRect = () => ({
      left: 120,
      top: 80,
      width: 900,
      height: 600,
      right: 1020,
      bottom: 680,
    });

    const adapter = createPageAdapter({
      hashTarget: env.window,
      viewportDocument: env.document,
    });

    assert.equal(adapter.isSupported(), true);
    assert.deepEqual(adapter.getViewportRect(), {
      left: 120,
      top: 80,
      width: 900,
      height: 600,
    });
    assert.deepEqual(adapter.getMapCenter(), {
      lat: -1.22645,
      lon: 36.82597,
    });

    const viewportCenter = { x: 570, y: 380 };
    assert.deepEqual(adapter.mapToScreen(adapter.getMapCenter()), viewportCenter);
    const resolvedCenter = adapter.screenToMap(viewportCenter);
    assert.ok(Math.abs(resolvedCenter.lat - adapter.getMapCenter().lat) < 1e-9);
    assert.ok(Math.abs(resolvedCenter.lon - adapter.getMapCenter().lon) < 1e-9);

    const point = { lat: -1.2259, lon: 36.8271 };
    const projected = adapter.mapToScreen(point);
    const resolved = adapter.screenToMap(projected);
    assert.ok(Math.abs(resolved.lat - point.lat) < 1e-9);
    assert.ok(Math.abs(resolved.lon - point.lon) < 1e-9);

    adapter.destroy();
  } finally {
    env.cleanup();
  }
});

test("page adapter falls back to the window viewport when no map element is present", () => {
  const env = createDomEnvironment({
    url: "https://www.openstreetmap.org/edit?editor=id",
    viewportHtml: "",
  });

  try {
    Object.defineProperty(env.window, "innerWidth", {
      configurable: true,
      value: 1440,
    });
    Object.defineProperty(env.window, "innerHeight", {
      configurable: true,
      value: 900,
    });

    const adapter = createPageAdapter({
      hashTarget: env.window,
      viewportDocument: env.document,
    });

    assert.deepEqual(adapter.getViewportRect(), {
      left: 0,
      top: 0,
      width: 1440,
      height: 900,
    });

    adapter.destroy();
  } finally {
    env.cleanup();
  }
});

test("page adapter prefers the embedded iD iframe for viewport, map view, and surface motion", () => {
  const env = createDomEnvironment({
    url: "https://www.openstreetmap.org/edit?editor=id#map=16/-1.22645/36.82597",
    viewportHtml: '<iframe id="id-embed"></iframe>',
  });
  const innerDom = new JSDOM(
    '<!doctype html><html><body><div class="main-map"></div><div class="supersurface"></div></body></html>',
    {
      url: "https://www.openstreetmap.org/id#map=17/-1.21000/36.83000&background=Bing",
      pretendToBeVisual: true,
    },
  );

  try {
    const frame = env.document.getElementById("id-embed");
    Object.defineProperty(frame, "contentWindow", {
      configurable: true,
      value: innerDom.window,
    });
    Object.defineProperty(frame, "contentDocument", {
      configurable: true,
      value: innerDom.window.document,
    });
    frame.getBoundingClientRect = () => ({
      left: 300,
      top: 40,
      width: 900,
      height: 600,
      right: 1200,
      bottom: 640,
    });

    const viewport = innerDom.window.document.querySelector(".main-map");
    viewport.getBoundingClientRect = () => ({
      left: 20,
      top: 30,
      width: 700,
      height: 500,
      right: 720,
      bottom: 530,
    });

    const surface = innerDom.window.document.querySelector(".supersurface");
    surface.getBoundingClientRect = () => ({
      left: 20,
      top: 30,
      width: 700,
      height: 500,
      right: 720,
      bottom: 530,
    });
    surface.style.transform = "matrix(1, 0, 0, 1, 18, -12)";
    surface.style.transformOrigin = "0px 0px";

    const adapter = createPageAdapter({
      hashTarget: env.window,
      viewportDocument: env.document,
    });

    assert.deepEqual(adapter.getMapCenter(), {
      lat: -1.21,
      lon: 36.83,
    });
    assert.deepEqual(adapter.getViewportRect(), {
      left: 320,
      top: 70,
      width: 700,
      height: 500,
    });
    assert.deepEqual(adapter.getSnapshot().surfaceMotion, {
      transformCss: "matrix(1, 0, 0, 1, 18, -12)",
      transformOriginCss: "0px 0px",
    });

    adapter.destroy();
  } finally {
    innerDom.window.close();
    env.cleanup();
  }
});

test("page adapter derives a more precise map view from rendered tiles when available", () => {
  const env = createDomEnvironment({
    url: "https://www.openstreetmap.org/edit?editor=id#map=16.00/-1.2284/36.8244",
    viewportHtml: '<div class="main-map"></div><img class="tile tile-center" src="https://tile.openstreetmap.org/3/4/5.png">',
  });

  try {
    const viewport = env.document.querySelector(".main-map");
    viewport.getBoundingClientRect = () => ({
      left: 120,
      top: 80,
      width: 800,
      height: 600,
      right: 920,
      bottom: 680,
    });

    const tile = env.document.querySelector(".tile-center");
    tile.style.transform = "matrix(2, 0, 0, 2, 120, 140)";

    const adapter = createPageAdapter({
      hashTarget: env.window,
      viewportDocument: env.document,
    });

    const preciseCenterWorld = {
      x: 128 - (120 - 400) / 16,
      y: 160 - (140 - 300) / 16,
    };
    const preciseCenter = unprojectWorldToLatLon(preciseCenterWorld);

    assert.equal(adapter.getMapView().zoom, 4);
    assert.ok(Math.abs(adapter.getMapCenter().lat - preciseCenter.lat) < 1e-9);
    assert.ok(Math.abs(adapter.getMapCenter().lon - preciseCenter.lon) < 1e-9);

    adapter.destroy();
  } finally {
    env.cleanup();
  }
});

test("page adapter emits subscriber updates immediately when history.replaceState changes the map hash", () => {
  const env = createDomEnvironment({
    url: "https://www.openstreetmap.org/edit?editor=id#map=16/-1.22645/36.82597",
    viewportHtml: '<div id="map"></div>',
  });

  try {
    const viewport = env.document.getElementById("map");
    viewport.getBoundingClientRect = () => ({
      left: 120,
      top: 80,
      width: 900,
      height: 600,
      right: 1020,
      bottom: 680,
    });

    const adapter = createPageAdapter({
      hashTarget: env.window,
      viewportDocument: env.document,
    });
    const centers = [];
    const unsubscribe = adapter.subscribe((snapshot) => {
      centers.push(snapshot.mapView.center);
    });

    env.window.history.replaceState(
      null,
      "",
      "https://www.openstreetmap.org/edit?editor=id#map=16/-1.220000/36.830000",
    );

    assert.ok(centers.length >= 2);
    assert.deepEqual(centers.at(-1), {
      lat: -1.22,
      lon: 36.83,
    });

    unsubscribe();
    adapter.destroy();
  } finally {
    env.cleanup();
  }
});

test("page adapter can forward a shared drag gesture into the active map document", () => {
  const env = createDomEnvironment({
    url: "https://www.openstreetmap.org/edit?editor=id#map=16/-1.22645/36.82597",
    viewportHtml: '<div id="map"></div>',
  });

  try {
    const viewport = env.document.getElementById("map");
    viewport.getBoundingClientRect = () => ({
      left: 120,
      top: 80,
      width: 900,
      height: 600,
      right: 1020,
      bottom: 680,
    });
    viewport.ownerDocument.elementFromPoint = () => viewport;

    const adapter = createPageAdapter({
      hashTarget: env.window,
      viewportDocument: env.document,
    });

    const received = [];
    viewport.addEventListener("mousedown", (event) => {
      received.push({ type: event.type, x: event.clientX, y: event.clientY });
    });
    env.document.addEventListener("mousemove", (event) => {
      received.push({ type: event.type, x: event.clientX, y: event.clientY });
    });
    env.document.addEventListener("mouseup", (event) => {
      received.push({ type: event.type, x: event.clientX, y: event.clientY });
    });

    adapter.beginSharedDrag({ x: 200, y: 180 });
    adapter.updateSharedDrag({ x: 240, y: 210 }, { x: 40, y: 30 });
    adapter.endSharedDrag({ x: 240, y: 210 });

    assert.deepEqual(received, [
      { type: "mousedown", x: 200, y: 180 },
      { type: "mousemove", x: 240, y: 210 },
      { type: "mouseup", x: 240, y: 210 },
    ]);

    adapter.destroy();
  } finally {
    env.cleanup();
  }
});

test("page adapter can forward a shared wheel gesture into the active map document", () => {
  const env = createDomEnvironment({
    url: "https://www.openstreetmap.org/edit?editor=id#map=16/-1.22645/36.82597",
    viewportHtml: '<div id="map"></div>',
  });

  try {
    const viewport = env.document.getElementById("map");
    viewport.getBoundingClientRect = () => ({
      left: 120,
      top: 80,
      width: 900,
      height: 600,
      right: 1020,
      bottom: 680,
    });
    viewport.ownerDocument.elementFromPoint = () => viewport;

    const adapter = createPageAdapter({
      hashTarget: env.window,
      viewportDocument: env.document,
    });

    const received = [];
    viewport.addEventListener("wheel", (event) => {
      received.push({
        type: event.type,
        x: event.clientX,
        y: event.clientY,
        deltaY: event.deltaY,
      });
    });

    const forwarded = adapter.forwardSharedWheel({
      screenPoint: { x: 240, y: 210 },
      deltaY: -100,
    });

    assert.equal(forwarded, true);
    assert.deepEqual(received, [
      { type: "wheel", x: 240, y: 210, deltaY: -100 },
    ]);

    adapter.destroy();
  } finally {
    env.cleanup();
  }
});
