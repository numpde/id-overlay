import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { createDomEnvironment } from "../helpers/dom-env.js";
import {
  createPageAdapter,
  FORWARDED_MAP_GESTURE_EVENT_FLAG,
} from "../../src/content/page-adapter.js";
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
    const snapshot = adapter.getSnapshot();

    assert.equal(adapter.isSupported(), true);
    assert.deepEqual(snapshot.viewportRect, {
      left: 120,
      top: 80,
      width: 900,
      height: 600,
    });
    assert.equal(snapshot.viewportElement, viewport);
    assert.equal(snapshot.mountElement, viewport);
    assert.deepEqual(snapshot.localViewportRect, {
      left: 0,
      top: 0,
      width: 900,
      height: 600,
    });
    assert.deepEqual(snapshot.mapView.center, {
      lat: -1.22645,
      lon: 36.82597,
    });

    const viewportCenter = { x: 570, y: 380 };
    assert.deepEqual(adapter.mapToScreen(snapshot.mapView.center), viewportCenter);
    const resolvedCenter = adapter.screenToMap(viewportCenter);
    assert.ok(Math.abs(resolvedCenter.lat - snapshot.mapView.center.lat) < 1e-9);
    assert.ok(Math.abs(resolvedCenter.lon - snapshot.mapView.center.lon) < 1e-9);

    const point = { lat: -1.2259, lon: 36.8271 };
    const projected = adapter.mapToScreen(point);
    const resolved = adapter.screenToMap(projected);
    assert.ok(Math.abs(resolved.lat - point.lat) < 1e-9);
    assert.ok(Math.abs(resolved.lon - point.lon) < 1e-9);
    assert.deepEqual(
      adapter.screenPointToClient(adapter.clientPointToScreen({ x: 320, y: 260 })),
      { x: 320, y: 260 },
    );

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

    assert.deepEqual(adapter.getSnapshot().viewportRect, {
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
    const snapshot = adapter.getSnapshot();

    assert.deepEqual(snapshot.mapView.center, {
      lat: -1.21,
      lon: 36.83,
    });
    assert.equal(snapshot.viewportElement, viewport);
    assert.equal(snapshot.mountElement, viewport);
    assert.deepEqual(snapshot.viewportRect, {
      left: 320,
      top: 70,
      width: 700,
      height: 500,
    });
    assert.deepEqual(snapshot.localViewportRect, {
      left: 0,
      top: 0,
      width: 700,
      height: 500,
    });
    assert.deepEqual(snapshot.surfaceMotion, {
      transformCss: "matrix(1, 0, 0, 1, 18, -12)",
      transformOriginCss: "0px 0px",
    });
    assert.deepEqual(adapter.clientPointToScreen({ x: 500, y: 200 }), {
      x: 800,
      y: 240,
    });
    assert.deepEqual(adapter.screenPointToClient({ x: 800, y: 240 }), {
      x: 500,
      y: 200,
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

    const snapshot = adapter.getSnapshot();
    assert.equal(snapshot.mapView.zoom, 4);
    assert.ok(Math.abs(snapshot.mapView.center.lat - preciseCenter.lat) < 1e-9);
    assert.ok(Math.abs(snapshot.mapView.center.lon - preciseCenter.lon) < 1e-9);

    adapter.destroy();
  } finally {
    env.cleanup();
  }
});

test("page adapter retains the last coherent map view while live surface motion is active", () => {
  const env = createDomEnvironment({
    url: "https://www.openstreetmap.org/edit?editor=id#map=16.00/-1.2284/36.8244",
    viewportHtml: '<div class="main-map"></div><div class="supersurface"></div><img class="tile tile-center" src="https://tile.openstreetmap.org/3/4/5.png">',
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

    const surface = env.document.querySelector(".supersurface");
    surface.style.transform = "none";
    surface.style.transformOrigin = "0px 0px";

    const tile = env.document.querySelector(".tile-center");
    tile.style.transform = "matrix(2, 0, 0, 2, 120, 140)";

    const adapter = createPageAdapter({
      hashTarget: env.window,
      viewportDocument: env.document,
    });

    const coherentMapView = adapter.getSnapshot().mapView;
    assert.equal(coherentMapView.zoom, 4);

    tile.remove();
    surface.style.transform = "matrix(1.2, 0, 0, 1.2, -40, -30)";

    const retainedMapView = adapter.getSnapshot().mapView;
    assert.deepEqual(retainedMapView, coherentMapView);

    adapter.destroy();
  } finally {
    env.cleanup();
  }
});

test("page adapter keeps the same viewport mount through style churn while it remains visible", () => {
  const env = createDomEnvironment({
    url: "https://www.openstreetmap.org/edit?editor=id#map=16/-1.22645/36.82597",
    viewportHtml: '<div class="main-map"></div><div class="supersurface"></div>',
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

    const surface = env.document.querySelector(".supersurface");
    surface.getBoundingClientRect = () => ({
      left: 100,
      top: 60,
      width: 900,
      height: 700,
      right: 1000,
      bottom: 760,
    });

    const adapter = createPageAdapter({
      hashTarget: env.window,
      viewportDocument: env.document,
    });

    const initialMount = adapter.getSnapshot().mountElement;
    assert.equal(initialMount.classList.contains("main-map"), true);
    assert.equal(initialMount.classList.contains("supersurface"), false);

    surface.style.transform = "matrix(1.1, 0, 0, 1.1, -12, -8)";
    surface.dispatchEvent(new env.window.Event("transitionrun", { bubbles: true }));

    const nextMount = adapter.getSnapshot().mountElement;
    assert.equal(nextMount.classList.contains("main-map"), true);
    assert.equal(nextMount.classList.contains("supersurface"), false);

    adapter.destroy();
  } finally {
    env.cleanup();
  }
});

test("page adapter snapshot changes when the semantic viewport host changes", async () => {
  const env = createDomEnvironment({
    url: "https://www.openstreetmap.org/edit?editor=id#map=16/-1.22645/36.82597",
    viewportHtml: '<div class="main-map"></div><div class="supersurface"></div>',
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

    const surface = env.document.querySelector(".supersurface");
    surface.getBoundingClientRect = () => ({
      left: 120,
      top: 80,
      width: 800,
      height: 600,
      right: 920,
      bottom: 680,
    });

    const adapter = createPageAdapter({
      hashTarget: env.window,
      viewportDocument: env.document,
    });

    const snapshots = [];
    const unsubscribe = adapter.subscribe((snapshot) => {
      snapshots.push(snapshot);
    });

    assert.equal(snapshots.length >= 1, true);
    assert.equal(snapshots.at(-1).mountElement, viewport);

    viewport.remove();
    surface.dispatchEvent(new env.window.Event("transitionrun", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(snapshots.length >= 2, true);
    assert.equal(snapshots.at(-1).mountElement, surface);
    assert.equal(adapter.getSnapshot().mountElement, surface);

    unsubscribe();
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

test("page adapter can begin/update/end a map pan in the active map document", () => {
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
      received.push({
        type: event.type,
        x: event.clientX,
        y: event.clientY,
        forwarded: event[FORWARDED_MAP_GESTURE_EVENT_FLAG] === true,
      });
    });
    env.document.addEventListener("mousemove", (event) => {
      received.push({ type: event.type, x: event.clientX, y: event.clientY });
    });
    env.document.addEventListener("mouseup", (event) => {
      received.push({ type: event.type, x: event.clientX, y: event.clientY });
    });

    adapter.beginMapPan({ x: 200, y: 180 });
    adapter.updateMapPan({ x: 240, y: 210 });
    adapter.endMapPan({ x: 240, y: 210 });

    assert.deepEqual(received, [
      { type: "mousedown", x: 200, y: 180, forwarded: true },
      { type: "mousemove", x: 240, y: 210 },
      { type: "mouseup", x: 240, y: 210 },
    ]);

    adapter.destroy();
  } finally {
    env.cleanup();
  }
});

test("page adapter keeps one iframe-local pan context through begin, move, and end", () => {
  const env = createDomEnvironment({
    url: "https://www.openstreetmap.org/edit?editor=id#map=16/-1.22645/36.82597",
    viewportHtml: '<iframe id="id-embed"></iframe>',
  });
  const innerDom = new JSDOM(
    '<!doctype html><html><body><div class="main-map"></div></body></html>',
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

    const adapter = createPageAdapter({
      hashTarget: env.window,
      viewportDocument: env.document,
    });

    const received = [];
    viewport.addEventListener("mousedown", (event) => {
      received.push({ type: event.type, x: event.clientX, y: event.clientY });
    });
    innerDom.window.document.addEventListener("mousemove", (event) => {
      received.push({ type: event.type, x: event.clientX, y: event.clientY });
    });
    innerDom.window.document.addEventListener("mouseup", (event) => {
      received.push({ type: event.type, x: event.clientX, y: event.clientY });
    });

    adapter.beginMapPan({ x: 800, y: 240 });
    adapter.updateMapPan({ x: 820, y: 260 });
    adapter.endMapPan({ x: 820, y: 260 });

    assert.deepEqual(received, [
      { type: "mousedown", x: 500, y: 200 },
      { type: "mousemove", x: 520, y: 220 },
      { type: "mouseup", x: 520, y: 220 },
    ]);

    adapter.destroy();
  } finally {
    innerDom.window.close();
    env.cleanup();
  }
});

test("page adapter map pan skips overlay hit-testing and always targets the map viewport", () => {
  const env = createDomEnvironment({
    url: "https://www.openstreetmap.org/edit?editor=id#map=16/-1.22645/36.82597",
    viewportHtml: [
      '<div id="map"></div>',
      '<div id="feature"></div>',
      '<div id="overlay" data-id-overlay-owned="true"><img id="overlay-image"></div>',
    ].join(""),
  });

  try {
    const viewport = env.document.getElementById("map");
    const overlayImage = env.document.getElementById("overlay-image");
    const feature = env.document.getElementById("feature");
    viewport.getBoundingClientRect = () => ({
      left: 120,
      top: 80,
      width: 900,
      height: 600,
      right: 1020,
      bottom: 680,
    });
    env.document.elementsFromPoint = () => [overlayImage, feature, viewport];
    env.document.elementFromPoint = () => feature;

    const adapter = createPageAdapter({
      hashTarget: env.window,
      viewportDocument: env.document,
    });

    const received = [];
    viewport.addEventListener("mousedown", (event) => {
      received.push({
        type: event.type,
        x: event.clientX,
        y: event.clientY,
        forwarded: event[FORWARDED_MAP_GESTURE_EVENT_FLAG] === true,
      });
    });
    feature.addEventListener("mousedown", () => {
      received.push({
        type: "feature-mousedown",
      });
    });

    const started = adapter.beginMapPan({ x: 200, y: 180 });

    assert.equal(started, true);
    assert.deepEqual(received, [
      { type: "mousedown", x: 200, y: 180, forwarded: true },
    ]);

    adapter.destroy();
  } finally {
    env.cleanup();
  }
});

test("page adapter can forward a map zoom gesture into the active map document", () => {
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
        forwarded: event[FORWARDED_MAP_GESTURE_EVENT_FLAG] === true,
      });
    });

    const forwarded = adapter.forwardMapZoom({
      screenPoint: { x: 240, y: 210 },
      deltaY: -100,
    });

    assert.equal(forwarded, true);
    assert.deepEqual(received, [
      { type: "wheel", x: 240, y: 210, deltaY: -100, forwarded: true },
    ]);

    adapter.destroy();
  } finally {
    env.cleanup();
  }
});

test("page adapter map zoom skips extension-owned overlay elements and targets the underlying map", () => {
  const env = createDomEnvironment({
    url: "https://www.openstreetmap.org/edit?editor=id#map=16/-1.22645/36.82597",
    viewportHtml: '<div id="map"></div><div id="overlay" data-id-overlay-owned="true"><img id="overlay-image"></div>',
  });

  try {
    const viewport = env.document.getElementById("map");
    const overlayImage = env.document.getElementById("overlay-image");
    viewport.getBoundingClientRect = () => ({
      left: 120,
      top: 80,
      width: 900,
      height: 600,
      right: 1020,
      bottom: 680,
    });
    env.document.elementsFromPoint = () => [overlayImage, viewport];
    env.document.elementFromPoint = () => overlayImage;

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

    const forwarded = adapter.forwardMapZoom({
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
