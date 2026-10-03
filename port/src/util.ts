// General helpers, ported from js/util.js.

export const SZ = 1.2; // character scale (hitboxes, hurtboxes, offsets)
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const approach = (v: number, t: number, d: number): number => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const randi = (a: number, b: number): number => Math.floor(rand(a, b + 1));
export const chance = (p: number): boolean => Math.random() < p;
export const sgn = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);
export const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

export function circleRect(cx: number, cy: number, r: number, rx: number, ry: number, rw: number, rh: number): boolean {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

export function rectRect(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Deterministic generator used by the stage bakes.
export function seeded(seed: number): () => number {
  let s = seed;
  return (): number => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const HEX = "0123456789abcdef";
const hexPair = (value: number): string => HEX[Math.floor(value / 16)] + HEX[value % 16];

// Lightens (amt > 0) or darkens a #rrggbb color by amt per channel.
export function shade(hex: string, amt: number): string {
  const lower = hex.toLowerCase();
  const r = clamp(HEX.indexOf(lower[1]) * 16 + HEX.indexOf(lower[2]) + amt, 0, 255);
  const g = clamp(HEX.indexOf(lower[3]) * 16 + HEX.indexOf(lower[4]) + amt, 0, 255);
  const b = clamp(HEX.indexOf(lower[5]) * 16 + HEX.indexOf(lower[6]) + amt, 0, 255);
  return `#${hexPair(Math.round(r))}${hexPair(Math.round(g))}${hexPair(Math.round(b))}`;
}
