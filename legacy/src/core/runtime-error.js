export const RUNTIME_ERROR_SOURCE = Object.freeze({
  BOOTSTRAP: "bootstrap",
  INTERACTIONS: "interactions",
  OVERLAY: "overlay",
  PAGE_ADAPTER: "page-adapter",
  PANEL: "panel",
  STORAGE: "storage",
});

const DEFAULT_RUNTIME_ERROR_MESSAGE = "The overlay hit an unexpected error. Try the action again.";

export function createRuntimeError({
  source,
  operation,
  error,
  message = null,
  recoverable = true,
  details = null,
} = {}) {
  const normalized = normalizeError(error);
  return Object.freeze({
    source: source ?? RUNTIME_ERROR_SOURCE.INTERACTIONS,
    operation: operation ?? "unknown",
    recoverable,
    name: normalized.name,
    message: message ?? normalized.message ?? DEFAULT_RUNTIME_ERROR_MESSAGE,
    details: details ?? null,
  });
}

export function normalizeError(error) {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string" && error.trim()) {
    return new Error(error);
  }

  return new Error(DEFAULT_RUNTIME_ERROR_MESSAGE);
}
