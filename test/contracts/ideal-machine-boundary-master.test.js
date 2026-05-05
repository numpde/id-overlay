import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { repoPath } from "../helpers/paths.js";

// Master architecture note:
//
// Content reports browser/user/page facts.
// The machine interprets those facts against current state.
// The machine alone owns durable mutation, status, history, effects, and replay.
// View models expose render data only; they never return executable events.
// History stores semantic before/after records, not executable undo/redo events.
// Effects return typed result facts, not public mutation/completion events.
// Page integration exposes explicit snapshot, projection, and gesture ports.
//
// This file is the target-shape executable checklist. Tests marked TODO are
// intentionally ahead of the implementation: they should be converted to normal
// passing tests as each seam is cut over. Keep this file add-only until the
// corresponding production slice is implemented.

const SOURCE_DIR = repoPath("src");
const CONTENT_DIR = repoPath("src/content");
const MACHINE_DIR = repoPath("src/core/machine");
const TEST_DIR = repoPath("test");

const MASTER_SEAMS = Object.freeze([
  "public user/fact ingress",
  "private mutation and replay",
  "render-only view models",
  "semantic history records",
  "typed effect results",
  "explicit page ports",
  "canonical action selectors",
  "storage-shaped persistence",
  "normalized input facts",
  "machine-owned status copy",
  "explicit transition finalization",
  "render-only overlay renderer",
]);

test("master checklist names the target seams", () => {
  assert.deepEqual(MASTER_SEAMS, [
    "public user/fact ingress",
    "private mutation and replay",
    "render-only view models",
    "semantic history records",
    "typed effect results",
    "explicit page ports",
    "canonical action selectors",
    "storage-shaped persistence",
    "normalized input facts",
    "machine-owned status copy",
    "explicit transition finalization",
    "render-only overlay renderer",
  ]);
});

test("content does not author low-level machine events", {
  todo: "Cut content over to public user/fact ingress.",
}, () => {
  const violations = [];
  const forbiddenPatterns = [
    ["machine event import", /\bMACHINE_COMMAND_KIND\b/],
    ["generic machine dispatch port", /\bdispatchMachine\s*\(|\bmachineHost\.dispatch\s*\(/],
    ["low-level event object", /\btype:\s*MACHINE_COMMAND_KIND\./],
  ];

  for (const filePath of listJavaScriptFiles(CONTENT_DIR)) {
    const source = readSource(filePath);
    for (const [name, pattern] of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(formatViolation(filePath, name));
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("panel view model exposes render data only", {
  todo: "Move panel activation semantics into the machine and keep view models event-free.",
}, () => {
  const source = readSource(repoPath("src/content/panel-view-model.js"));
  const forbiddenPatterns = [
    ["machine event vocabulary", /\bMACHINE_COMMAND_KIND\b/],
    ["event constructor import", /\bcreate[A-Z]\w*Event\b/],
    ["executable action event", /\bevent\s*:/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("panel DOM reports product activations instead of resolving command meaning", {
  todo: "Panel controls should report primary/mode/opacity/history activations; the machine should interpret them.",
}, () => {
  const source = readSource(repoPath("src/content/panel.js"));
  const forbiddenPatterns = [
    ["machine event vocabulary", /\bMACHINE_COMMAND_KIND\b/],
    ["mode enum import", /\bMACHINE_MODE\b/],
    ["live state action lookup", /\bselectPanelView\s*\(\s*machineHost\.getState\s*\(\s*\)\s*\)/],
    ["view-model executable event dispatch", /\bdispatchMachineEvent\s*\(\s*action\.event\s*\)/],
    ["generic machine dispatch wrapper", /\bfunction\s+dispatchMachineEvent\s*\(/],
  ];
  const requiredPatterns = [
    ["primary activation ingress", /\b(?:activatePanelPrimary|ingestPanelPrimary|reportPanelPrimaryActivated)\b/],
    ["history activation ingress", /\b(?:activateUndo|activateRedo|ingestHistoryActivation|reportHistoryActivated)\b/],
  ];
  const violations = [
    ...forbiddenPatterns
      .filter(([, pattern]) => pattern.test(source))
      .map(([name]) => `forbidden: ${name}`),
    ...requiredPatterns
      .filter(([, pattern]) => !pattern.test(source))
      .map(([name]) => `missing: ${name}`),
  ];

  assert.deepEqual(violations, []);
});

test("primary panel action has one canonical machine-owned selector", {
  todo: "Derive primary action semantics once in core and use the same selector for render and activation.",
}, () => {
  const policySource = readSource(repoPath("src/core/machine/policy.js"));
  const panelViewSource = readSource(repoPath("src/content/panel-view-model.js"));
  const violations = [];

  if (!/\bselectPanelPrimaryAction\b/.test(policySource)) {
    violations.push("missing: selectPanelPrimaryAction");
  }
  if (/\bfunction\s+resolveMainAction\s*\(/.test(panelViewSource)) {
    violations.push("forbidden: content-local primary action resolver");
  }
  if (/\bPANEL_MAIN_ACTION\b/.test(panelViewSource)) {
    violations.push("forbidden: content-local primary action vocabulary");
  }
  if (/\bMACHINE_PANEL_INTENT\b/.test(panelViewSource)) {
    violations.push("forbidden: panel intent interpretation in view model");
  }

  assert.deepEqual(violations, []);
});

test("status text is machine-owned and content view models do not format notices", {
  todo: "Move baseline/status-notice copy to core selectors so content receives final render text only.",
}, () => {
  const panelViewSource = readSource(repoPath("src/content/panel-view-model.js"));
  const selectorsSource = readSource(repoPath("src/core/machine/selectors.js"));
  const violations = [];

  if (/\bMACHINE_STATUS_NOTICE_KIND\b/.test(panelViewSource)) {
    violations.push("forbidden: status notice vocabulary in content view model");
  }
  if (/\bfunction\s+(?:selectStatus|formatStatusNotice|selectBaselineStatus)\s*\(/.test(panelViewSource)) {
    violations.push("forbidden: content-local status formatter");
  }
  if (/\bPANEL_STATUS_MESSAGE\b/.test(panelViewSource)) {
    violations.push("forbidden: content-local status copy vocabulary");
  }
  if (!/\bselectPanelStatusText\b/.test(selectorsSource)) {
    violations.push("missing: core panel status text selector");
  }

  assert.deepEqual(violations, []);
});

test("public machine event vocabulary contains only user intents and external facts", () => {
  const source = readSource(repoPath("src/core/machine/events.js"));
  const forbiddenPatterns = [
    ["public low-level event vocabulary", /\bexport\s+const\s+MACHINE_COMMAND_KIND\b/],
    ["low-level command constructor", /\bexport\s+function\s+create(?:LoadImage|CancelPanelIntent|ReportStatusNotice)Event\b/],
    ["public machine command payload", /\btype:\s*MACHINE_COMMAND_KIND\./],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("machine host exposes explicit ingress, not generic dispatch", {
  todo: "Replace host.dispatch with a narrow public user/fact ingress API.",
}, () => {
  const source = readSource(repoPath("src/core/machine/host.js"));
  const forbiddenPatterns = [
    ["public dispatch function", /\bfunction\s+dispatch\s*\(/],
    ["dispatch returned from host", /\breturn\s*\{[^}]*\bdispatch\b/s],
    ["runtime raw dispatch", /\bruntime\.dispatch\s*\(/],
  ];
  const requiredPatterns = [
    ["user ingress export", /\bingest(?:User|External|Machine)?(?:Intent|Fact|Event)\b/],
    ["effect-result ingress", /\b(?:completeEffect|ingestEffectResult|ingestExternalFact)\b/],
  ];

  const violations = [
    ...forbiddenPatterns
      .filter(([, pattern]) => pattern.test(source))
      .map(([name]) => `forbidden: ${name}`),
    ...requiredPatterns
      .filter(([, pattern]) => !pattern.test(source))
      .map(([name]) => `missing: ${name}`),
  ];

  assert.deepEqual(violations, []);
});

test("machine runtime is private state/effect plumbing, not a public event dispatcher", {
  todo: "Move public interpretation to host ingress and keep runtime from accepting arbitrary event dispatch.",
}, () => {
  const source = readSource(repoPath("src/core/machine/runtime.js"));
  const forbiddenPatterns = [
    ["transition import", /\bimport\s+\{\s*transitionMachine\s*\}/],
    ["generic dispatch method", /\bfunction\s+dispatch\s*\(\s*event\b/],
    ["injected transition override", /\{\s*transition\s*=\s*transitionMachine\s*\}/],
    ["event argument in runtime dispatch", /\bruntime\.dispatch\s*\(\s*event\b/],
  ];
  const requiredPatterns = [
    ["private apply result API", /\b(?:applyTransitionResult|commitMachineResult|runMachineResult)\b/],
  ];
  const violations = [
    ...forbiddenPatterns
      .filter(([, pattern]) => pattern.test(source))
      .map(([name]) => `forbidden: ${name}`),
    ...requiredPatterns
      .filter(([, pattern]) => !pattern.test(source))
      .map(([name]) => `missing: ${name}`),
  ];

  assert.deepEqual(violations, []);
});

test("transition entrypoint separates public interpretation from private domain operations", {
  todo: "Replace the flat MACHINE_COMMAND_KIND switch with public interpreters and private domain transitions.",
}, () => {
  const source = readSource(repoPath("src/core/machine/transition.js"));
  const forbiddenPatterns = [
    ["flat event switch", /\bswitch\s*\(\s*event\.type\s*\)/],
    ["public undo special case", /event\.type\s*===\s*MACHINE_COMMAND_KIND\.UNDO/],
    ["public redo special case", /event\.type\s*===\s*MACHINE_COMMAND_KIND\.REDO/],
    ["mutation command cases", /\bcase\s+MACHINE_COMMAND_KIND\.(?:CLEAR_IMAGE|SET_OPACITY|ADD_PIN|REMOVE_PIN|APPLY_PLACEMENT_EDIT|RESTORE_PLACEMENT)\b/],
  ];
  const requiredPatterns = [
    ["public event interpreter", /\binterpret(?:User|External|Ingress)/],
    ["private domain transition", /\btransition(?:Session|Registration|Placement|Runtime|Panel|History)\b/],
  ];

  const violations = [
    ...forbiddenPatterns
      .filter(([, pattern]) => pattern.test(source))
      .map(([name]) => `forbidden: ${name}`),
    ...requiredPatterns
      .filter(([, pattern]) => !pattern.test(source))
      .map(([name]) => `missing: ${name}`),
  ];

  assert.deepEqual(violations, []);
});

test("transition result finalization is explicit and domain-local, not hidden behind commit booleans", () => {
  const sources = new Map([
    ["src/core/machine/transition.js", readSource(repoPath("src/core/machine/transition.js"))],
    ["src/core/machine/transition-result.js", readSource(repoPath("src/core/machine/transition-result.js"))],
    ["src/core/machine/history-replay-transition.js", readSource(repoPath("src/core/machine/history-replay-transition.js"))],
  ]);
  const forbiddenPatterns = [
    ["commit history boolean", /\bcommitHistory\b/],
    ["commit status boolean", /\bcommitStatus\b/],
    ["generic finalizer", /\bfinalizeTransitionResult\b/],
  ];
  const requiredPatterns = [
    ["history result combinator", /\b(?:withHistoryRecord|commitSemanticHistoryRecord)\b/],
    ["status result combinator", /\b(?:withStatusNotice|applyMachineStatusNotice)\b/],
  ];
  const violations = [];
  const combinedSource = [...sources.values()].join("\n");

  for (const [relativePath, source] of sources) {
    for (const [name, pattern] of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativePath}: forbidden: ${name}`);
      }
    }
  }
  for (const [name, pattern] of requiredPatterns) {
    if (!pattern.test(combinedSource)) {
      violations.push(`missing: ${name}`);
    }
  }

  assert.deepEqual(violations, []);
});

test("history records are semantic facts, not executable events", () => {
  const violations = [];
  for (const filePath of listJavaScriptFiles(MACHINE_DIR)) {
    const source = readSource(filePath);
    if (/\b(?:undoEvent|redoEvent)\b/.test(source)) {
      violations.push(path.relative(repoPath(), filePath));
    }
  }

  assert.deepEqual(violations, []);
});

test("machine state serialization never depends on executable replay payloads", () => {
  const source = readSource(repoPath("src/core/machine/state.js"));
  const forbiddenPatterns = [
    ["undo event serialization", /\bserializeMachineValue\s*\(\s*record\.undoEvent\b/],
    ["redo event serialization", /\bserializeMachineValue\s*\(\s*record\.redoEvent\b/],
    ["event-shaped history normalization", /\b(?:undoEvent|redoEvent)\s*:/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("history replay never re-enters public ingress", () => {
  const source = readSource(repoPath("src/core/machine/history-replay-transition.js"));
  const forbiddenPatterns = [
    ["selects replay event", /\bselectEvent\b/],
    ["calls transitionSemantic", /\btransitionSemantic\s*\(/],
    ["reads undo/redo event payload", /\brecord\.(?:undoEvent|redoEvent)\b/],
  ];
  const requiredPatterns = [
    ["semantic record replay", /\breplay(?:History|Semantic|Domain)Record\b/],
  ];
  const violations = [
    ...forbiddenPatterns
      .filter(([, pattern]) => pattern.test(source))
      .map(([name]) => `forbidden: ${name}`),
    ...requiredPatterns
      .filter(([, pattern]) => !pattern.test(source))
      .map(([name]) => `missing: ${name}`),
  ];

  assert.deepEqual(violations, []);
});

test("effect and timer completion returns typed facts instead of dispatching commands", {
  todo: "Replace completion event construction in host/effect runner with typed effect results.",
}, () => {
  const sources = new Map([
    ["src/core/machine/effect-runner.js", readSource(repoPath("src/core/machine/effect-runner.js"))],
    ["src/core/machine/host.js", readSource(repoPath("src/core/machine/host.js"))],
  ]);
  const forbiddenPatterns = [
    ["paste completion event", /\bcreateCompletePasteReadEvent\b/],
    ["panel cancel event", /\bcreateCancelPanelIntentCommand\b/],
    ["status clear command", /\bMACHINE_COMMAND_KIND\.CLEAR_STATUS_NOTICE\b/],
    ["host/effect dispatch callback", /\bdispatch\s*\(/],
  ];
  const violations = [];

  for (const [relativePath, source] of sources) {
    for (const [name, pattern] of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativePath}: ${name}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("effect requests declare their result fact vocabulary beside the request", {
  todo: "Effect contracts should define typed result facts, not complete through public machine events.",
}, () => {
  const effectsSource = readSource(repoPath("src/core/machine/effects.js"));
  const eventsSource = readSource(repoPath("src/core/machine/events.js"));
  const violations = [];

  if (!/\bMACHINE_EFFECT_RESULT_KIND\b/.test(effectsSource)) {
    violations.push("missing: MACHINE_EFFECT_RESULT_KIND");
  }
  if (!/\bcreateReadPasteImageResult\b/.test(effectsSource)) {
    violations.push("missing: paste read result constructor");
  }
  if (/\bCOMPLETE_PASTE_READ\b/.test(eventsSource)) {
    violations.push("forbidden: paste completion in public machine event vocabulary");
  }

  assert.deepEqual(violations, []);
});

test("machine status notice vocabulary does not leak to content or tests", {
  todo: "Expose status through typed facts and render selectors, not raw notice-kind constants outside machine internals.",
}, () => {
  const violations = [];
  const allowedFiles = new Set([
    import.meta.filename,
  ]);

  for (const filePath of [
    ...listJavaScriptFiles(SOURCE_DIR),
    ...listJavaScriptFiles(TEST_DIR),
  ]) {
    if (allowedFiles.has(filePath) || filePath.startsWith(MACHINE_DIR)) {
      continue;
    }
    const source = readSource(filePath);
    if (/\bMACHINE_STATUS_NOTICE_KIND\b/.test(source)) {
      violations.push(path.relative(repoPath(), filePath));
    }
  }

  assert.deepEqual(violations, []);
});

test("placement planning is pure geometry and never constructs machine events", {
  todo: "Make placement planners return geometry facts only.",
}, () => {
  const source = readSource(repoPath("src/core/placement-edit-planning.js"));
  const forbiddenPatterns = [
    ["machine event import", /\bMACHINE_COMMAND_KIND\b/],
    ["placement edit kind import", /\bMACHINE_PLACEMENT_EDIT_KIND\b/],
    ["event payload property", /\bevent\s*:/],
    ["event type payload", /\btype:\s*MACHINE_COMMAND_KIND\./],
    ["machine state parameter", /\bstate,\s*\n\s*snapshot\b/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("paste adapter reports clipboard facts, not machine-shaped outcomes", {
  todo: "Return decoded-image or clipboard-failure facts; derive placement and status inside the machine.",
}, () => {
  const source = readSource(repoPath("src/content/paste-adapter.js"));
  const forbiddenPatterns = [
    ["status notice import", /\bMACHINE_STATUS_NOTICE_KIND\b/],
    ["placement policy import", /\bcreatePlacementTransform\b/],
    ["status-shaped outcome", /\bnoticeKind\b|\bnoticePayload\b/],
    ["placement-shaped outcome", /\bplacement\s*:/],
    ["page snapshot dependency", /\bpageAdapter\.getSnapshot\s*\(/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("persistence is storage-shaped and independent of live page projection", {
  todo: "Keep durable schema migration separate from map snapshot projection and placement solving.",
}, () => {
  const source = readSource(repoPath("src/core/machine/persistence.js"));
  const forbiddenPatterns = [
    ["transform dependency", /\bcreatePlacementTransform\b/],
    ["page snapshot parameter", /\bsnapshot\b/],
    ["map view dependency", /\bmapView\b/],
    ["projection migration export", /\bmigratePersistedMachineSessionForMap\b/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("content bootstrap does not mix persistence migration with live page snapshots", {
  todo: "Load persisted durable state first; page-context reconciliation should be a machine-ingested fact.",
}, () => {
  const source = readSource(repoPath("src/content/main.js"));
  const forbiddenPatterns = [
    ["map-aware persistence migration import", /\bmigratePersistedMachineSessionForMap\b/],
    ["snapshot passed while constructing persisted session", /\bpersistedSession:\s*[^,\n]*pageAdapter\.getSnapshot\s*\(/s],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("page integration exposes explicit ports instead of a broad adapter object", {
  todo: "Split page adapter into snapshot, projection, map-view, and gesture ports.",
}, () => {
  const source = readSource(repoPath("src/content/page-adapter.js"));
  const broadPortMethods = [
    "getSnapshot",
    "clientPointToScreen",
    "screenPointToClient",
    "mapToScreen",
    "mapToOverlayLayerScreen",
    "screenToMap",
    "beginMapPan",
    "updateMapPan",
    "endMapPan",
    "forwardMapZoom",
  ];
  const violations = broadPortMethods.filter((methodName) => {
    return new RegExp(`\\b${methodName}\\s*\\(`).test(source);
  });

  assert.deepEqual(violations, []);
});

test("content modules consume narrow page ports, not the monolithic adapter", {
  todo: "Pass snapshot/projection/gesture ports explicitly to each content module.",
}, () => {
  const violations = [];
  const allowedFiles = new Set([
    repoPath("src/content/page-adapter.js"),
    repoPath("src/content/main.js"),
  ]);

  for (const filePath of listJavaScriptFiles(CONTENT_DIR)) {
    if (allowedFiles.has(filePath) || filePath.includes(`${path.sep}page-adapter${path.sep}`)) {
      continue;
    }
    const source = readSource(filePath);
    if (/\bpageAdapter\b/.test(source)) {
      violations.push(path.relative(repoPath(), filePath));
    }
  }

  assert.deepEqual(violations, []);
});

test("overlay renderer is a pure render reconciler over an overlay view model", {
  todo: "Move overlay presentation and pin projection into a machine/content view model before DOM reconciliation.",
}, () => {
  const source = readSource(repoPath("src/content/overlay/renderer.js"));
  const forbiddenPatterns = [
    ["machine selector import", /\bselectOverlayPresentation\b/],
    ["page adapter dependency", /\bpageAdapter\b/],
    ["machine state accessor", /\bgetMachineState\b/],
    ["runtime state accessor", /\bgetRuntimeState\b/],
    ["session state local", /\bconst\s+state\s*=\s*machineState\.session\b/],
    ["map projection call", /\bmapToOverlayLayerScreen\s*\(/],
  ];
  const requiredPatterns = [
    ["overlay view model input", /\boverlayView\b|\bviewModel\b/],
  ];
  const violations = [
    ...forbiddenPatterns
      .filter(([, pattern]) => pattern.test(source))
      .map(([name]) => `forbidden: ${name}`),
    ...requiredPatterns
      .filter(([, pattern]) => !pattern.test(source))
      .map(([name]) => `missing: ${name}`),
  ];

  assert.deepEqual(violations, []);
});

test("only machine internals import machine event vocabulary", {
  todo: "Keep public ingress helpers separate from private machine event vocabulary.",
}, () => {
  const violations = [];
  for (const filePath of listJavaScriptFiles(SOURCE_DIR)) {
    if (filePath.startsWith(MACHINE_DIR)) {
      continue;
    }
    const source = readSource(filePath);
    if (/\bMACHINE_COMMAND_KIND\b/.test(source)) {
      violations.push(path.relative(repoPath(), filePath));
    }
  }

  assert.deepEqual(violations, []);
});

test("runtime observation facts are ingested once, not mirrored by content callbacks", {
  todo: "Collapse pointer, gesture, pass-through, blur, and error reset into normalized ingress facts.",
}, () => {
  const sources = new Map([
    ["src/content/interactions/runtime-bridge.js", readSource(repoPath("src/content/interactions/runtime-bridge.js"))],
    ["src/content/interactions/pointer-interaction.js", readSource(repoPath("src/content/interactions/pointer-interaction.js"))],
    ["src/content/interactions/keyboard-router.js", readSource(repoPath("src/content/interactions/keyboard-router.js"))],
  ]);
  const forbiddenPatterns = [
    ["runtime update command", /\bupdatePointer\b|\bUPDATE_POINTER_RUNTIME\b/],
    ["gesture mutation command", /\bbeginGesture\b|\bendGesture\b|\bBEGIN_POINTER_GESTURE\b|\bEND_POINTER_GESTURE\b/],
    ["pass-through mutation command", /\bsetPassThrough\b|\bSET_INPUT_OVERRIDE\b/],
    ["reset mutation command", /\bresetInteractionState\b|\bRESET_INPUT_RUNTIME\b/],
  ];
  const violations = [];

  for (const [relativePath, source] of sources) {
    for (const [name, pattern] of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativePath}: ${name}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("core input policy consumes normalized facts, never DOM event shape", {
  todo: "Normalize keyboard and pointer input at content ingress before policy or transition code sees it.",
}, () => {
  const sources = new Map([
    ["src/core/machine/policy.js", readSource(repoPath("src/core/machine/policy.js"))],
    ["src/core/interaction-policy.js", readSource(repoPath("src/core/interaction-policy.js"))],
    ["src/core/input-projection.js", readSource(repoPath("src/core/input-projection.js"))],
  ]);
  const forbiddenPatterns = [
    ["event code access", /\bevent\?*\.code\b|\bevent\.code\b/],
    ["DOM keyboard code literal", /["']Space["']/],
    ["modifier-key DOM shape", /\b(?:ctrlKey|metaKey|shiftKey|altKey)\b/],
    ["DOM target shape", /\b(?:target|activeElement)\b/],
  ];
  const violations = [];

  for (const [relativePath, source] of sources) {
    for (const [name, pattern] of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativePath}: ${name}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("tests exercise public ingress instead of raw mutation events", {
  todo: "Rewrite tests around public user/fact helpers and private domain tests.",
}, () => {
  const violations = [];
  const forbiddenPatterns = [
    ["raw machine event vocabulary", /\bMACHINE_COMMAND_KIND\b/],
    ["flat transition dispatch", /\btransitionMachine\s*\(/],
    ["host raw dispatch", /\bmachineHost\.dispatch\s*\(/],
    ["event-shaped history", /\b(?:undoEvent|redoEvent)\b/],
  ];

  for (const filePath of listJavaScriptFiles(TEST_DIR)) {
    if (filePath === import.meta.filename) {
      continue;
    }
    const source = readSource(filePath);
    for (const [name, pattern] of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(formatViolation(filePath, name));
      }
    }
  }

  assert.deepEqual(violations, []);
});

function readSource(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function formatViolation(filePath, name) {
  return `${path.relative(repoPath(), filePath)}: ${name}`;
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
