import test from "node:test";
import assert from "node:assert/strict";

import { createContentPersistenceService } from "../../src/content/persistence-service.js";
import { PLACEMENT } from "../helpers/session-fixtures.js";

const PERSISTED_SESSION = Object.freeze({
  mode: "trace",
  image: null,
  placement: PLACEMENT,
});

test("content persistence service adapts storage to machine persistence ports", async () => {
  const storage = createStorageHarness({ loadedSession: PERSISTED_SESSION });
  const service = createContentPersistenceService({ storage });

  assert.equal(await service.loadPersistedSession(), PERSISTED_SESSION);
  await service.savePersistedSession(null);

  assert.deepEqual(storage.saves, [null]);
});

function createStorageHarness({ loadedSession = null } = {}) {
  const saves = [];
  return {
    saves,
    async load() {
      return loadedSession;
    },
    async save(session) {
      saves.push(session);
    },
  };
}
