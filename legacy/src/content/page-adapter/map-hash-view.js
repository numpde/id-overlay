export function deriveHashMapView(hash) {
  const match = /map=([0-9]+(?:\.[0-9]+)?)\/(-?[0-9]+(?:\.[0-9]+)?)\/(-?[0-9]+(?:\.[0-9]+)?)/.exec(hash);
  if (!match) {
    return null;
  }

  const zoom = Number(match[1]);
  const lat = Number(match[2]);
  const lon = Number(match[3]);

  if (!Number.isFinite(zoom) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return {
    center: { lat, lon },
    zoom,
  };
}
