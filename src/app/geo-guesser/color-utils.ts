function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!match) return null;
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

/**
 * Returns a CSS color guaranteed to read clearly against the map's dark
 * background. Dark flag colors (navy, black) are nearly invisible as line/dot
 * accents once rendered on the dark ocean, so they're mixed with white in
 * proportion to how dark they are — the darker the color, the more it's
 * brightened. Colors that are already light pass through unchanged.
 */
export function ensureVisibleAccent(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  const whiteMix = Math.round(Math.min(75, Math.max(0, 80 - luminance * 140)));
  if (whiteMix <= 0) return hex;

  return `color-mix(in srgb, ${hex} ${100 - whiteMix}%, white ${whiteMix}%)`;
}
