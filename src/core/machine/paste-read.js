export const MACHINE_PASTE_SOURCE = Object.freeze({
  CLIPBOARD_API: "clipboard-api",
  MANUAL_PASTE: "manual-paste",
});

export const MACHINE_PASTE_READ_OUTCOME_KIND = Object.freeze({
  CLIPBOARD_FACT: "clipboard-fact",
});

const KNOWN_PASTE_SOURCES = new Set(Object.values(MACHINE_PASTE_SOURCE));

export function normalizeMachinePasteSource(source) {
  return KNOWN_PASTE_SOURCES.has(source) ? source : null;
}

export function createClipboardFactPasteReadOutcome({ fact, snapshot }) {
  if (!fact) {
    return null;
  }
  return {
    kind: MACHINE_PASTE_READ_OUTCOME_KIND.CLIPBOARD_FACT,
    fact,
    snapshot: snapshot ?? null,
  };
}
