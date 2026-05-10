export function createPanelAdapter({
  document,
  emitCommand = () => {},
  writePanelPosition = () => {},
}) {
  return {
    render(viewModel) {
      const root = document.createElement("section");

      const primary = document.createElement("button");
      primary.dataset.control = "primary";
      primary.textContent = viewModel.primaryAction.label;
      primary.setAttribute("aria-label", viewModel.primaryAction.label);
      primary.disabled = !viewModel.primaryAction.enabled;
      primary.addEventListener("click", () => {
        emitCommand({
          kind: "activate-primary-action",
        });
      });
      root.append(primary);

      const align = document.createElement("button");
      align.dataset.control = "align";
      align.setAttribute("aria-label", "Align mode");
      align.setAttribute("aria-pressed", String(viewModel.modeSwitch.selected === "align"));
      align.disabled = !viewModel.modeSwitch.align.enabled;
      align.addEventListener("click", () => {
        emitCommand({
          kind: "select-mode",
          mode: "align",
        });
      });
      root.append(align);

      const undo = document.createElement("button");
      undo.dataset.control = "undo";
      undo.disabled = !viewModel.history.undo.enabled;
      undo.title = viewModel.history.undo.label ?? "";
      undo.setAttribute("aria-label", viewModel.history.undo.label ?? "Undo");
      undo.addEventListener("click", () => {
        emitCommand({
          kind: "undo",
        });
      });
      root.append(undo);

      const redo = document.createElement("button");
      redo.dataset.control = "redo";
      redo.disabled = !viewModel.history.redo.enabled;
      redo.title = viewModel.history.redo.label ?? "";
      redo.setAttribute("aria-label", viewModel.history.redo.label ?? "Redo");
      redo.addEventListener("click", () => {
        emitCommand({
          kind: "redo",
        });
      });
      root.append(redo);

      const status = document.createElement("output");
      status.dataset.region = "status";
      status.textContent = viewModel.status;
      root.append(status);

      return root;
    },
    dragPanel({ fromScreenPx, toScreenPx }) {
      writePanelPosition({
        x: toScreenPx.x - fromScreenPx.x,
        y: toScreenPx.y - fromScreenPx.y,
      });
    },
  };
}
