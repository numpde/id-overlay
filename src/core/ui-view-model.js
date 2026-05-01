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
    opacityValue: String(uiState.session.opacity),
    modeSwitch: resolveModeSwitchPresentation({
      mode: uiState.session.mode,
      hasImage: mainAction.hasImage,
    }),
    hasImage: mainAction.hasImage,
    mainAction,
  };
}

function resolveModeSwitchPresentation({ mode, hasImage }) {
  return {
    checked: mode === UI_MODE_KIND.ALIGN,
    label: mode === UI_MODE_KIND.ALIGN ? "Align" : "Trace",
    ariaLabel: `Mode: ${mode === UI_MODE_KIND.ALIGN ? "Align" : "Trace"}`,
    disabled: !hasImage,
  };
}
