import { clampOpacity, opacityFromWheelDelta } from "../core/opacity.js";
import { MACHINE_MODE } from "../core/machine/events.js";
import { activatePanelPrimaryAction } from "../core/machine/panel-primary-action.js";

export function createPanelCommandAdapter({ machineHost }) {
  return {
    activatePanelPrimary,
    activatePanelMode,
    activatePanelModeStep,
    changePanelOpacity,
    changePanelOpacityByWheel,
    activateUndo: machineHost.activateUndo,
    activateRedo: machineHost.activateRedo,
  };

  function activatePanelPrimary() {
    return activatePanelPrimaryAction({
      state: machineHost.getState(),
      actions: {
        requestPanelIntent: machineHost.requestPanelIntent,
        cancelPanelIntentWithStatusNotice: machineHost.cancelPanelIntentWithStatusNotice,
        clearPins: machineHost.clearPins,
        clearImage: machineHost.clearImage,
      },
    });
  }

  function activatePanelMode({ checked }) {
    return machineHost.selectMode(checked ? MACHINE_MODE.TRACE : MACHINE_MODE.ALIGN);
  }

  function activatePanelModeStep({ deltaY }) {
    return machineHost.selectMode(deltaY < 0 ? MACHINE_MODE.ALIGN : MACHINE_MODE.TRACE);
  }

  function changePanelOpacity(value) {
    return machineHost.setOpacity(clampOpacity(Number(value)));
  }

  function changePanelOpacityByWheel({ value, deltaY }) {
    return machineHost.setOpacity(opacityFromWheelDelta(Number(value), deltaY));
  }
}
