import { KEYBOARD_SHORTCUT_ACTION } from "../../core/interaction-policy.js";
import {
  resolveKeyboardProjection,
  resolvePassThroughReleaseProjection,
} from "../../core/input-projection.js";
import { hasOverlayImageSession, SESSION_MODE } from "../../core/session.js";
import { createKeyboardListeners } from "../../platform/keyboard-listeners.js";
import { createKeyboardInputFactFromEvent } from "../input-event-facts.js";

export function createKeyboardInputRouter({
  keyTarget = globalThis.window,
  keyboardGateway = null,
  getMachineState,
  getRuntimeState,
  getPointerScreenPx,
  executePinToggleAtScreenPoint,
  selectMode,
  observePassThroughPress,
  observePassThroughRelease,
  resetRuntimeObservation,
  logger,
}) {
  const shortcutHandlers = createKeyboardShortcutHandlers({
    getPointerScreenPx,
    executePinToggleAtScreenPoint,
    selectMode,
    observePassThroughPress,
    logger,
  });
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

    const keyboard = createKeyboardInputFactFromEvent(event);
    const keyboardProjection = resolveKeyboardProjection({
      machineState: getMachineState(),
      runtime: getRuntimeState(),
      keyboard,
    });
    const shortcutAction = keyboardProjection.action;
    if (!shortcutAction) {
      logIgnoredKeyDown({ event, state, keyboardProjection });
      return;
    }

    consumeEvent(event);
    shortcutHandlers[shortcutAction]?.();
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

  function handleKeyUp(event) {
    const keyboard = createKeyboardInputFactFromEvent(event);
    const passThroughReleaseProjection = resolvePassThroughReleaseProjection({
      machineState: getMachineState(),
      keyboard,
      runtime: getRuntimeState(),
    });
    if (!passThroughReleaseProjection.shouldRelease) {
      logger.debug("Ignoring keyup because pass-through is not active for this event", {
        code: event.code,
      });
      return;
    }
    consumeEvent(event);
    logger.info("Keyboard pass-through released");
    observePassThroughRelease();
  }

  function handleWindowBlur() {
    resetRuntimeObservation({
      endPointerScreenPx: getPointerScreenPx(),
      pointerScreenPx: null,
    });
  }
}

function createKeyboardShortcutHandlers({
  getPointerScreenPx,
  executePinToggleAtScreenPoint,
  selectMode,
  observePassThroughPress,
  logger,
}) {
  return Object.freeze({
    [KEYBOARD_SHORTCUT_ACTION.TOGGLE_PIN_CURRENT_POINTER]() {
      logger.info("Keyboard pin toggle requested", {
        pointerScreenPx: getPointerScreenPx(),
      });
      executePinToggleAtScreenPoint(getPointerScreenPx());
    },
    [KEYBOARD_SHORTCUT_ACTION.SWITCH_TO_TRACE]() {
      logger.info("Keyboard trace escape requested");
      selectMode(SESSION_MODE.TRACE);
    },
    [KEYBOARD_SHORTCUT_ACTION.ENABLE_PASS_THROUGH]() {
      logger.info("Keyboard pass-through activated");
      observePassThroughPress();
    },
  });
}

function consumeEvent(event) {
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
}
