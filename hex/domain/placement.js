export function applyPlacementToPoint(point, placement) {
  const cos = Math.cos(placement.rotationRad);
  const sin = Math.sin(placement.rotationRad);
  const scaledX = point.x * placement.scale;
  const scaledY = point.y * placement.scale;
  return {
    x: placement.x + scaledX * cos - scaledY * sin,
    y: placement.y + scaledX * sin + scaledY * cos,
  };
}

export function applyAnchoredPlacementEdit({ base, edit }) {
  if (edit.kind === "move") {
    return composePlacementEdits({ base, edits: [edit] });
  }

  const anchorBefore = applyPlacementToPoint(edit.anchorImagePx, base);
  const next = {
    ...base,
    ...(edit.kind === "scale" ? { scale: base.scale * edit.factor } : {}),
    ...(edit.kind === "rotate" ? { rotationRad: base.rotationRad + edit.deltaRad } : {}),
  };
  const anchoredAtOrigin = applyPlacementToPoint(edit.anchorImagePx, {
    ...next,
    x: 0,
    y: 0,
  });

  return {
    ...next,
    x: anchorBefore.x - anchoredAtOrigin.x,
    y: anchorBefore.y - anchoredAtOrigin.y,
  };
}

export function invertPlacement(placement) {
  const inverseScale = 1 / placement.scale;
  const inverseRotation = -placement.rotationRad;
  const cos = Math.cos(inverseRotation);
  const sin = Math.sin(inverseRotation);
  return {
    x: (-placement.x * cos + placement.y * sin) * inverseScale,
    y: (-placement.x * sin - placement.y * cos) * inverseScale,
    scale: inverseScale,
    rotationRad: inverseRotation,
  };
}

export function composePlacementEdits({ base, edits }) {
  let placement = { ...base };
  for (const edit of edits) {
    if (edit.kind === "move") {
      placement = {
        ...placement,
        x: placement.x + edit.deltaPx.x,
        y: placement.y + edit.deltaPx.y,
      };
    } else if (edit.kind === "rotate") {
      placement = {
        ...placement,
        rotationRad: placement.rotationRad + edit.deltaRad,
      };
    } else if (edit.kind === "scale") {
      placement = {
        ...placement,
        scale: placement.scale * edit.factor,
      };
    }
  }
  return placement;
}
