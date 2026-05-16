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
const CONTENT_SCRIPT_BRIDGES_SOURCE = hexPath("bootstrap/content-script-bridges.js");
const STARTUP_DURABLE_STATE_SOURCE = hexPath("bootstrap/startup-durable-state.js");
const MAP_LOCKED_PLACEMENT_SOURCE = hexPath("bootstrap/map-locked-placement.js");
const PANEL_CHROME_SOURCE = hexPath("bootstrap/panel-chrome.js");
const BROWSER_EFFECT_HANDLERS_SOURCE = hexPath("bootstrap/browser-effect-handlers.js");
const BROWSER_RENDER_PROJECTION_SOURCE = hexPath("bootstrap/browser-render-projection.js");

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
// product state shape or own user-facing product copy. Canonical key/method
// dictionaries and command payloads are allowed to use honest names; hiding
// vocabulary behind string construction is not the boundary.
test("bootstrap source does not define product state or product copy", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "bootstrap source does not define product state or product copy",
  });
  assert.deepEqual([
    ...collectInlineProductStateShapeViolations(),
    ...collectProductCopyViolations(),
  ], []);
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

// Class-b: page-world script injection is browser-extension bridge plumbing.
// The content entrypoint may install the bridges, but resource names, page
// script injection, and debug-console logger construction belong behind a small
// bridge module rather than in the host-composition path.
test("browser bootstrap delegates page script bridge plumbing", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser bootstrap delegates page script bridge plumbing",
  });
  const bootstrapSource = readSource(EXTENSION_CONTENT_SOURCE);
  const bridgeSource = readSource(CONTENT_SCRIPT_BRIDGES_SOURCE);

  assert.match(bootstrapSource, /from\s+["']\.\/content-script-bridges\.js["']/);
  assert.doesNotMatch(bootstrapSource, /\bfunction\s+(?:installSurfaceMotionBridge|installEventDebugConsoleBridge|installPageScriptBridge|eventDebugConsoleBridgeResourceUrl)\b/);
  assert.match(bridgeSource, /\bexport\s+function\s+installSurfaceMotionBridge\b/);
  assert.match(bridgeSource, /\bexport\s+function\s+createContentEventDebugLogger\b/);
  assert.match(bridgeSource, /\bruntime\?\.getURL\b/);
  trace.edge(flowEdge("check.bootstrap-page-script-bridge-delegation", "sink.architecture-boundary", {
    terminal: "architecture-check",
  }));
});

// Class-b: startup state reconciliation is shell policy, but it is not runtime
// composition. Bootstrap should call the reconciliation module; migration
// detection, startup recovery writes, and map-lock normalization should live
// behind focused helpers with the map-lock math kept separate.
test("browser bootstrap delegates startup durable-state reconciliation", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser bootstrap delegates startup durable-state reconciliation",
  });
  const bootstrapSource = readSource(EXTENSION_CONTENT_SOURCE);
  const shellSource = readSource(hexPath("bootstrap/index.js"));
  const startupSource = readSource(STARTUP_DURABLE_STATE_SOURCE);
  const mapLockSource = readSource(MAP_LOCKED_PLACEMENT_SOURCE);

  assert.match(shellSource, /from\s+["']\.\/startup-durable-state\.js["']/);
  assert.match(shellSource, /from\s+["']\.\/map-locked-placement\.js["']/);
  assert.doesNotMatch(shellSource, /\bfunction\s+(?:hydrateStartupState|tryMigrateLegacyState|writeStartupRecovery|projectLatLonToWorld)\b/);
  assert.match(startupSource, /\bexport\s+async\s+function\s+hydrateStartupState\b/);
  assert.match(startupSource, /\breconcileLegacyPlacement\b/);
  assert.match(mapLockSource, /\bexport\s+function\s+tryNormalizeDurablePlacementCoordinateSpace\b/);
  assert.match(mapLockSource, /\bfunction\s+projectLatLonToWorld\b/);
  assert.doesNotMatch(bootstrapSource, /\breconcileLegacyPlacement\b/);
  trace.edge(flowEdge("check.bootstrap-startup-state-delegation", "sink.architecture-boundary", {
    terminal: "architecture-check",
  }));
});

// Class-b: panel chrome persistence is shell UI policy. Bootstrap should keep
// only the event hook; stored chrome normalization and viewport clamping belong
// behind a panel chrome helper instead of being mixed into runtime composition.
test("browser bootstrap delegates panel chrome normalization", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser bootstrap delegates panel chrome normalization",
  });
  const shellSource = readSource(hexPath("bootstrap/index.js"));
  const panelChromeSource = readSource(PANEL_CHROME_SOURCE);

  assert.match(shellSource, /from\s+["']\.\/panel-chrome\.js["']/);
  assert.doesNotMatch(shellSource, /\bfunction\s+(?:readPanelChrome|normalizeStoredPanelChrome|normalizePanelChrome)\b/);
  assert.match(panelChromeSource, /\bexport\s+async\s+function\s+readPanelChrome\b/);
  assert.match(panelChromeSource, /\bexport\s+function\s+normalizePanelChrome\b/);
  assert.match(panelChromeSource, /\bresolvePanelPosition\b/);
  trace.edge(flowEdge("check.bootstrap-panel-chrome-delegation", "sink.architecture-boundary", {
    terminal: "architecture-check",
  }));
});

// Class-b: application effects are executed through browser ports. Bootstrap
// should pass the handlers into the runtime, while durable writes, image input
// callback composition, timer scheduling, and initial-placement enrichment live
// behind an effect handler helper.
test("browser bootstrap delegates host effect handling", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser bootstrap delegates host effect handling",
  });
  const shellSource = readSource(hexPath("bootstrap/index.js"));
  const effectSource = readSource(BROWSER_EFFECT_HANDLERS_SOURCE);

  assert.match(shellSource, /from\s+["']\.\/browser-effect-handlers\.js["']/);
  assert.doesNotMatch(shellSource, /\bfunction\s+(?:createEffectHandlers|withInitialPlacement)\b/);
  assert.match(effectSource, /\bexport\s+function\s+createBrowserEffectHandlers\b/);
  assert.match(effectSource, /\bstartReferenceImageInput\b/);
  assert.match(effectSource, /\bcreateInitialReferencePlacement\b/);
  assert.match(effectSource, /\bscheduleApplicationCommand\b/);
  trace.edge(flowEdge("check.bootstrap-effect-handler-delegation", "sink.architecture-boundary", {
    terminal: "architecture-check",
  }));
});

// Class-b: rendering projection and debug summaries are shell presentation
// plumbing. Bootstrap should render the selected view, but page-snapshot
// projection, projection-port lookup, and event-debug payload shaping belong in
// a focused helper.
test("browser bootstrap delegates render projection diagnostics", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser bootstrap delegates render projection diagnostics",
  });
  const shellSource = readSource(hexPath("bootstrap/index.js"));
  const projectionSource = readSource(BROWSER_RENDER_PROJECTION_SOURCE);

  assert.match(shellSource, /from\s+["']\.\/browser-render-projection\.js["']/);
  assert.doesNotMatch(shellSource, /\bfunction\s+(?:projectApplicationView|logRenderProjection|summarizePageSnapshot|summarizeOverlay)\b/);
  assert.match(projectionSource, /\bexport\s+function\s+projectApplicationView\b/);
  assert.match(projectionSource, /\bexport\s+function\s+createRenderProjectionLogger\b/);
  assert.match(projectionSource, /\bprojectTraceOverlayForPageSnapshot\b/);
  assert.match(projectionSource, /\beventDebugLogger\b/);
  trace.edge(flowEdge("check.bootstrap-render-projection-delegation", "sink.architecture-boundary", {
    terminal: "architecture-check",
  }));
});

function collectInlineProductStateShapeViolations() {
  const violations = [];
  for (const filePath of listJavaScriptFiles(hexPath("bootstrap"))) {
    const source = withoutCanonicalDictionaries(readSource(filePath));
    if (/\b(session|registration|history|notice|inputOverride|pins)\s*:|\b(referenceImage|placement)\s*:\s*\{/.test(source)) {
      violations.push(`${relativeToRepo(filePath)} defines inline product state shape`);
    }
  }
  return violations;
}

function collectProductCopyViolations() {
  const violations = [];
  for (const filePath of listJavaScriptFiles(hexPath("bootstrap"))) {
    for (const literal of extractStringLiterals(readSource(filePath))) {
      if (/\b(?:Paste|Clear image|Clear pins|Trace|Align|Reload image|No image|Paste cancelled)\b/.test(literal)) {
        violations.push(`${relativeToRepo(filePath)} defines product copy: ${JSON.stringify(literal)}`);
      }
    }
  }
  return violations;
}

function withoutCanonicalDictionaries(source) {
  return source.replace(
    /const\s+(?:STATE_KEY|MODE|HOST_PORT)\s*=\s*Object\.freeze\s*\(\s*\{[\s\S]*?\}\s*\);/g,
    "",
  );
}

function extractStringLiterals(source) {
  return Array.from(source.matchAll(/(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g), (match) => match[2]);
}
