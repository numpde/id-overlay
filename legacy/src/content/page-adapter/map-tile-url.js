export function parseTileCoordinates(tileUrl) {
  // TODO(smell): Supported tile URL formats are empirical adapter knowledge.
  // Add formats only here with tests; do not let URL parsing leak to map-view
  // resolution or projection code.
  if (typeof tileUrl !== "string" || !tileUrl) {
    return null;
  }

  const bingMatch = /\/tiles\/[a-z](\d+)\./i.exec(tileUrl);
  if (bingMatch) {
    return quadkeyToTileCoordinates(bingMatch[1]);
  }

  const xyzPathMatch = /\/(\d+)\/(\d+)\/(\d+)(?:\.[a-z0-9]+)(?:[?#]|$)/i.exec(tileUrl);
  if (xyzPathMatch) {
    return {
      zoom: Number(xyzPathMatch[1]),
      x: Number(xyzPathMatch[2]),
      y: Number(xyzPathMatch[3]),
    };
  }

  const xyzQueryMatch = /[?&](?:z|zoom)=(\d+).*?[?&](?:x|tilex)=(\d+).*?[?&](?:y|tiley)=(\d+)/i.exec(tileUrl);
  if (xyzQueryMatch) {
    return {
      zoom: Number(xyzQueryMatch[1]),
      x: Number(xyzQueryMatch[2]),
      y: Number(xyzQueryMatch[3]),
    };
  }

  return null;
}

function quadkeyToTileCoordinates(quadkey) {
  let x = 0;
  let y = 0;
  const zoom = quadkey.length;

  for (let index = 0; index < zoom; index += 1) {
    const bit = zoom - index - 1;
    const mask = 1 << bit;
    const digit = Number(quadkey[index]);
    if (digit & 1) {
      x |= mask;
    }
    if (digit & 2) {
      y |= mask;
    }
  }

  return { zoom, x, y };
}
