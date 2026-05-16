export class RuntimeBoundaryError extends Error {
  constructor({ code, message }) {
    super(message);
    this.name = "RuntimeBoundaryError";
    this.code = code;
  }
}

export function createRuntimeDriver({
  initialState,
  effectHandlers,
  stepApplication,
  subscriptions = [],
}) {
  let currentState = initialState;
  let currentViewFeedback = null;
  let disposed = false;
  let didDispose = false;

  return {
    async dispatch(command) {
      if (disposed) {
        return;
      }
      await runApplicationCommand(command);
    },
    getState() {
      return currentState;
    },
    getViewFeedback() {
      return currentViewFeedback;
    },
    dispose() {
      if (didDispose) {
        return;
      }
      disposed = true;
      didDispose = true;
      for (const dispose of subscriptions) {
        dispose();
      }
    },
  };

  async function runApplicationCommand(command) {
    const result = stepApplication({
      state: currentState,
      command,
    });
    currentState = result.state;
    currentViewFeedback = result.viewFeedback ?? null;

    for (const effect of result.effects) {
      await runEffect(effect);
      if (disposed) {
        return;
      }
    }
  }

  async function runEffect(effect) {
    const handler = effectHandlers[effect.kind];
    if (!handler) {
      throw new RuntimeBoundaryError({
        code: "unknown-effect-kind",
        message: "Unknown effect kind.",
      });
    }

    let effectResult;
    try {
      effectResult = await handler(effect);
    } catch {
      effectResult = {
        kind: "runtime-effect-failed",
        effectKind: effect.kind,
        requestId: effect.requestId,
        error: {
          code: "effect-handler-failed",
        },
      };
    }
    if (disposed || effectResult === null) {
      return;
    }
    if (!isPlainData(effectResult)) {
      throw new RuntimeBoundaryError({
        code: "non-plain-effect-result",
        message: "Effect result was not plain data.",
      });
    }
    await runApplicationCommand(effectResult);
  }
}

export function wireRuntime({
  initialState,
  stepApplication,
  effectHandlers,
  createRuntimeDriver: createDriver = createRuntimeDriver,
}) {
  return createDriver({
    initialState,
    stepApplication,
    effectHandlers,
  });
}

function isPlainData(value) {
  if (value === null) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isPlainData);
  }

  const valueType = typeof value;
  if (["string", "boolean"].includes(valueType)) {
    return true;
  }
  if (valueType === "number") {
    return Number.isFinite(value);
  }
  if (valueType !== "object") {
    return false;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return false;
  }
  return Object.values(value).every(isPlainData);
}
