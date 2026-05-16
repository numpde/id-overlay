import test from "node:test";
import assert from "node:assert/strict";

import {
  createActiveMapContextAdapter,
} from "../../../adapters/page-osm-id/active-map-context-adapter.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: supported hosts/editors may grow. The
// stable boundary is that URL/editor detection is page-adapter work that emits
// plain support facts; neither application state nor bootstrap parses page
// details.
test("page context adapter accepts OpenStreetMap edit routes as app hosts", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "page context adapter accepts OpenStreetMap edit routes as app hosts",
  });

  for (const location of [
    {
      origin: "https://www.openstreetmap.org",
      pathname: "/edit",
      search: "",
    },
    {
      origin: "https://www.openstreetmap.org",
      pathname: "/edit",
      search: "?editor=id",
    },
    {
      origin: "https://www.openstreetmap.org",
      pathname: "/edit/history",
      search: "",
    },
  ]) {
    assert.deepEqual(createActiveMapContextAdapter({
      readLocation: () => location,
      findEmbeddedEditorFrame: () => null,
    }).readActiveMapContext(), {
      kind: "supported-map-editor-page",
      surface: {
        kind: "native-page",
      },
    });
  }

  trace.edge(flowEdge("source.page-location", "sink.page-context", {
    phase: "supported-edit-route",
    terminal: "adapter-result",
  }));
});

// Class-b: this ports the legacy active-map-context boundary. OpenStreetMap's
// outer edit page may host the actual iD editor in #id-embed; consumers must get
// the concrete active map window/document/frame, not a lossy "embedded" flag.
test("page context adapter selects the embedded iD frame as the active map context", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "page context adapter selects the embedded iD frame as the active map context",
  });
  const embeddedFrame = createEmbeddedIdFrame();

  assert.deepEqual(createActiveMapContextAdapter({
    readLocation: () => openStreetMapEditLocation(),
    findEmbeddedEditorFrame: () => embeddedFrame,
  }).readActiveMapContext(), {
    kind: "supported-map-editor-page",
    surface: {
      kind: "embedded-editor-frame",
      mapWindow: embeddedFrame.contentWindow,
      viewportDocument: embeddedFrame.contentDocument,
      frameElement: embeddedFrame,
    },
  });

  trace.edge(flowEdge("source.page-location", "port.embedded-editor-frame", {
    phase: "embedded-id-frame",
    provider: "page-context-adapter",
  }));
  trace.edge(flowEdge("port.embedded-editor-frame", "sink.page-context", {
    phase: "embedded-id-frame",
    terminal: "adapter-result",
  }));
});

// Class-b: frame discovery is opportunistic. If the candidate iframe is absent,
// inaccessible, or not the iD editor, the page context remains the native edit
// page instead of exposing a half-valid embedded context.
test("page context adapter ignores invalid embedded editor frame candidates", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "page context adapter ignores invalid embedded editor frame candidates",
  });

  for (const embeddedFrame of [
    null,
    {
      contentWindow: null,
      contentDocument: {},
    },
    {
      contentWindow: {
        location: {
          origin: "https://www.openstreetmap.org",
          pathname: "/edit",
        },
      },
      contentDocument: {},
    },
    {
      contentWindow: {
        location: {
          origin: "https://example.com",
          pathname: "/id",
        },
      },
      contentDocument: {},
    },
  ]) {
    assert.deepEqual(createActiveMapContextAdapter({
      readLocation: () => openStreetMapEditLocation(),
      findEmbeddedEditorFrame: () => embeddedFrame,
    }).readActiveMapContext(), {
      kind: "supported-map-editor-page",
      surface: {
        kind: "native-page",
      },
    });
  }

  trace.edge(flowEdge("source.page-location", "port.embedded-editor-frame", {
    phase: "invalid-embedded-frame",
    provider: "page-context-adapter",
  }));
  trace.edge(flowEdge("port.embedded-editor-frame", "sink.page-context", {
    phase: "invalid-embedded-frame",
    terminal: "adapter-result",
  }));
});

test("page context adapter rejects non-edit and non-OpenStreetMap pages", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "page context adapter rejects non-edit and non-OpenStreetMap pages",
  });

  for (const location of [
    {
      origin: "https://www.openstreetmap.org",
      pathname: "/",
      search: "?editor=id",
    },
    {
      origin: "https://www.openstreetmap.org",
      pathname: "/id",
      search: "",
    },
    {
      origin: "https://example.com",
      pathname: "/edit",
      search: "?editor=id",
    },
  ]) {
    assert.deepEqual(createActiveMapContextAdapter({
      readLocation: () => location,
    }).readActiveMapContext(), {
      kind: "unsupported-page",
    });
  }

  trace.edge(flowEdge("source.page-location", "sink.page-context", {
    phase: "unsupported-route",
    terminal: "adapter-result",
  }));
});

test("page context adapter treats inaccessible location as unsupported", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "page context adapter treats inaccessible location as unsupported",
  });
  const adapter = createActiveMapContextAdapter({
    readLocation() {
      throw new Error("cross-origin location");
    },
  });

  assert.deepEqual(adapter.readActiveMapContext(), {
    kind: "unsupported-page",
  });
  trace.edge(flowEdge("source.page-location", "sink.page-context", {
    phase: "inaccessible-location",
    terminal: "adapter-result",
  }));
});

function openStreetMapEditLocation() {
  return {
    origin: "https://www.openstreetmap.org",
    pathname: "/edit",
    search: "?editor=id",
  };
}

function createEmbeddedIdFrame() {
  const contentWindow = {
    location: {
      origin: "https://www.openstreetmap.org",
      pathname: "/id",
      hash: "#map=17/-1.21000/36.83000",
    },
  };
  const contentDocument = {};
  return {
    contentWindow,
    contentDocument,
  };
}
