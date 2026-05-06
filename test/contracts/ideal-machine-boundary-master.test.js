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

test("content does not author low-level machine events", () => {
  const violations = [];
  const forbiddenPatterns = [
    ["machine event import", /\bMACHINE_(?:PRIVATE_)?COMMAND_KIND\b/],
    ["generic machine dispatch port", /\bdispatchMachine\s*\(|\bmachineHost\.dispatch\s*\(/],
    ["low-level event object", /\btype:\s*MACHINE_(?:PRIVATE_)?COMMAND_KIND\./],
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

test("panel view model exposes render data only", () => {
  const source = readSource(repoPath("src/content/panel-view-model.js"));
  const forbiddenPatterns = [
    ["machine event vocabulary", /\bMACHINE_(?:PRIVATE_)?COMMAND_KIND\b/],
    ["event constructor import", /\bcreate[A-Z]\w*Event\b/],
    ["executable action event", /\bevent\s*:/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("panel DOM reports product activations instead of resolving command meaning", () => {
  const source = readSource(repoPath("src/content/panel.js"));
  const forbiddenPatterns = [
    ["machine event vocabulary", /\bMACHINE_(?:PRIVATE_)?COMMAND_KIND\b/],
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

test("primary panel action has one canonical machine-owned selector", () => {
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

test("status text is machine-owned and content view models do not format notices", () => {
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
    ["public low-level event vocabulary", /\bexport\s+const\s+MACHINE_(?:PRIVATE_)?COMMAND_KIND\b/],
    ["public status notice vocabulary", /\bexport\s+const\s+MACHINE_STATUS_NOTICE_KIND\b/],
    ["low-level command constructor", /\bexport\s+function\s+create(?:LoadImage|CancelPanelIntent|ReportStatusNotice)Event\b/],
    ["public machine command payload", /\btype:\s*MACHINE_(?:PRIVATE_)?COMMAND_KIND\./],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("machine host exposes explicit ingress, not generic dispatch", () => {
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

test("machine runtime is private state/effect plumbing, not a public event dispatcher", () => {
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

test("transition entrypoint separates public interpretation from private domain operations", () => {
  const source = readSource(repoPath("src/core/machine/transition.js"));
  const forbiddenPatterns = [
    ["flat event switch", /\bswitch\s*\(\s*event\.type\s*\)/],
    ["public undo special case", /event\.type\s*===\s*MACHINE_(?:PRIVATE_)?COMMAND_KIND\.UNDO/],
    ["public redo special case", /event\.type\s*===\s*MACHINE_(?:PRIVATE_)?COMMAND_KIND\.REDO/],
    ["mutation command cases", /\bcase\s+MACHINE_(?:PRIVATE_)?COMMAND_KIND\.(?:CLEAR_IMAGE|SET_OPACITY|ADD_PIN|REMOVE_PIN|APPLY_PLACEMENT_EDIT|RESTORE_PLACEMENT)\b/],
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

test("effect and timer completion returns typed facts instead of dispatching commands", () => {
  const sources = new Map([
    ["src/core/machine/effect-runner.js", readSource(repoPath("src/core/machine/effect-runner.js"))],
    [
      "src/core/machine/effect-result-transition.js",
      readSource(repoPath("src/core/machine/effect-result-transition.js")),
    ],
    ["src/core/machine/host.js", readSource(repoPath("src/core/machine/host.js"))],
  ]);
  const forbiddenPatterns = [
    ["paste completion event", /\bcreateCompletePasteReadEvent\b/],
    ["panel cancel event", /\bcreateCancelPanelIntentCommand\b/],
    ["status clear command", /\bMACHINE_(?:PRIVATE_)?COMMAND_KIND\.CLEAR_STATUS_NOTICE\b/],
    ["host/effect dispatch callback", /\bdispatch\s*\(/],
    ["central effect-result transition switch", /\bswitch\s*\(\s*result\?\.kind\s*\)/],
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

test("machine effect vocabulary is split by concern", () => {
  const effectResultsSource = readSource(repoPath("src/core/machine/effect-results.js"));
  const effectRunnerSource = readSource(repoPath("src/core/machine/effect-runner.js"));
  const pasteReadSource = readSource(repoPath("src/core/machine/paste-read.js"));
  const eventsSource = readSource(repoPath("src/core/machine/events.js"));
  const violations = [];

  if (fs.existsSync(repoPath("src/core/machine/effects.js"))) {
    violations.push("forbidden: broad effects registry");
  }
  if (!/\bMACHINE_EFFECT_RESULT_KIND\b/.test(effectResultsSource)) {
    violations.push("missing: MACHINE_EFFECT_RESULT_KIND");
  }
  if (!/\bcreateReadPasteImageResult\b/.test(effectResultsSource)) {
    violations.push("missing: paste read result constructor");
  }
  if (!/\bMACHINE_PASTE_READ_OUTCOME_KIND\b/.test(pasteReadSource)) {
    violations.push("missing: paste read outcome vocabulary");
  }
  if (/\bswitch\s*\(\s*effect\?\.kind\s*\)/.test(effectRunnerSource)) {
    violations.push("forbidden: central effect-runner switch");
  }
  if (/\bCOMPLETE_PASTE_READ\b/.test(eventsSource)) {
    violations.push("forbidden: paste completion in public machine event vocabulary");
  }

  assert.deepEqual(violations, []);
});

test("machine status notice vocabulary does not leak to content or tests", () => {
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

test("placement planning is pure geometry and never constructs machine events", () => {
  const source = readSource(repoPath("src/core/placement-edit-planning.js"));
  const forbiddenPatterns = [
    ["machine event import", /\bMACHINE_(?:PRIVATE_)?COMMAND_KIND\b/],
    ["placement edit kind import", /\bMACHINE_PLACEMENT_EDIT_KIND\b/],
    ["planner lifecycle phase", /\bPLACEMENT_EDIT_PLAN_PHASE\b|\bphase\s*:/],
    ["planner semantic edit kind", /\bPLACEMENT_EDIT_PLAN_KIND\b|\bkind\s*:/],
    ["event payload property", /\bevent\s*:/],
    ["event type payload", /\btype:\s*MACHINE_(?:PRIVATE_)?COMMAND_KIND\./],
    ["machine state parameter", /\bstate,\s*\n\s*snapshot\b/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("durable session schema is split from registration queries and equality keys", () => {
  const sessionSource = readSource(repoPath("src/core/session.js"));
  const forbiddenPatterns = [
    ["registration solve query", /\bresolveRegistrationSolveState\b/],
    ["registration edit constructor", /\bcreate(?:Invalidated|PlacementEdited)Registration\b/],
    ["registration diff query", /\bresolveRegistrationPinMutation\b/],
    ["durable equality key", /\bcreate(?:Session|Placement|Registration|OverlayImage)SnapshotKey\b/],
    ["session equality", /\bsessionsEqual\b|\bplacementsEqual\b/],
  ];
  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(sessionSource))
    .map(([name]) => name);

  assert.deepEqual(violations, []);
});

test("paste adapter reports clipboard facts, not machine-shaped outcomes", () => {
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

test("persistence is storage-shaped and independent of live page projection", () => {
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

test("content bootstrap does not mix persistence migration with live page snapshots", () => {
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

test("page integration exposes explicit ports instead of a broad adapter object", () => {
  const source = readSource(repoPath("src/content/page-adapter.js"));
  const requiredPorts = [
    "pageSession",
    "pageObservation",
    "pageProjection",
    "mapGesture",
  ];
  const violations = [];

  for (const portName of requiredPorts) {
    if (!new RegExp(`\\b${portName}\\b`).test(source)) {
      violations.push(`missing: ${portName}`);
    }
  }
  if (!/\breturn\s*\{\s*pageSession,\s*pageObservation,\s*pageProjection,\s*mapGesture,\s*\}/s.test(source)) {
    violations.push("missing: explicit port return");
  }

  assert.deepEqual(violations, []);
});

test("content modules consume narrow page ports, not the monolithic adapter", () => {
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

test("overlay renderer is a pure render reconciler over an overlay view model", () => {
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

test("only machine internals import machine event vocabulary", () => {
  const violations = [];
  for (const filePath of listJavaScriptFiles(SOURCE_DIR)) {
    if (filePath.startsWith(MACHINE_DIR)) {
      continue;
    }
    const source = readSource(filePath);
    if (/\bMACHINE_(?:PRIVATE_)?COMMAND_KIND\b/.test(source)) {
      violations.push(path.relative(repoPath(), filePath));
    }
  }

  assert.deepEqual(violations, []);
});

test("runtime observation facts are ingested once, not mirrored by content callbacks", () => {
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

test("core input policy consumes normalized facts, never DOM event shape", () => {
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

test("tests exercise public ingress instead of raw mutation events", () => {
  const violations = [];
  const forbiddenPatterns = [
    ["raw machine event vocabulary", /\bMACHINE_(?:PRIVATE_)?COMMAND_KIND\b/],
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
