const SVG_NS = "http://www.w3.org/2000/svg";

export function createGithubIcon(document, { className } = {}) {
  const svg = createIconSvg(document, {
    viewBox: "0 0 16 16",
  });
  if (className) {
    svg.classList.add(className);
  }

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute(
    "d",
    "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .22.15.47.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z",
  );
  path.setAttribute("fill", "currentColor");
  svg.append(path);

  return svg;
}

export function createPanelActionIcon(document, icon) {
  if (icon === "center-overlay") {
    return createStrokeIcon(document, [
      "M4 9V4h5",
      "M20 9V4h-5",
      "M4 15v5h5",
      "M20 15v5h-5",
      "M8 12h8",
      "M12 8v8",
    ]);
  }
  if (icon === "center-map") {
    const svg = createStrokeIcon(document, [
      "M12 3v4",
      "M12 17v4",
      "M3 12h4",
      "M17 12h4",
      "M8.5 8.5l7 7",
      "M15.5 8.5l-7 7",
    ]);
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "2");
    circle.setAttribute("fill", "currentColor");
    svg.append(circle);
    return svg;
  }
  return null;
}

function createIconSvg(document, {
  viewBox = "0 0 24 24",
  width = null,
  height = null,
} = {}) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  if (width !== null) {
    svg.setAttribute("width", String(width));
  }
  if (height !== null) {
    svg.setAttribute("height", String(height));
  }
  return svg;
}

function createStrokeIcon(document, paths) {
  const svg = createIconSvg(document, {
    width: 16,
    height: 16,
  });
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
  }
  return svg;
}
