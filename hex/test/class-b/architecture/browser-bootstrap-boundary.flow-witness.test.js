import test from "node:test";
import assert from "node:assert/strict";
import {
  hexPath,
  listJavaScriptFiles,
  readSource,
  relativeToRepo,
} from "../../class-a/architecture/source-files.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

const EXTENSION_CONTENT_SOURCE = hexPath("bootstrap/extension-content.js");
const PAGE_DOM_READER_SOURCE = hexPath("adapters/page-osm-id/page-dom-reader.js");
const PAGE_OBSERVATION_RUNTIME_SOURCE = hexPath("adapters/page-osm-id/page-observation-runtime.js");
const MAP_STATE_DEBUG_PROBE_SOURCE = hexPath("adapters/page-osm-id/map-state-debug-probe.js");
const NATIVE_MAP_GESTURE_FORWARDER_SOURCE = hexPath("adapters/page-osm-id/native-map-gesture-forwarder.js");
const NATIVE_MAP_WHEEL_SUPPRESSION_SOURCE = hexPath("adapters/page-osm-id/native-map-wheel-suppression.js");

// Class-b: browser entrypoint lifecycle is shell behavior, not product law. The
// extension bootstrap should wait for DOM readiness before mounting visible UI
// when the content script evaluates while the document is still loading.
test("extension content queues bootstrap until DOMContentLoaded while the document is loading", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "extension content queues bootstrap until DOMContentLoaded while the document is loading",
  });
  const source = readSource(EXTENSION_CONTENT_SOURCE);

  assert.match(source, /\bdocument\.readyState\b/);
  assert.match(source, /DOMContentLoaded/);
  assert.match(source, /\baddEventListener\s*\(\s*["']DOMContentLoaded["']/);
  trace.edge(flowEdge("check.extension-content-readiness", "sink.architecture-boundary", {
    terminal: "architecture-check",
  }));
});

// Class-b: browser content scripts can be reinjected. The entrypoint should
// share one in-flight bootstrap per page context instead of starting duplicate
// runtimes or injecting duplicate owned roots.
test("extension content shares one in-flight bootstrap across repeated entrypoint evaluation", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "extension content shares one in-flight bootstrap across repeated entrypoint evaluation",
  });
  const source = readSource(EXTENSION_CONTENT_SOURCE);

  assert.match(source, /inFlight|bootstrapped|bootstrapPromise|idOverlayBootstrap/i);
  assert.match(source, /ownerWindow|window|globalThis/);
  trace.edge(flowEdge("check.extension-content-idempotence", "sink.architecture-boundary", {
    terminal: "architecture-check",
  }));
});

// Class-b: a failed bootstrap should not poison the page for the rest of the
// tab lifetime. Once the failed in-flight state is cleared, a later content
// script evaluation can retry.
test("extension content clears failed bootstrap state so later evaluation can retry", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "extension content clears failed bootstrap state so later evaluation can retry",
  });
  const source = readSource(EXTENSION_CONTENT_SOURCE);

  assert.match(source, /\.catch\s*\(/);
  assert.match(source, /inFlight\s*=\s*null|bootstrapPromise\s*=\s*null|delete\s+.*idOverlayBootstrap/i);
  trace.edge(flowEdge("check.extension-content-retry", "sink.architecture-boundary", {
    terminal: "architecture-check",
  }));
});

// Class-b, deliberately not class-a: this is a source-level anti-regression
// guard around a still-thin composition layer. The no-regret boundary is narrow:
// bootstrap may wire ports and application functions, but it must not recreate
// product state shape or own user-facing product copy.
test("bootstrap source does not define product state or product copy", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "bootstrap source does not define product state or product copy",
  });
  assert.deepEqual(collectPatternViolations([
    {
      label: "inline product state shape",
      pattern: /\b(session|referenceImage|registration|placement|history|notice|inputOverride|mode|pins)\s*:/,
    },
    {
      label: "product copy",
      pattern: /["'`][^"'`]*(?:Paste|Clear image|Clear pins|Trace|Align|Reload image|No image|Paste cancelled)[^"'`]*["'`]/i,
    },
  ]), []);
  trace.edge(flowEdge("check.bootstrap-product-boundary", "sink.architecture-boundary", {
    terminal: "architecture-check",
  }));
});

// Class-b: this is an adapter-ownership boundary. Browser bootstrap should
// compose the OpenStreetMap page reader, while map DOM interpretation lives in
// the page adapter where selectors, tile facts, and surface motion can evolve
// together.
test("browser bootstrap delegates OpenStreetMap page DOM reading to the page adapter", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser bootstrap delegates OpenStreetMap page DOM reading to the page adapter",
  });
  const bootstrapSource = readSource(EXTENSION_CONTENT_SOURCE);
  const readerSource = readSource(PAGE_DOM_READER_SOURCE);

  assert.match(bootstrapSource, /from\s+["']\.\.\/adapters\/page-osm-id\/page-dom-reader\.js["']/);
  assert.doesNotMatch(bootstrapSource, /\bfunction\s+(?:readOpenStreetMapPage|readEmbeddedEditorFrame|readSurfaceMotion|findViewportElement)\b/);
  assert.match(readerSource, /\bexport\s+function\s+readOpenStreetMapPage\b/);
  assert.match(readerSource, /\bexport\s+function\s+findViewportElement\b/);
  assert.match(readerSource, /\bexport\s+function\s+readSurfaceMotion\b/);
  trace.edge(flowEdge("check.bootstrap-page-dom-reader-delegation", "sink.architecture-boundary", {
    terminal: "architecture-check",
  }));
});

// Class-b: page observation is browser adapter mechanics. Bootstrap should
// subscribe to it, but DOM mutation observers, polling signatures, and
// coalescing policy belong with the OpenStreetMap page adapter.
test("browser bootstrap delegates page observation lifecycle to the page adapter", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser bootstrap delegates page observation lifecycle to the page adapter",
  });
  const bootstrapSource = readSource(EXTENSION_CONTENT_SOURCE);
  const observationSource = readSource(PAGE_OBSERVATION_RUNTIME_SOURCE);

  assert.match(bootstrapSource, /from\s+["']\.\.\/adapters\/page-osm-id\/page-observation-runtime\.js["']/);
  assert.doesNotMatch(bootstrapSource, /\bfunction\s+(?:observePageSnapshots|observationSignature|shouldDeferPolledObservationChange|queueObservationForWindow)\b/);
  assert.match(observationSource, /\bexport\s+function\s+observePageSnapshots\b/);
  assert.match(observationSource, /\bexport\s+function\s+readableObservationDocuments\b/);
  assert.match(observationSource, /\bMutationObserver\b/);
  trace.edge(flowEdge("check.bootstrap-page-observation-delegation", "sink.architecture-boundary", {
    terminal: "architecture-check",
  }));
});

// Class-b: map-state console tracing is diagnostic adapter behavior. Bootstrap
// may install the probe, but it should not own polling snapshots or debug
// formatting for observed map documents.
test("browser bootstrap delegates map-state debug probing to the page adapter", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser bootstrap delegates map-state debug probing to the page adapter",
  });
  const bootstrapSource = readSource(EXTENSION_CONTENT_SOURCE);
  const debugProbeSource = readSource(MAP_STATE_DEBUG_PROBE_SOURCE);

  assert.match(bootstrapSource, /from\s+["']\.\.\/adapters\/page-osm-id\/map-state-debug-probe\.js["']/);
  assert.doesNotMatch(bootstrapSource, /\bfunction\s+(?:installMapStateDebugProbe|mapDebugSnapshot|parseDebugMapView)\b/);
  assert.match(debugProbeSource, /\bexport\s+function\s+installMapStateDebugProbe\b/);
  assert.match(debugProbeSource, /\bmapDebugSnapshot\b/);
  assert.match(debugProbeSource, /\bzoom-changed\b/);
  trace.edge(flowEdge("check.bootstrap-map-state-debug-delegation", "sink.architecture-boundary", {
    terminal: "architecture-check",
  }));
});

// Class-b: native-map interaction is page adapter behavior. Bootstrap should
// forward semantic gesture facts, but iframe hit testing, forwarded DOM events,
// extension-owned target filtering, and pan/wheel suppression belong at the
// OpenStreetMap page boundary.
test("browser bootstrap delegates native-map interaction mechanics to the page adapter", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser bootstrap delegates native-map interaction mechanics to the page adapter",
  });
  const bootstrapSource = readSource(EXTENSION_CONTENT_SOURCE);
  const nativeMapGestureSource = readSource(NATIVE_MAP_GESTURE_FORWARDER_SOURCE);
  const nativeMapWheelSource = readSource(NATIVE_MAP_WHEEL_SUPPRESSION_SOURCE);

  assert.match(bootstrapSource, /from\s+["']\.\.\/adapters\/page-osm-id\/native-map-gesture-forwarder\.js["']/);
  assert.match(bootstrapSource, /from\s+["']\.\.\/adapters\/page-osm-id\/native-map-wheel-suppression\.js["']/);
  assert.doesNotMatch(bootstrapSource, /\bfunction\s+(?:createNativeMapGestureForwarder|createNativeMapWheelSuppression|dispatchForwardedPointerEvent|dispatchForwardedWheelEvent|isExtensionOwnedNode)\b/);
  assert.match(nativeMapGestureSource, /\bexport\s+function\s+createNativeMapGestureForwarder\b/);
  assert.match(nativeMapGestureSource, /__idOverlayForwardedNativeMap/);
  assert.match(nativeMapWheelSource, /\bexport\s+function\s+createNativeMapWheelSuppression\b/);
  assert.match(nativeMapWheelSource, /wheel-suppressed-during-pan/);
  trace.edge(flowEdge("check.bootstrap-native-map-interaction-delegation", "sink.architecture-boundary", {
    terminal: "architecture-check",
  }));
});

function collectPatternViolations(forbiddenPatterns) {
  const violations = [];
  for (const filePath of listJavaScriptFiles(hexPath("bootstrap"))) {
    const source = readSource(filePath);
    for (const { label, pattern } of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativeToRepo(filePath)} uses ${label}`);
      }
    }
  }
  return violations;
}
