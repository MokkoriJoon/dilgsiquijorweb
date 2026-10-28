// =====================================================================
// Category colour helpers.
//
// Categories are stored with a hex colour code (e.g. "#2563eb"). A raw
// hex code is meaningless to regular users, so everywhere the UI shows
// a colour it renders an actual COLOUR SWATCH + a friendly colour NAME
// instead of the "#" number.
// =====================================================================

export interface NamedColor {
  hex: string;
  name: string; // human-friendly colour name shown in the UI
}

/** The palette used for categories — each entry has a readable name. */
export const NAMED_CATEGORY_COLORS: NamedColor[] = [
  { hex: '#2563eb', name: 'Blue' },
  { hex: '#dc2626', name: 'Red' },
  { hex: '#0891b2', name: 'Cyan' },
  { hex: '#7c3aed', name: 'Purple' },
  { hex: '#ea580c', name: 'Orange' },
  { hex: '#0d9488', name: 'Teal' },
  { hex: '#4f46e5', name: 'Indigo' },
  { hex: '#ca8a04', name: 'Gold' },
  { hex: '#64748b', name: 'Slate Gray' },
  { hex: '#db2777', name: 'Pink' },
  { hex: '#16a34a', name: 'Green' },
  { hex: '#0f172a', name: 'Navy' },
];

/** Nearest named colour for any hex value (defaults to Slate Gray). */
export function colorNameFor(hex?: string | null): string {
  if (!hex) return 'Slate Gray';
  const exact = NAMED_CATEGORY_COLORS.find(
    (c) => c.hex.toLowerCase() === hex.trim().toLowerCase(),
  );
  if (exact) return exact.name;
  const rgb = hexToRgb(hex);
  if (!rgb) return 'Custom';
  let best = NAMED_CATEGORY_COLORS[0];
  let bestDist = Infinity;
  for (const c of NAMED_CATEGORY_COLORS) {
    const cr = hexToRgb(c.hex)!;
    const dist =
      (rgb.r - cr.r) ** 2 + (rgb.g - cr.g) ** 2 + (rgb.b - cr.b) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best.name;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** True when the hex is dark enough that white text sits on top of it. */
export function isDarkColor(hex?: string | null): boolean {
  const rgb = hex ? hexToRgb(hex) : null;
  if (!rgb) return true;
  const lum = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  return lum < 150;
}
