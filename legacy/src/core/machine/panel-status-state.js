import {
  MACHINE_PANEL_INTENT,
} from "./events.js";
import { MACHINE_STATUS_NOTICE_KIND } from "./status-notices.js";

export function createIdlePanel() {
  return {
    intent: MACHINE_PANEL_INTENT.IDLE,
    requestId: null,
  };
}

export function createInitialStatus() {
  return {
    notice: null,
    lastRequestId: 0,
  };
}

export function normalizePanel(panel = {}) {
  return {
    intent: normalizePanelIntent(panel.intent),
    requestId: normalizeRequestId(panel.requestId),
  };
}

export function normalizePanelIntent(intent) {
  return isKnownPanelIntent(intent)
    ? intent
    : MACHINE_PANEL_INTENT.IDLE;
}

export function isKnownPanelIntent(intent) {
  return Object.values(MACHINE_PANEL_INTENT).includes(intent);
}

export function isValidPanelRequestId(requestId) {
  return Number.isInteger(requestId) && requestId > 0;
}

export function normalizeStatus(status = {}) {
  const notice = normalizeStatusNotice(status.notice);
  const lastRequestId = normalizeStatusRequestId(status.lastRequestId);
  return {
    notice,
    lastRequestId: Math.max(lastRequestId, notice?.requestId ?? 0),
  };
}

export function replacePanel(state, panel) {
  return {
    ...state,
    panel: normalizePanel({
      ...state.panel,
      ...panel,
    }),
  };
}

export function replaceStatus(state, status) {
  return {
    ...state,
    status: normalizeStatus({
      ...state.status,
      ...status,
    }),
  };
}

function normalizeStatusNotice(notice) {
  if (!notice || typeof notice !== "object") {
    return null;
  }
  if (!Object.values(MACHINE_STATUS_NOTICE_KIND).includes(notice.kind)) {
    return null;
  }
  const requestId = normalizeRequestId(notice.requestId);
  if (requestId === null) {
    return null;
  }
  return {
    requestId,
    kind: notice.kind,
    payload: notice.payload ?? null,
  };
}

function normalizeStatusRequestId(requestId) {
  const value = Number(requestId);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function normalizeRequestId(requestId) {
  return isValidPanelRequestId(requestId) ? requestId : null;
}
