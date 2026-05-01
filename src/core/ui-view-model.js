import {
  UI_MODE_KIND,
} from "./ui-state-model.js";
import {
  resolveMainActionDescriptor,
} from "./ui-main-action-transition.js";

export const PANEL_TITLE = "Reference Overlay";
export const PANEL_REPO_URL = "https://github.com/numpde/id-overlay";

export function resolveUiViewModel({
  uiState,
}) {
  const mainAction = resolveMainActionDescriptor(uiState);

  return {
    opacityControl: {
      value: String(uiState.session.opacity),
      disabled: !mainAction.hasImage,
    },
    modeSwitch: resolveModeSwitchPresentation({
      mode: uiState.session.mode,
      hasImage: mainAction.hasImage,
    }),
    mainAction,
  };
}

function resolveModeSwitchPresentation({ mode, hasImage }) {
  const isAlign = mode === UI_MODE_KIND.ALIGN;
  const label = isAlign ? "Align" : "Trace";
  return {
    checked: isAlign,
    disabled: !hasImage,
    accessibleLabel: `Mode: ${label}`,
    mode: label.toLowerCase(),
  };
}
