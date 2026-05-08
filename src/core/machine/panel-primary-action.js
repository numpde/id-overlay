import {
  MACHINE_PANEL_INTENT,
} from "./events.js";
import { MACHINE_STATUS_NOTICE_KIND } from "./status-notices.js";
import {
  MACHINE_PANEL_PRIMARY_ACTION_KIND,
  selectPanelPrimaryAction,
} from "./policy.js";

export function activatePanelPrimaryAction({ state, actions }) {
  const action = selectPanelPrimaryAction(state);
  if (action.disabled) {
    return null;
  }

  switch (action.kind) {
    case MACHINE_PANEL_PRIMARY_ACTION_KIND.PASTE:
      return actions.requestPanelIntent(MACHINE_PANEL_INTENT.PASTE_ARMED);
    case MACHINE_PANEL_PRIMARY_ACTION_KIND.PASTE_ARMED:
      return actions.cancelPanelIntentWithStatusNotice({
        requestId: state.panel.requestId,
        noticeKind: MACHINE_STATUS_NOTICE_KIND.PASTE_CANCELLED,
      });
    case MACHINE_PANEL_PRIMARY_ACTION_KIND.CLEAR_PINS:
      return actions.requestPanelIntent(MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM);
    case MACHINE_PANEL_PRIMARY_ACTION_KIND.CONFIRM_CLEAR_PINS:
      return actions.clearPins();
    case MACHINE_PANEL_PRIMARY_ACTION_KIND.CLEAR_IMAGE:
      return actions.requestPanelIntent(MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM);
    case MACHINE_PANEL_PRIMARY_ACTION_KIND.CONFIRM_CLEAR_IMAGE:
      return actions.clearImage();
    default:
      return null;
  }
}
