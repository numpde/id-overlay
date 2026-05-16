const DEBUG_LOG_KEY = "__ID_OVERLAY_EVENT_DEBUG_LOGS__";
const DEBUG_RAW_LOG_KEY = "__ID_OVERLAY_EVENT_DEBUG_RAW_LOGS__";
const DEBUG_DOM_EVENT = "id-overlay:debug-event";
const DEBUG_RAW_LOG_LIMIT = 2000;
const INPUT_SUMMARY_DEBOUNCE_MS = 220;
const INPUT_SUMMARY_MAX_WAIT_MS = 1000;
const LIFECYCLE_SUMMARY_DEBOUNCE_MS = 600;
const LIFECYCLE_SUMMARY_MAX_WAIT_MS = 2000;
const HIGH_CHURN_EVENTS = new Set([
  "pointermove",
  "mousemove",
  "wheel",
]);
const OVERLAY_LIFECYCLE_EVENTS = new Set([
  "bind-input",
  "destroy",
]);
const PAGE_OBSERVATION_QUEUE_EVENTS = new Set([
  "notify-requested",
  "notify-queued",
  "notify-coalesced",
]);
const TRUE_VALUES = new Set([
  "1",
  "true",
  "yes",
  "on",
]);

let debugSequence = 0;

export function createEventDebugLogger({
  ownerWindow = globalThis.window,
  consoleObject = globalThis.console,
  enabled = readDebugFlag(ownerWindow),
  namespace = "id-overlay-event",
} = {}) {
  const pendingSummaries = new Map();

  return {
    enabled: Boolean(enabled),
    log(scope, event, payload = {}) {
      if (!enabled) {
        return;
      }
      const record = normalizeDebugValue({
        seq: ++debugSequence,
        tMs: nowMs(ownerWindow),
        scope,
        event,
        ...payload,
      });
      pushWindowLog(ownerWindow, DEBUG_RAW_LOG_KEY, record, DEBUG_RAW_LOG_LIMIT);

      const summaryPolicy = resolveSummaryPolicy(scope, event);
      if (summaryPolicy) {
        queueSummarizedRecord({
          ownerWindow,
          consoleObject,
          namespace,
          pendingSummaries,
          policy: summaryPolicy,
          record,
        });
        return;
      }

      emitDebugRecord({
        ownerWindow,
        consoleObject,
        namespace,
        record,
      });
    },
    flush() {
      for (const group of Array.from(pendingSummaries.keys())) {
        flushDebugSummary({
          ownerWindow,
          consoleObject,
          namespace,
          pendingSummaries,
          group,
        });
      }
    },
  };
}

export function createEventDebugProbe({
  ownerWindow,
  document,
  root,
  logger,
} = {}) {
  if (!logger?.enabled) {
    return {
      destroy() {},
    };
  }

  const targets = [
    ["window", ownerWindow],
    ["document", document],
    ["host", root?.hostElement],
    ["shadowRoot", root?.shadowRoot],
    ["overlay-region", root?.overlay],
    ["panel-region", root?.panel],
  ].filter(([, target]) => target?.addEventListener);
  const types = [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
    "mousedown",
    "mousemove",
    "mouseup",
    "click",
    "dblclick",
    "wheel",
    "keydown",
    "keyup",
    "paste",
  ];
  const removers = [];

  for (const [label, target] of targets) {
    for (const type of types) {
      const listener = (event) => {
        logger.log(`probe.${label}`, type, domEventPayload(event));
      };
      target.addEventListener(type, listener, true);
      removers.push(() => target.removeEventListener(type, listener, true));
    }
  }

  logger.log("probe", "attached", {
    targetCount: targets.length,
    types,
  });

  return {
    destroy() {
      for (const remove of removers.splice(0)) {
        remove();
      }
      logger.log("probe", "detached", {
        targetCount: targets.length,
      });
    },
  };
}

export function domEventPayload(event) {
  return {
    type: event?.type,
    phase: eventPhaseName(event?.eventPhase),
    cancelable: Boolean(event?.cancelable),
    defaultPrevented: Boolean(event?.defaultPrevented),
    button: typeof event?.button === "number" ? event.button : undefined,
    buttons: typeof event?.buttons === "number" ? event.buttons : undefined,
    clientX: numberOrUndefined(event?.clientX),
    clientY: numberOrUndefined(event?.clientY),
    deltaX: numberOrUndefined(event?.deltaX),
    deltaY: numberOrUndefined(event?.deltaY),
    pointerId: numberOrUndefined(event?.pointerId),
    pointerType: event?.pointerType || undefined,
    altKey: Boolean(event?.altKey),
    ctrlKey: Boolean(event?.ctrlKey),
    metaKey: Boolean(event?.metaKey),
    shiftKey: Boolean(event?.shiftKey),
    key: event?.key || undefined,
    code: event?.code || undefined,
    target: labelNode(event?.target),
    currentTarget: labelNode(event?.currentTarget),
    path: typeof event?.composedPath === "function"
      ? event.composedPath().slice(0, 10).map(labelNode)
      : undefined,
  };
}

function readDebugFlag(ownerWindow) {
  if (!ownerWindow) {
    return false;
  }
  if (ownerWindow.__ID_OVERLAY_DEBUG_EVENTS__ === true) {
    return true;
  }
  try {
    return TRUE_VALUES.has(String(ownerWindow.localStorage?.getItem("idOverlay.debugEvents") ?? "").toLowerCase());
  } catch {
    return false;
  }
}

function resolveSummaryPolicy(scope, event) {
  if (HIGH_CHURN_EVENTS.has(event)) {
    return {
      group: `input:${event}`,
      debounceMs: INPUT_SUMMARY_DEBOUNCE_MS,
      maxWaitMs: INPUT_SUMMARY_MAX_WAIT_MS,
      resetOnRecord: true,
    };
  }
  if (scope === "overlay" && OVERLAY_LIFECYCLE_EVENTS.has(event)) {
    return {
      group: "overlay:lifecycle",
      debounceMs: LIFECYCLE_SUMMARY_DEBOUNCE_MS,
      maxWaitMs: LIFECYCLE_SUMMARY_MAX_WAIT_MS,
      resetOnRecord: true,
    };
  }
  if (scope === "page-observation" && PAGE_OBSERVATION_QUEUE_EVENTS.has(event)) {
    return {
      group: "page-observation:queue",
      debounceMs: 180,
      maxWaitMs: 800,
      resetOnRecord: true,
    };
  }
  if (scope === "overlay.dom" && event === "surface-motion-applied") {
    return {
      group: "overlay:dom-surface-motion",
      debounceMs: 180,
      maxWaitMs: 800,
      resetOnRecord: true,
    };
  }
  return null;
}

function queueSummarizedRecord({
  ownerWindow,
  consoleObject,
  namespace,
  pendingSummaries,
  policy,
  record,
}) {
  const group = policy.group;
  const summary = pendingSummaries.get(group);
  if (!summary) {
    pendingSummaries.set(group, {
      count: 1,
      countsByEvent: {
        [record.event]: 1,
      },
      countsByScope: {
        [record.scope]: 1,
      },
      latest: record,
      startedAtMs: record.tMs,
      debounceTimerId: scheduleDebugSummary({
        ownerWindow,
        consoleObject,
        namespace,
        pendingSummaries,
        group,
        delayMs: policy.debounceMs,
      }),
      maxTimerId: scheduleDebugSummary({
        ownerWindow,
        consoleObject,
        namespace,
        pendingSummaries,
        group,
        delayMs: policy.maxWaitMs,
      }),
      policy,
    });
    return;
  }

  summary.count += 1;
  summary.countsByEvent[record.event] = (summary.countsByEvent[record.event] || 0) + 1;
  summary.countsByScope[record.scope] = (summary.countsByScope[record.scope] || 0) + 1;
  summary.latest = record;
  if (policy.resetOnRecord) {
    clearDebugTimer(ownerWindow, summary.debounceTimerId);
    summary.debounceTimerId = scheduleDebugSummary({
      ownerWindow,
      consoleObject,
      namespace,
      pendingSummaries,
      group,
      delayMs: policy.debounceMs,
    });
  }
}

function scheduleDebugSummary({
  ownerWindow,
  consoleObject,
  namespace,
  pendingSummaries,
  group,
  delayMs,
}) {
  if (typeof ownerWindow?.setTimeout !== "function") {
    return null;
  }
  return ownerWindow.setTimeout(() => {
    flushDebugSummary({
      ownerWindow,
      consoleObject,
      namespace,
      pendingSummaries,
      group,
    });
  }, delayMs);
}

function clearDebugTimer(ownerWindow, timerId) {
  if (timerId !== null && typeof ownerWindow?.clearTimeout === "function") {
    ownerWindow.clearTimeout(timerId);
  }
}

function flushDebugSummary({
  ownerWindow,
  consoleObject,
  namespace,
  pendingSummaries,
  group,
}) {
  const summary = pendingSummaries.get(group);
  if (!summary) {
    return;
  }
  pendingSummaries.delete(group);
  clearDebugTimer(ownerWindow, summary.debounceTimerId);
  clearDebugTimer(ownerWindow, summary.maxTimerId);
  if (summary.count <= 0) {
    return;
  }
  emitDebugRecord({
    ownerWindow,
    consoleObject,
    namespace,
    record: normalizeDebugValue({
      seq: ++debugSequence,
      tMs: nowMs(ownerWindow),
      scope: "debug",
      event: "summary",
      group,
      totalCount: summary.count,
      countsByEvent: summary.countsByEvent,
      countsByScope: summary.countsByScope,
      durationMs: nowMs(ownerWindow) - summary.startedAtMs,
      latest: summary.latest,
    }),
  });
}

function emitDebugRecord({
  ownerWindow,
  consoleObject,
  namespace,
  record,
}) {
  pushWindowLog(ownerWindow, DEBUG_LOG_KEY, record);
  dispatchPageVisibleDebugEvent({
    ownerWindow,
    record,
  });
  try {
    consoleObject?.info?.(`[${namespace}] ${JSON.stringify(record)}`);
  } catch {
    consoleObject?.info?.(`[${namespace}]`, record);
  }
}

function dispatchPageVisibleDebugEvent({
  ownerWindow,
  record,
}) {
  const document = ownerWindow?.document;
  if (!document?.dispatchEvent || typeof ownerWindow.CustomEvent !== "function") {
    return;
  }
  try {
    document.dispatchEvent(new ownerWindow.CustomEvent(DEBUG_DOM_EVENT, {
      detail: JSON.stringify(record),
    }));
  } catch {
    // Debug visibility must never affect app behavior.
  }
}

function pushWindowLog(ownerWindow, key, record, limit = null) {
  if (!ownerWindow) {
    return;
  }
  ownerWindow[key] = Array.isArray(ownerWindow[key]) ? ownerWindow[key] : [];
  ownerWindow[key].push(record);
  if (Number.isFinite(limit) && ownerWindow[key].length > limit) {
    ownerWindow[key].splice(0, ownerWindow[key].length - limit);
  }
}

function normalizeDebugValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Number(value.toFixed(3)) : String(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeDebugValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, normalizeDebugValue(entry)]),
    );
  }
  return value;
}

function nowMs(ownerWindow) {
  return ownerWindow?.performance?.now?.() ?? globalThis.performance?.now?.() ?? Date.now();
}

function numberOrUndefined(value) {
  return typeof value === "number" ? value : undefined;
}

function eventPhaseName(phase) {
  if (phase === 1) {
    return "capture";
  }
  if (phase === 2) {
    return "target";
  }
  if (phase === 3) {
    return "bubble";
  }
  return undefined;
}

function labelNode(node) {
  if (!node) {
    return null;
  }
  if (node.window === node) {
    return "window";
  }
  if (node.nodeType === 9) {
    return "document";
  }
  if (node.nodeType === 11) {
    return "shadowRoot";
  }
  const tagName = node.tagName?.toLowerCase?.();
  if (!tagName) {
    return String(node);
  }
  const parts = [tagName];
  if (node.id) {
    parts.push(`#${node.id}`);
  }
  if (typeof node.className === "string" && node.className.trim()) {
    parts.push(`.${node.className.trim().replace(/\s+/gu, ".")}`);
  }
  for (const [key, value] of Object.entries(node.dataset ?? {})) {
    if (/^(region|control|overlayImage|idOverlayOwned|action)$/u.test(key)) {
      parts.push(`[data-${dasherize(key)}${value ? `=${value}` : ""}]`);
    }
  }
  return parts.join("");
}

function dasherize(value) {
  return value.replace(/[A-Z]/gu, (match) => `-${match.toLowerCase()}`);
}
