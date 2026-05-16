import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  startExtensionContent,
} from "../../../bootstrap/extension-content.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

const TEST_NAME = "extension content rendered mode switch changes durable mode";

// Class-b: this is a content-entrypoint user-flow witness, not a direct shell
// command shortcut. The rendered Trace/Align switch must cross into the
// application command path, persist the selected mode, and re-render.
test(TEST_NAME, async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: TEST_NAME,
  });
  const caseId = "content-rendered-mode-switch";
  const durableState = durableImageState({
    mode: "align",
  });
  const { window } = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://www.openstreetmap.org/edit?editor=id",
  });
  Object.defineProperty(window.document, "readyState", {
    configurable: true,
    value: "complete",
  });
  const chromeApi = createChromeApiHarness({
    trace,
    caseId,
    durableState,
  });

  const result = await trace.withSource("source.extension-content-start", async () => {
    const started = await startExtensionContent({
      document: window.document,
      ownerWindow: window,
      chromeApi,
      location: window.location,
    });
    trace.edge(flowEdge("source.extension-content-start", "sink.render", flowAttrs({
      caseId,
      phase: "startup",
      surface: "extension-content",
      terminal: "view-result",
    })));
    return started;
  });

  assert.equal(result.kind, "started");
  assert.equal(result.runtime.getState().session.mode, "align");

  await clickRenderedMode({
    document: window.document,
    trace,
    caseId,
    expectedMode: "trace",
  });
  await waitFor(() => result.runtime.getState().session.mode === "trace");

  await clickRenderedMode({
    document: window.document,
    trace,
    caseId,
    expectedMode: "align",
  });
  await waitFor(() => result.runtime.getState().session.mode === "align");

  assert.deepEqual(chromeApi.writes.map((write) => write["id-overlay.durable-state"].session.mode), [
    "trace",
    "align",
  ]);
});

async function clickRenderedMode({
  document,
  trace,
  caseId,
  expectedMode,
}) {
  const modeSwitch = renderedControl(document, "mode-switch");
  const input = modeSwitch.querySelector("input[type='checkbox']");
  assert.ok(input, "mode switch must expose a checkbox input");
  assert.equal(modeSwitch.querySelector("[data-mode-option]"), null);
  assert.equal(input.getAttribute("aria-label"), `Mode: ${input.checked ? "Align" : "Trace"}`);
  trace.edge(flowEdge("source.rendered-command.select-mode", "command.select-mode", flowAttrs({
    caseId,
    phase: expectedMode,
    surface: "extension-content",
    provider: "extension-ui-host",
  })));
  input.click();
  await flushMicrotasks();
  trace.edge(flowEdge("source.rendered-command.select-mode", "sink.render", flowAttrs({
    caseId,
    phase: expectedMode,
    surface: "extension-content",
    terminal: "view-result",
  })));
}

function renderedControl(document, control) {
  const host = document.getElementById("id-overlay");
  assert.ok(host, "extension content must mount the owned UI root");
  const element = host.shadowRoot.querySelector(`[data-control='${control}']`);
  assert.ok(element, `extension content must render ${control} control`);
  return element;
}

function createChromeApiHarness({
  trace,
  caseId,
  durableState,
}) {
  const values = {
    "id-overlay.durable-state": durableState,
  };
  const api = {
    writes: [],
    storage: {
      local: {
        async get(key) {
          return {
            [key]: values[key],
          };
        },
        async set(record) {
          Object.assign(values, record);
          api.writes.push(record);
          const mode = record["id-overlay.durable-state"]?.session?.mode;
          trace.edge(flowEdge("command.select-mode", "effect.persist-durable-state", flowAttrs({
            caseId,
            phase: mode,
            surface: "extension-content",
            provider: "application",
          })));
          trace.edge(flowEdge("effect.persist-durable-state", "port.durable-state.write", flowAttrs({
            caseId,
            phase: mode,
            surface: "extension-content",
            provider: "browser-shell-effect-handler",
          })));
          trace.edge(flowEdge("port.durable-state.write", "sink.durable-state.write", flowAttrs({
            caseId,
            phase: mode,
            surface: "extension-content",
            terminal: "durable-write",
          })));
        },
      },
    },
  };
  return api;
}

function durableImageState({ mode }) {
  return {
    session: {
      mode,
      referenceImage: {
        imageDataRef: "data:image/png;base64,bW9kZS1zd2l0Y2g=",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
  };
}

function flowAttrs({
  caseId,
  phase,
  surface,
  provider,
  terminal,
} = {}) {
  const attributes = {};
  if (caseId !== undefined) {
    attributes.case = caseId;
  }
  if (phase !== undefined) {
    attributes.phase = phase;
  }
  if (surface !== undefined) {
    attributes.surface = surface;
  }
  if (provider !== undefined) {
    attributes.provider = provider;
  }
  if (terminal !== undefined) {
    attributes.terminal = terminal;
  }
  return attributes;
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }
    await flushMicrotasks();
  }
  assert.fail("Timed out waiting for rendered mode command.");
}

function flushMicrotasks() {
  return new Promise((resolve) => {
    queueMicrotask(resolve);
  });
}
