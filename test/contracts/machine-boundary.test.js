import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { repoPath } from "../helpers/paths.js";

// TODO(smell): These boundary contracts still guard the previous cleanup stage,
// not the final public user/fact ingress split. Rewrite them to forbid content
// imports of low-level mutation events and to require private replay/event
// surfaces once the machine API is cut over.
const MACHINE_DIR = repoPath("src/core/machine");

const FORBIDDEN_IMPORTS = Object.freeze([
  "../state.js",
  "../interactions.js",
  "../presentation.js",
  "../panel-state.js",
  "../ui-effect-model.js",
  "../ui-event-model.js",
  "../ui-history-transition.js",
  "../ui-live-effect-runner.js",
  "../ui-live-state.js",
  "../ui-live-transition.js",
  "../ui-main-action-transition.js",
  "../ui-mode-transition.js",
  "../ui-registration-semantics.js",
  "../ui-registration-transition.js",
  "../ui-state-model.js",
  "../ui-status-model.js",
  "../ui-transition-result.js",
  "../ui-transition.js",
  "../ui-view-model.js",
  "../../content/",
]);

const CONTENT_BRIDGE_FORBIDDEN_IMPORTS = Object.freeze([
  "../core/panel-state.js",
  "../core/state.js",
  "../core/ui-event-model.js",
  "../core/ui-live-state.js",
  "../core/ui-live-transition.js",
  "../core/ui-status-model.js",
  "../core/ui-view-model.js",
  "./panel-live-effects.js",
]);

const LEGACY_BRIDGE_FILES = Object.freeze([
  "src/content/panel-live-effects.js",
  "src/content/status-controller.js",
  "src/core/interaction-mode.js",
  "src/core/interaction-runtime.js",
  "src/core/machine-store-adapter.js",
  "src/core/panel-state.js",
  "src/core/presentation.js",
  "src/core/session-defaults.js",
  "src/core/state.js",
  "src/core/ui-effect-model.js",
  "src/core/ui-event-model.js",
  "src/core/ui-history-transition.js",
  "src/core/ui-live-effect-runner.js",
  "src/core/ui-live-state.js",
  "src/core/ui-live-transition.js",
  "src/core/ui-main-action-transition.js",
  "src/core/ui-mode-transition.js",
  "src/core/ui-registration-semantics.js",
  "src/core/ui-registration-transition.js",
  "src/core/ui-state-model.js",
  "src/core/ui-status-model.js",
  "src/core/ui-transition-result.js",
  "src/core/ui-transition.js",
  "src/core/ui-view-model.js",
]);

const LEGACY_STATE_STORE_PATTERNS = Object.freeze([
  ["legacy state-store factory", /\bcreateStateStore\b/],
  ["legacy state action enum", /\bSTATE_ACTION\b/],
  ["legacy state reducer", /\breduceState\b/],
  ["descriptor-based history", /\bhistoryDescriptor\b/],
  ["snapshot history batching", /\bbeginHistoryBatch\b|\bendHistoryBatch\b/],
  ["store-owned history descriptors", /\bgetUndoDescriptor\b|\bgetRedoDescriptor\b/],
  ["duplicated interaction mode vocabulary", /\bINTERACTION_MODE\b|\bnormalizeInteractionMode\b|\bnextMode\b/],
]);

const CORE_FORBIDDEN_BOUNDARY_IMPORTS = Object.freeze([
  "../content/",
  "../platform/",
]);

test("legacy bridge, store, and duplicated mode files stay deleted", () => {
  const violations = LEGACY_BRIDGE_FILES.filter((relativePath) => {
    return fs.existsSync(repoPath(relativePath));
  });

  assert.deepEqual(violations, []);
});

test("core does not import live content or platform adapters", () => {
  const violations = [];
  for (const filePath of listJavaScriptFiles(repoPath("src/core"))) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const importPath of parseStaticImports(source)) {
      if (CORE_FORBIDDEN_BOUNDARY_IMPORTS.some((forbidden) => importPath.startsWith(forbidden))) {
        violations.push(`${path.relative(repoPath(), filePath)} -> ${importPath}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("source does not reintroduce the legacy state-store vocabulary", () => {
  const violations = [];
  for (const filePath of listJavaScriptFiles(repoPath("src"))) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const [name, pattern] of LEGACY_STATE_STORE_PATTERNS) {
      if (pattern.test(source)) {
        violations.push(`${path.relative(repoPath(), filePath)}: ${name}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("clean-room machine does not import legacy semantic ownership modules", () => {
  const violations = [];
  for (const filePath of listJavaScriptFiles(MACHINE_DIR)) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const importPath of parseStaticImports(source)) {
      if (FORBIDDEN_IMPORTS.some((forbidden) => importPath.startsWith(forbidden))) {
        violations.push(`${path.relative(repoPath(), filePath)} -> ${importPath}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("content bootstrap uses the machine host instead of the legacy state store", () => {
  const source = fs.readFileSync(repoPath("src/content/main.js"), "utf8");

  assert.match(source, /createMachineHost/);
  assert.doesNotMatch(source, /createStateStore/);
  assert.doesNotMatch(source, /createMachineBackedStateStore/);
  assert.doesNotMatch(source, /"\.\.\/core\/state\.js"/);
  assert.doesNotMatch(source, /"\.\.\/core\/machine-store-adapter\.js"/);
});

test("live panel controller does not import the legacy ui bridge", () => {
  const violations = [];
  for (const relativePath of ["src/content/panel.js"]) {
    const source = fs.readFileSync(repoPath(relativePath), "utf8");
    for (const importPath of parseStaticImports(source)) {
      if (CONTENT_BRIDGE_FORBIDDEN_IMPORTS.includes(importPath)) {
        violations.push(`${relativePath} -> ${importPath}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("status notices are machine-owned, not content-controller feedback", () => {
  const forbiddenPatterns = [
    ["legacy feedback enum", /\bMACHINE_FEEDBACK_KIND\b/],
    ["legacy feedback event", /\bREPORT_FEEDBACK\b/],
    ["legacy feedback formatter", /\bformatFeedback\b/],
    ["legacy status override state", /\bmessageOverride\b/],
    ["transition result status stream", /\bsubscribeResults\b/],
    ["adapter-authored loaded-image message", /\bfeedbackMessage\b/],
    ["adapter-authored feedback kind", /\bfeedbackKind\b/],
  ];
  const violations = [];
  for (const filePath of listJavaScriptFiles(repoPath("src"))) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const [name, pattern] of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(`${path.relative(repoPath(), filePath)}: ${name}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("live interactions and overlay read canonical machine host, not the legacy session store", () => {
  const liveSources = new Map([
    ["src/content/interaction-controller.js", fs.readFileSync(repoPath("src/content/interaction-controller.js"), "utf8")],
    ["src/content/overlay.js", fs.readFileSync(repoPath("src/content/overlay.js"), "utf8")],
  ]);
  const violations = [];

  for (const [relativePath, source] of liveSources) {
    for (const violation of findLegacySessionStoreUsage(source)) {
      violations.push(`${relativePath}: ${violation}`);
    }
  }

  assert.deepEqual(violations, []);
});

test("interaction adapter does not own registration solve or pin mutation semantics", () => {
  const source = fs.readFileSync(repoPath("src/content/interaction-controller.js"), "utf8");
  const forbiddenPatterns = [
    ["direct add/remove/restore events", /MACHINE_COMMAND_KIND\.(?:ADD_PIN|REMOVE_PIN|RESTORE_REGISTRATION)/],
    ["registration solver import", /\bsolveSimilarityTransform\b/],
    ["public pin/solve result vocabulary", /\b(?:PIN_RESULT_(?:ACTION|REASON)|SOLVE_RESULT_REASON)\b/],
    ["public pin toggle command", /\brequestTogglePinAtCurrentPointer\b/],
    ["controller solve method", /\bsolveRegistrationFromCurrentState\b|\bcomputeTransform\b/],
    ["controller pin clearing method", /\bfunction\s+clearPins\b/],
    ["controller image load/clear methods", /\bfunction\s+(?:loadImage|clearImage)\b/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("input runtime is machine-owned, not an interaction-side reducer", () => {
  const forbiddenPatterns = [
    ["interaction runtime reducer", /\breduceInteractionRuntime\b/],
    ["interaction runtime action enum", /\bINTERACTION_RUNTIME_ACTION\b/],
    ["interaction runtime default state", /\bDEFAULT_INTERACTION_RUNTIME\b/],
    ["standalone interaction runtime import", /interaction-runtime\.js/],
    ["legacy boolean runtime projection", /\b(?:isDragging|isPassThroughActive|isPointerInsideImage)\b/],
  ];
  const violations = [];
  for (const filePath of listJavaScriptFiles(repoPath("src"))) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const [name, pattern] of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(`${path.relative(repoPath(), filePath)}: ${name}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("interaction tests do not recreate semantic controller facade APIs", () => {
  const source = fs.readFileSync(repoPath("test/unit/interactions.test.js"), "utf8");
  const forbiddenPatterns = [
    [
      "controller semantic helper calls",
      /\bcontroller\.(?:loadImage|clearImage|toggleMode|computeTransform|clearPins)\s*\(/,
    ],
    [
      "controller-shaped semantic helper methods",
      /\b(?:loadImage|clearImage|toggleMode|computeTransform|clearPins)\s*\([^)]*\)\s*\{/,
    ],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("interaction adapter does not own placement edit lifecycle semantics", () => {
  const source = fs.readFileSync(repoPath("src/content/interaction-controller.js"), "utf8");
  const forbiddenPatterns = [
    ["direct placement restore events", /MACHINE_COMMAND_KIND\.RESTORE_PLACEMENT/],
    ["interaction-local placement draft", /\bplacementEditDraft\b/],
    ["interaction-local placement lifecycle", /\b(?:begin|commit)PlacementEdit\b/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("interaction controller shell delegates pin and wheel command semantics", () => {
  const source = fs.readFileSync(repoPath("src/content/interaction-controller.js"), "utf8");
  const forbiddenPatterns = [
    ["direct pin toggle event", /MACHINE_COMMAND_KIND\.TOGGLE_PIN/],
    ["direct opacity event", /MACHINE_COMMAND_KIND\.SET_OPACITY/],
    ["direct placement edit event", /MACHINE_COMMAND_KIND\.APPLY_PLACEMENT_EDIT/],
    ["placement command kind", /\bMACHINE_PLACEMENT_EDIT_KIND\b/],
    [
      "pin command geometry",
      /\b(?:resolvePinContext|buildPinRenderModels|hitTestPin|screenPointToRenderedImagePoint)\b/,
    ],
    [
      "wheel command geometry",
      /\b(?:resolvePlacementEditRenderState|createRetunedPlacementTransform|opacityFromWheelDelta|rotationFromWheelDelta|scaleFromWheelDelta)\b/,
    ],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("placement edit planning is centralized outside transform and live interaction routing", () => {
  const sources = new Map([
    ["src/core/transform.js", fs.readFileSync(repoPath("src/core/transform.js"), "utf8")],
    ["src/content/interactions/adapter-drag.js", fs.readFileSync(repoPath("src/content/interactions/adapter-drag.js"), "utf8")],
    ["src/content/interactions/wheel-command.js", fs.readFileSync(repoPath("src/content/interactions/wheel-command.js"), "utf8")],
  ]);
  const forbiddenPatterns = [
    [
      "transform-owned placement retuning",
      "src/core/transform.js",
      /\b(?:createRetunedPlacementTransform|resolvePlacementEditRenderState|MACHINE_PLACEMENT_EDIT_KIND)\b/,
    ],
    [
      "drag-owned placement edit geometry",
      "src/content/interactions/adapter-drag.js",
      /\b(?:resolvePlacementEditRenderState|createRetunedPlacementTransform|imagePointToRenderedScreenPoint|resolveOverlayScreenTransform|getOverlayImage|MACHINE_PLACEMENT_EDIT_KIND)\b/,
    ],
    [
      "wheel-owned placement edit geometry",
      "src/content/interactions/wheel-command.js",
      /\b(?:resolvePlacementEditRenderState|createRetunedPlacementTransform|rotationFromWheelDelta|scaleFromWheelDelta|MACHINE_PLACEMENT_EDIT_KIND)\b/,
    ],
  ];
  const violations = forbiddenPatterns
    .filter(([, relativePath, pattern]) => pattern.test(sources.get(relativePath)))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("input eligibility is centralized in the input projection", () => {
  const sources = new Map([
    ["src/content/overlay.js", fs.readFileSync(repoPath("src/content/overlay.js"), "utf8")],
    ["src/content/interaction-controller.js", fs.readFileSync(repoPath("src/content/interaction-controller.js"), "utf8")],
    ["src/core/interaction-policy.js", fs.readFileSync(repoPath("src/core/interaction-policy.js"), "utf8")],
  ]);
  const forbiddenPatterns = [
    [
      "overlay imports selector/policy ownership directly",
      "src/content/overlay.js",
      /selectOverlayPolicy|interaction-policy\.js/,
    ],
    [
      "interactions imports semantic eligibility helpers",
      "src/content/interaction-controller.js",
      /\b(?:canCaptureOverlayPointer|canHandleWheelGesture|canEditRegistration|resolveKeyboardShortcut|shouldReleasePassThrough)\b/,
    ],
    [
      "raw interaction policy imports machine/session semantics",
      "src/core/interaction-policy.js",
      /machine\/selectors|selectOverlayPolicy|from "\.\/session\.js"/,
    ],
  ];
  const violations = forbiddenPatterns
    .filter(([, relativePath, pattern]) => pattern.test(sources.get(relativePath)))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
  assert.ok(fs.existsSync(repoPath("src/core/input-projection.js")));
});

test("similarity solving has one implementation", () => {
  const definitions = [];
  for (const filePath of listJavaScriptFiles(repoPath("src"))) {
    const source = fs.readFileSync(filePath, "utf8");
    if (/\bexport\s+function\s+solveSimilarityTransform\b/.test(source)) {
      definitions.push(path.relative(repoPath(), filePath));
    }
  }

  assert.deepEqual(definitions, ["src/core/geometry.js"]);
});

function findLegacySessionStoreUsage(source) {
  const forbiddenPatterns = [
    ["compat adapter", /createMachineBackedStateStore|machine-store-adapter/],
    ["legacy factory", /createStateStore/],
    [
      "legacy store parameter",
      /create(?:InteractionController|Overlay)\s*\(\s*\{[^}]*\bstore\b/s,
    ],
    [
      "legacy session store call",
      /\bstore\.(?:getState|subscribe|loadImageSession|clearImage|setMode|setOpacity|addPin|removePin|clearPins|beginHistoryBatch|endHistoryBatch|setPlacement|syncPlacement|undo|redo|canUndo|canRedo|getUndoDescriptor|getRedoDescriptor)\b/,
    ],
  ];
  return forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);
}

function listJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listJavaScriptFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
  });
}

function parseStaticImports(source) {
  const imports = [];
  const importRegex = /import\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g;
  for (const match of source.matchAll(importRegex)) {
    imports.push(match[1]);
  }
  return imports;
}
