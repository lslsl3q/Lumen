/**
 * Hash-based title → gradient color mapping
 * Same title always produces the same gradient, creating visual identity.
 */

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

const PALETTES = [
  { h1: 15, h2: 35 },    // warm amber → orange
  { h1: 340, h2: 10 },   // rose → red
  { h1: 200, h2: 230 },  // teal → blue
  { h1: 260, h2: 290 },  // purple → violet
  { h1: 140, h2: 170 },  // emerald → teal
  { h1: 25, h2: 45 },    // burnt orange → gold
  { h1: 320, h2: 350 },  // pink → magenta
  { h1: 180, h2: 210 },  // cyan → sky
];

export function titleToGradient(title: string): string {
  const hash = hashString(title);
  const palette = PALETTES[hash % PALETTES.length];
  const s1 = 45 + (hash % 20);
  const l1 = 25 + (hash % 10);
  const s2 = 50 + (hash % 15);
  const l2 = 30 + (hash % 8);
  return `linear-gradient(135deg, hsl(${palette.h1}, ${s1}%, ${l1}%), hsl(${palette.h2}, ${s2}%, ${l2}%))`;
}
