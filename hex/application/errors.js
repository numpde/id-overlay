export const APPLICATION_BOUNDARY_ERROR_CODE = Object.freeze({
  UNKNOWN_APPLICATION_COMMAND: "unknown-application-command",
  INVALID_APPLICATION_COMMAND: "invalid-application-command",
  INVALID_APPLICATION_STATE: "invalid-application-state",
  INVALID_DURABLE_STATE: "invalid-durable-state",
  UNSUPPORTED_DURABLE_STATE: "unsupported-durable-state",
});

export class ApplicationBoundaryError extends Error {
  constructor({ code, message }) {
    super(message);
    this.name = "ApplicationBoundaryError";
    this.code = code;
  }
}
