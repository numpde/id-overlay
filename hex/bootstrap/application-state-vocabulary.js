export const APPLICATION_STATE_KEY = Object.freeze({
  session: "session",
  referenceImage: "referenceImage",
  registration: "registration",
  pins: "pins",
  placement: "placement",
  solvedPlacement: "solvedPlacement",
  mode: "mode",
  history: "history",
});

export const APPLICATION_MODE = Object.freeze({
  align: "align",
  trace: "trace",
});

export const PLACEMENT_COORDINATE_SPACE = Object.freeze({
  mapWorld: "map-world",
  screen: "screen",
});

export const PAGE_SNAPSHOT_KIND = Object.freeze({
  supportedMapPage: "supported-map-page",
});

export const PAGE_SNAPSHOT_PROVENANCE_KIND = Object.freeze({
  retainedDuringSurfaceMotion: "retained-during-surface-motion",
});
