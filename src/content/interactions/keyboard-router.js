import { KEYBOARD_SHORTCUT_ACTION } from "../../core/interaction-policy.js";
import { resolveInputProjection } from "../../core/input-projection.js";
import { hasOverlayImageSession, SESSION_MODE } from "../../core/session.js";
import { createKeyboardListeners } from "../../platform/keyboard-listeners.js";

export function createKeyboardInputRouter({
  keyTarget = globalThis.window,
  keyboardGateway = null,
  getMachineState,
  getRuntimeState,
  getPointerScreenPx,
  executePinToggleAtScreenPoint,
  applyMode,
  setPassThrough,
  resetInteractionState,
  logger,
}) {
  // TODO(smell): Keyboard routing still receives low-level runtime callbacks
  // beside semantic commands. Replace setPassThrough/resetInteractionState with
  // keyboard interaction commands so shortcut handling never knows runtime
  // mutation vocabulary.
  const keyboardListeners = createKeyboardListeners({
    keyTarget,
    keyboardGateway,
    keydown: handleKeyDown,
    keyup: handleKeyUp,
    blur: handleWindowBlur,
  });

  return {
    destroy() {
      keyboardListeners.destroy();
    },
  };

  function handleKeyDown(event) {
    const state = getMachineState().session;
    if (!hasOverlayImageSession(state)) {
      return;
    }

    const keyboardProjection = resolveInputProjection({
      machineState: getMachineState(),
      runtime: getRuntimeState(),
      event,
    }).keyboard;
    const shortcutAction = keyboardProjection.action;
    if (!shortcutAction) {
      logIgnoredKeyDown({ event, state, keyboardProjection });
      return;
    }

    consumeEvent(event);
    dispatchKeyboardShortcut(shortcutAction);
  }

  function logIgnoredKeyDown({ event, state, keyboardProjection }) {
    if (!keyboardProjection.shouldIgnore) {
      logger.debug("Ignoring keydown because it is not an overlay shortcut", {
        code: event.code,
        mode: state.mode,
      });
      return;
    }
    logger.debug("Ignoring keyboard shortcut because the focused target is editable", {
      code: event.code,
    });
  }

  function dispatchKeyboardShortcut(shortcutAction) {
    if (shortcutAction === KEYBOARD_SHORTCUT_ACTION.TOGGLE_PIN_CURRENT_POINTER) {
      logger.info("Keyboard pin toggle requested", {
        pointerScreenPx: getPointerScreenPx(),
      });
      executePinToggleAtScreenPoint(getPointerScreenPx());
      return;
    }

    if (shortcutAction === KEYBOARD_SHORTCUT_ACTION.SWITCH_TO_TRACE) {
      logger.info("Keyboard trace escape requested");
      applyMode(SESSION_MODE.TRACE);
      return;
    }

    if (shortcutAction === KEYBOARD_SHORTCUT_ACTION.ENABLE_PASS_THROUGH) {
      logger.info("Keyboard pass-through activated");
      setPassThrough(true);
    }
  }

  function handleKeyUp(event) {
    const inputProjection = resolveInputProjection({
      machineState: getMachineState(),
      event,
      runtime: getRuntimeState(),
    });
    if (!inputProjection.passThroughRelease.shouldRelease) {
      logger.debug("Ignoring keyup because pass-through is not active for this event", {
        code: event.code,
      });
      return;
    }
    consumeEvent(event);
    logger.info("Keyboard pass-through released");
    setPassThrough(false);
  }

  function handleWindowBlur() {
    resetInteractionState({
      endPointerScreenPx: getPointerScreenPx(),
      pointerScreenPx: null,
    });
  }
}

function consumeEvent(event) {
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
}
