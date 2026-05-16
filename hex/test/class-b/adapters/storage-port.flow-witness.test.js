import test from "node:test";
import assert from "node:assert/strict";

import {
  createStoragePortAdapter,
} from "../../../adapters/extension/storage-port.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: browser storage is an outbound adapter, not
// the durable-state authority. It stores exactly the durable projection the
// application hands it and does not select, reshape, or supplement that data.
test("storage port stores exactly durable state", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "storage port stores exactly durable state",
  });
  const writes = [];
  const storage = createStoragePortAdapter({
    storageArea: {
      async set(record) {
        writes.push(record);
      },
    },
    storageKey: "id-overlay/state",
  });
  const durableState = {
    session: {
      mode: "align",
    },
  };

  await writeDurableState({ trace, storage, durableState, phase: "session" });
  await writeDurableState({ trace, storage, durableState: null, phase: "empty" });

  assert.deepEqual(writes, [
    {
      "id-overlay/state": durableState,
    },
    {
      "id-overlay/state": null,
    },
  ]);
  assert.deepEqual(trace.edges, [
    ...durableWriteEdges("session"),
    ...durableWriteEdges("empty"),
  ]);
});

// Class-b, deliberately not class-a: absent extension-storage records are
// platform noise. The adapter normalizes that noise to the application's single
// no-durable-state value before hydration sees it.
test("storage port normalizes missing state to null", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "storage port normalizes missing state to null",
  });
  const records = [undefined, null, {}, { "id-overlay/state": undefined }];
  for (const [index, record] of records.entries()) {
    const phase = `variant-${index}`;
    const storage = createStoragePortAdapter({
      storageArea: {
        async get() {
          return record;
        },
      },
      storageKey: "id-overlay/state",
    });

    assert.equal(await readDurableState({ trace, storage, phase }), null);
  }
  assert.deepEqual(trace.edges, records.flatMap((_, index) => (
    durableReadEdges(`variant-${index}`)
  )));
});

// Class-b: extension storage is a browser boundary. The adapter must support
// callback-style Chrome storage as well as promise-style browser storage so
// durable state is not tied to one extension API dialect.
test("storage port supports callback-style Chrome storage", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "storage port supports callback-style Chrome storage",
  });
  const durableState = {
    session: {
      mode: "trace",
    },
  };
  const records = {};
  const storage = createStoragePortAdapter({
    storageArea: {
      get(key, callback) {
        callback({
          [key]: records[key] ?? null,
        });
      },
      set(record, callback) {
        Object.assign(records, record);
        callback();
      },
    },
    storageKey: "id-overlay/state",
  });

  assert.equal(await readDurableState({ trace, storage, phase: "initial" }), null);
  await writeDurableState({
    trace,
    storage,
    durableState,
    phase: "write",
  });
  assert.deepEqual(await readDurableState({ trace, storage, phase: "after-write" }), durableState);
  assert.deepEqual(records, {
    "id-overlay/state": durableState,
  });
});

async function writeDurableState({
  trace,
  storage,
  durableState,
  phase,
}) {
  return trace.withSource("source.durable-state-write-request", async () => {
    trace.edge(flowEdge("source.durable-state-write-request", "port.durable-state.write", {
      phase,
      provider: "storage-port-adapter",
    }));
    await storage.writeDurableState(durableState);
    trace.edge(flowEdge("port.durable-state.write", "sink.durable-state.write", {
      phase,
      terminal: "durable-write",
    }));
  });
}

async function readDurableState({ trace, storage, phase }) {
  return trace.withSource("source.durable-state-read-request", async () => {
    trace.edge(flowEdge("source.durable-state-read-request", "port.durable-state.read", {
      phase,
      provider: "storage-port-adapter",
    }));
    const durableState = await storage.readDurableState();
    trace.edge(flowEdge("port.durable-state.read", "sink.startup-durable-state", {
      phase,
      terminal: "port-result",
    }));
    return durableState;
  });
}

function durableWriteEdges(phase) {
  return [
    flowEdge("source.durable-state-write-request", "port.durable-state.write", {
      phase,
      provider: "storage-port-adapter",
    }),
    flowEdge("port.durable-state.write", "sink.durable-state.write", {
      phase,
      terminal: "durable-write",
    }),
  ];
}

function durableReadEdges(phase) {
  return [
    flowEdge("source.durable-state-read-request", "port.durable-state.read", {
      phase,
      provider: "storage-port-adapter",
    }),
    flowEdge("port.durable-state.read", "sink.startup-durable-state", {
      phase,
      terminal: "port-result",
    }),
  ];
}
