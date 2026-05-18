export function createHotPathWatchdog({
  eventDebugLogger = null,
  consoleObject = null,
} = {}) {
  const activeInteractions = new Map();

  return {
    begin({
      interaction,
      phase = "preview",
      source = null,
    }) {
      const record = activeInteractions.get(interaction);
      if (record) {
        record.phase = phase;
        record.source = source ?? record.source;
        return;
      }
      activeInteractions.set(interaction, {
        phase,
        source,
        warnedSinks: new Set(),
      });
    },
    commit({
      interaction,
    }) {
      const record = activeInteractions.get(interaction);
      if (!record) {
        return;
      }
      record.phase = "commit";
    },
    end({
      interaction,
    }) {
      activeInteractions.delete(interaction);
    },
    noteSink({
      sink,
      detail = {},
    }) {
      for (const [interaction, record] of activeInteractions) {
        if (record.phase === "commit" || record.warnedSinks.has(sink)) {
          continue;
        }
        record.warnedSinks.add(sink);
        eventDebugLogger?.log?.("hot-path", "unexpected-sink", {
          interaction,
          phase: record.phase,
          source: record.source ?? undefined,
          sink,
          ...detail,
        });
        warnUnexpectedSink({
          consoleObject,
          interaction,
          phase: record.phase,
          source: record.source,
          sink,
          detail,
        });
      }
    },
  };
}

function warnUnexpectedSink({
  consoleObject,
  interaction,
  phase,
  source,
  sink,
  detail,
}) {
  if (!consoleObject?.warn) {
    return;
  }
  try {
    consoleObject.warn("id-overlay: shell sink during preview interaction", {
      interaction,
      phase,
      source,
      sink,
      ...detail,
    });
  } catch {
    consoleObject.warn("id-overlay: shell sink during preview interaction");
  }
}
