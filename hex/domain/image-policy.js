export function constrainImageSize({
  width,
  height,
  maxLongestSide,
}) {
  const longestSide = Math.max(width, height);
  if (longestSide <= maxLongestSide) {
    return { width, height };
  }
  const scale = maxLongestSide / longestSide;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}
