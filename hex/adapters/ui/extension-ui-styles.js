export const EXTENSION_UI_STYLES = `
:host {
  --id-overlay-blue: #2563eb;
  --id-overlay-blue-strong: #1d4ed8;
  --id-overlay-green: #16a34a;
  --id-overlay-green-strong: #15803d;
  --id-overlay-danger: #dc2626;
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
  font: 13px system-ui, sans-serif;
}
[data-region="overlay"] {
  position: fixed;
  inset: 0;
  z-index: 10;
  pointer-events: none;
}
:host > [data-region="panel"] {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 20;
  pointer-events: auto;
}
.id-overlay-panel {
  box-sizing: border-box;
  width: 280px;
  padding: 12px;
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.92);
  color: #f8fafc;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.38);
  font: 13px/1.35 system-ui, sans-serif;
}
.id-overlay-panel,
.id-overlay-panel * {
  box-sizing: border-box;
}
.id-overlay-panel__header {
  cursor: move;
  margin-bottom: 10px;
}
.id-overlay-panel--dragging .id-overlay-panel__header {
  cursor: grabbing;
}
.id-overlay-panel__title-row {
  display: flex;
  align-items: center;
}
.id-overlay-panel__title-row {
  gap: 8px;
  justify-content: space-between;
}
.id-overlay-panel__title {
  margin: 0;
  font: 600 14px/1.2 system-ui, sans-serif;
}
.id-overlay-panel__repo-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: #93c5fd;
  text-decoration: none;
  cursor: pointer;
  user-select: none;
}
.id-overlay-panel__repo-icon {
  width: 16px;
  height: 16px;
}
.id-overlay-panel__repo-link:hover,
.id-overlay-panel__repo-link:focus-visible {
  color: #bfdbfe;
  outline: none;
}
.id-overlay-panel__meta {
  min-height: 1em;
  margin: 2px 0 0;
  color: #cbd5e1;
  font-size: 11px;
}
.id-overlay-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 7px;
  background: rgba(248, 250, 252, 0.96);
  color: #0f172a;
  font: 600 13px/1 system-ui, sans-serif;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18);
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease, transform 80ms ease;
}
.id-overlay-button:hover:not(:disabled) {
  background: #ffffff;
  border-color: rgba(147, 197, 253, 0.72);
}
.id-overlay-button:active:not(:disabled) {
  transform: translateY(1px);
}
.id-overlay-button:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}
.id-overlay-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}
.id-overlay-button--primary {
  width: 100%;
  min-width: 0;
  border-color: rgba(37, 99, 235, 0.72);
  background: var(--id-overlay-blue);
  color: #ffffff;
}
.id-overlay-button--primary:hover:not(:disabled) {
  border-color: rgba(96, 165, 250, 0.9);
  background: var(--id-overlay-blue-strong);
}
.id-overlay-button--confirm {
  border-color: rgba(220, 38, 38, 0.72);
  background: var(--id-overlay-danger);
  color: #ffffff;
}
.id-overlay-button--undo,
.id-overlay-button--redo {
  min-width: 30px;
  inline-size: 30px;
  padding: 0;
  font-size: 18px;
  line-height: 1;
}
.id-overlay-panel__controls-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 42px 64px;
  align-items: center;
  gap: 8px;
}
.id-overlay-panel__history-actions {
  display: grid;
  grid-template-columns: repeat(2, 30px);
  align-items: center;
  gap: 4px;
}
.id-overlay-mode-switch {
  display: inline-grid;
  align-items: center;
  grid-template-columns: 42px;
  justify-content: center;
  min-height: 30px;
  user-select: none;
}
.id-overlay-mode-switch__input {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  opacity: 0;
  pointer-events: none;
}
.id-overlay-mode-switch__track {
  position: relative;
  display: inline-block;
  inline-size: 42px;
  block-size: 24px;
  border: 1px solid rgba(15, 23, 42, 0.18);
  border-radius: 999px;
  background: var(--id-overlay-green);
  box-sizing: border-box;
  cursor: pointer;
  transition: background-color 120ms ease;
}
.id-overlay-mode-switch[data-mode="align"] .id-overlay-mode-switch__track {
  background: var(--id-overlay-blue);
}
.id-overlay-mode-switch[data-mode="trace"] .id-overlay-mode-switch__track {
  background: var(--id-overlay-green);
}
.id-overlay-mode-switch__thumb {
  position: absolute;
  inset-block-start: 2px;
  inset-inline-start: 2px;
  inline-size: 18px;
  block-size: 18px;
  border-radius: 999px;
  background: #f8fafc;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.4);
  transition: transform 120ms ease;
}
.id-overlay-mode-switch__input:checked + .id-overlay-mode-switch__track .id-overlay-mode-switch__thumb {
  transform: translateX(18px);
}
.id-overlay-mode-switch__input:focus-visible + .id-overlay-mode-switch__track {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}
.id-overlay-mode-switch__input:disabled + .id-overlay-mode-switch__track {
  opacity: 0.45;
}
.id-overlay-field {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}
.id-overlay-field__label,
.id-overlay-panel__status {
  color: #e2e8f0;
}
.id-overlay-field__slider {
  width: 100%;
  min-width: 0;
}
.id-overlay-panel__status-wrap {
  margin-top: 10px;
}
.id-overlay-panel__status {
  margin: 0;
}
.id-overlay-panel__status-detail {
  display: none;
}
`;
