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

const TEST_NAME = "extension content wires reference-image input from rendered Paste";

// Class-b: this is the real content-entrypoint witness for reference-image
// input. Shell tests may supply a port by hand; this one must prove the content
// host created the browser input port users actually exercise.
test(TEST_NAME, async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: TEST_NAME,
  });
  const caseId = "content-manual-paste";
  const request = "reference-image-input-1";
  const resource = "paste-listener-1";
  const referenceImage = {
    imageDataRef: "data:image/png;base64,Y29udGVudC1yZWZlcmVuY2U=",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
  const { window } = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://www.openstreetmap.org/edit?editor=id",
  });
  Object.defineProperty(window.document, "readyState", {
    configurable: true,
    value: "complete",
  });
  installImageDecodeStubs({
    ownerWindow: window,
    referenceImage,
  });
  const ownerWindow = installPasteListenerTrace({
    ownerWindow: window,
    trace,
    caseId,
    request,
    resource,
  });
  const chromeApi = createChromeApiHarness({
    trace,
    caseId,
    request,
  });

  const result = await trace.withSource("source.extension-content-start", async () => {
    const started = await startExtensionContent({
      document: window.document,
      ownerWindow,
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

  const primary = primaryButton(window.document);
  assert.equal(primary.textContent, "Paste");
  await trace.withSource("source.rendered-command.activate-primary-action", async () => {
    trace.edge(flowEdge("source.rendered-command.activate-primary-action", "command.activate-primary-action", flowAttrs({
      caseId,
      phase: "start-input",
      request,
      surface: "extension-content",
      provider: "extension-ui-host",
    })));
    primary.click();
    await flushMicrotasks();
  });

  assert.equal(
    ownerWindow.listenerCount("paste"),
    1,
    "Paste must arm a real owner-window paste listener in the content entrypoint.",
  );

  const pasteEvent = await ownerWindow.dispatchPaste({
    dataUrl: referenceImage.imageDataRef,
  });
  await waitFor(() => result.runtime.getState().session?.referenceImage);

  assert.equal(pasteEvent.defaultPrevented, true);
  assert.deepEqual(result.runtime.getState(), {
    session: {
      mode: "align",
      referenceImage,
    },
    notice: {
      kind: "reference-image-loaded",
      referenceImage,
    },
  });
  assert.deepEqual(chromeApi.latestSet, {
    "id-overlay.durable-state": {
      session: {
        mode: "align",
        referenceImage,
      },
    },
  });

  const overlayImage = renderedOverlayImage(window.document);
  assert.match(
    overlayImage.style.backgroundImage,
    /data:image\/png/,
    "Accepted pasted image must be visible in the rendered overlay, not only stored in application state.",
  );
  trace.edge(flowEdge("callback.paste-event", "sink.overlay-image.painted", flowAttrs({
    caseId,
    phase: "accepted-outcome",
    request,
    surface: "extension-content",
    terminal: "render-result",
  })));
});

function primaryButton(document) {
  const host = document.getElementById("id-overlay");
  assert.ok(host, "extension content must mount the owned UI root");
  const primary = host.shadowRoot.querySelector("[data-control='primary']");
  assert.ok(primary, "extension content must render the primary action");
  return primary;
}

function renderedOverlayImage(document) {
  const host = document.getElementById("id-overlay");
  assert.ok(host, "extension content must mount the owned UI root");
  const overlayImage = host.shadowRoot.querySelector("[data-overlay-image]");
  assert.ok(overlayImage, "accepted pasted image must render an overlay image element");
  return overlayImage;
}

function installPasteListenerTrace({
  ownerWindow,
  trace,
  caseId,
  request,
  resource,
}) {
  const nativeAddEventListener = ownerWindow.addEventListener.bind(ownerWindow);
  const nativeRemoveEventListener = ownerWindow.removeEventListener.bind(ownerWindow);
  const pasteListeners = new Map();

  ownerWindow.addEventListener = (type, handler, options) => {
    if (type !== "paste") {
      nativeAddEventListener(type, handler, options);
      return;
    }
    trace.edge(flowEdge("command.activate-primary-action", "effect.request-reference-image-input", flowAttrs({
      caseId,
      phase: "start-input",
      request,
      surface: "extension-content",
      provider: "application",
    })));
    trace.edge(flowEdge("effect.request-reference-image-input", "port.reference-image-input.start", flowAttrs({
      caseId,
      phase: "start-input",
      request,
      surface: "extension-content",
      provider: "browser-shell-effect-handler",
    })));
    trace.edge(flowEdge("port.reference-image-input.start", "callback.reference-image-input.started", flowAttrs({
      caseId,
      phase: "start-input",
      request,
      surface: "extension-content",
      provider: "reference-image-input-port",
    })));
    trace.edge(flowEdge("callback.reference-image-input.started", "port.clipboard-image.read", flowAttrs({
      caseId,
      phase: "direct-unavailable",
      request,
      surface: "extension-content",
      provider: "reference-image-input-port",
    })));
    trace.edge(flowEdge("port.clipboard-image.read", "callback.image-source-result", flowAttrs({
      caseId,
      phase: "direct-unavailable",
      request,
      surface: "extension-content",
      provider: "reference-image-input-port",
    })));
    trace.edge(flowEdge("callback.image-source-result", "port.paste-listener.add", flowAttrs({
      caseId,
      phase: "start-input",
      request,
      surface: "extension-content",
      provider: "extension-content-host",
    })));
    trace.edge(flowEdge("port.paste-listener.add", "resource.paste-listener.active", flowAttrs({
      caseId,
      phase: "start-input",
      request,
      resource,
      surface: "extension-content",
      provider: "extension-content-host",
    })));
    const tracedHandler = async (event) => {
      trace.edge(flowEdge("source.manual-paste-event", "resource.paste-listener.active", flowAttrs({
        caseId,
        phase: "manual-paste",
        request,
        resource,
        surface: "browser-event-loop",
        provider: "browser-event-loop",
      })));
      trace.edge(flowEdge("resource.paste-listener.active", "callback.paste-event", flowAttrs({
        caseId,
        phase: "manual-paste",
        request,
        resource,
        surface: "extension-content",
        provider: "reference-image-input-port",
      })));
      await handler(event);
      trace.edge(flowEdge("callback.paste-event", "sink.paste-event.default-prevented", flowAttrs({
        caseId,
        phase: "manual-paste",
        request,
        surface: "extension-content",
        terminal: "browser-event-consumed",
      })));
    };
    pasteListeners.set(handler, tracedHandler);
    nativeAddEventListener(type, tracedHandler, options);
  };

  ownerWindow.removeEventListener = (type, handler, options) => {
    if (type !== "paste" || !pasteListeners.has(handler)) {
      nativeRemoveEventListener(type, handler, options);
      return;
    }
    const tracedHandler = pasteListeners.get(handler);
    pasteListeners.delete(handler);
    nativeRemoveEventListener(type, tracedHandler, options);
    trace.edge(flowEdge("resource.paste-listener.active", "sink.paste-listener.disposed", flowAttrs({
      caseId,
      phase: "manual-paste",
      request,
      resource,
      surface: "extension-content",
      terminal: "host-resource-disposed",
    })));
  };

  ownerWindow.listenerCount = (type) => (
    type === "paste" ? pasteListeners.size : 0
  );
  ownerWindow.dispatchPaste = async ({ dataUrl }) => {
    if (pasteListeners.size === 0) {
      trace.edge(flowEdge("source.manual-paste-event", "inert.no-active-paste-listener", flowAttrs({
        caseId,
        phase: "manual-paste",
        request,
        surface: "browser-event-loop",
        terminal: "intentionally-inert",
      })));
      return null;
    }
    const event = new ownerWindow.Event("paste", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "clipboardData", {
      value: {
        items: [{
          kind: "file",
          type: "image/png",
          getAsFile() {
            return {
              dataUrl,
              type: "image/png",
            };
          },
        }],
      },
    });
    ownerWindow.dispatchEvent(event);
    await flushMicrotasks();
    return event;
  };

  return ownerWindow;
}

function installImageDecodeStubs({ ownerWindow, referenceImage }) {
  ownerWindow.FileReader = class TestFileReader extends ownerWindow.EventTarget {
    result = null;
    error = null;

    readAsDataURL(blob) {
      this.result = blob.dataUrl;
      queueMicrotask(() => {
        this.dispatchEvent(new ownerWindow.Event("load"));
      });
    }
  };
  ownerWindow.Image = class TestImage extends ownerWindow.EventTarget {
    naturalWidth = 0;
    naturalHeight = 0;

    set src(_value) {
      this.naturalWidth = referenceImage.intrinsicSizePx.width;
      this.naturalHeight = referenceImage.intrinsicSizePx.height;
      queueMicrotask(() => {
        this.dispatchEvent(new ownerWindow.Event("load"));
      });
    }
  };
}

function createChromeApiHarness({
  trace,
  caseId,
  request,
}) {
  const values = {};
  const api = {
    latestSet: null,
    storage: {
      local: {
        async get(key) {
          return {
            [key]: values[key],
          };
        },
        async set(record) {
          Object.assign(values, record);
          api.latestSet = record;
          trace.edge(flowEdge("callback.paste-event", "sink.durable-state.write", flowAttrs({
            caseId,
            phase: "accepted-outcome",
            request,
            surface: "extension-content",
            terminal: "durable-write",
          })));
        },
      },
    },
  };
  return api;
}

function flowAttrs({
  caseId,
  phase,
  request,
  resource,
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
  if (request !== undefined) {
    attributes.request = request;
  }
  if (resource !== undefined) {
    attributes.resource = resource;
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

async function waitFor(readValue) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const value = readValue();
    if (value) {
      return value;
    }
    await flushMicrotasks();
  }
  assert.fail("Timed out waiting for reference-image input outcome.");
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
