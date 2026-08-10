export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (lo = 0, hi = 1) => lo + Math.random() * (hi - lo);
export const chance = (p) => Math.random() < p;
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function circleRectOverlap(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

export function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

/** A hex colour (#rgb or #rrggbb) as rgba() at the given alpha. Non-hex input
 *  (already an rgba() string, a named colour) is returned unchanged rather than
 *  mangled, so callers can pass whatever colour they were themselves given. */
export function colorAlpha(color, alpha) {
  if (typeof color !== "string" || color[0] !== "#") return color;
  let hex = color.slice(1);
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
  if (hex.length !== 6) return color;
  const n = parseInt(hex, 16);
  if (Number.isNaN(n)) return color;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
