/* The Unwind logo mark, from Paper (53×53 box, path offset 3.134, 13.107),
   cropped to the path itself. Absolute M / C / L commands only, so every
   number pair is an (x, y) point. */
export const MARK_W = 46.6;
export const MARK_H = 26.8;
export const MARK_PATH =
  'M12.186 0.000C17.000 0.136 15.965 4.535 16.062 7.864C16.091 8.837 16.003 10.259 16.292 11.181C16.561 12.047 17.168 12.768 17.976 13.179C19.273 13.852 20.922 13.768 22.032 12.791C22.766 12.146 23.391 10.910 23.888 10.048L26.954 4.714C27.477 3.803 28.605 1.703 29.220 1.056C29.619 0.644 30.116 0.340 30.664 0.173C31.653 -0.136 32.743 0.013 33.646 0.484C35.502 1.503 35.389 3.069 35.484 4.794C35.578 6.519 35.220 9.642 35.691 11.187C35.947 12.046 36.544 12.761 37.343 13.168C37.916 13.466 38.591 13.618 39.237 13.620C42.883 13.628 43.449 7.939 45.201 7.453C45.454 7.383 45.733 7.465 45.954 7.594C46.216 7.748 46.462 8.010 46.527 8.316C46.590 8.614 46.451 8.882 46.323 9.144C45.976 9.860 45.534 10.543 45.137 11.233L42.965 15.014C41.090 18.271 39.191 21.523 37.329 24.788C36.670 25.944 35.848 26.365 34.618 26.668C33.874 26.743 32.810 26.551 32.164 26.138C30.228 24.899 30.477 23.172 30.435 21.315C30.406 20.033 30.573 16.744 30.282 15.643C30.044 14.753 29.457 13.998 28.654 13.548C27.219 12.749 25.193 12.932 24.173 14.216C23.206 15.433 22.353 17.122 21.570 18.480L19.013 22.910C18.175 24.376 17.460 26.089 15.698 26.574C14.728 26.842 13.722 26.631 12.841 26.161C12.279 25.861 11.655 25.181 11.379 24.585C10.592 22.481 11.426 17.535 10.867 15.567C10.630 14.712 10.060 13.988 9.284 13.557C8.709 13.238 8.031 13.084 7.375 13.070C3.623 12.991 2.901 18.887 1.413 19.197C1.087 19.265 0.650 19.176 0.380 18.981C0.183 18.839 0.046 18.627 0.010 18.385C-0.046 18.008 0.139 17.643 0.303 17.316C0.896 16.133 1.629 14.991 2.293 13.846L5.901 7.610L8.287 3.469C9.399 1.540 9.708 0.365 12.186 0.000Z';

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const smooth = (v) => v * v * (3 - 2 * v);

/* 0 → 1 with `bounce` oscillations around 1 as it settles; ~0.25% off at p = 1. */
export const spring = (p, bounce) => 1 - Math.exp(-6 * p) * Math.cos(2 * Math.PI * bounce * p);

/* Parse once: numbers become points, everything else is kept verbatim. */
const TOKENS = MARK_PATH.match(/[A-Za-z]|-?\d*\.?\d+/g);
const POINTS = [];
for (let i = 0; i < TOKENS.length; i++) {
  if (/[A-Za-z]/.test(TOKENS[i])) continue;
  POINTS.push([i, +TOKENS[i], +TOKENS[i + 1]]);
  i++;
}

/* The mark with every point moved by fn(x, y) → [x, y]. */
export function warpPath(fn) {
  const out = TOKENS.slice();
  for (const [i, x, y] of POINTS) {
    const [nx, ny] = fn(x, y);
    out[i] = nx.toFixed(3);
    out[i + 1] = ny.toFixed(3);
  }
  return out.join(' ');
}

/* The chosen opening, "Unwind": the mark starts coiled to a sliver and
   uncoils to its full width, then holds. Defaults are David's pick from
   logo-motion.html. */
export const UNWIND_DIALS = {
  durationMs: [1860, 300, 5000, 10],
  startWidth: [0.05, 0.02, 0.9, 0.01],
  bounce: [0.2, 0, 2, 0.05],
  anchor: { type: 'select', options: ['left', 'center'], default: 'center' },
};

/* p in 0–1 → { d, opacity }. At p = 1 the caller swaps in MARK_PATH exactly. */
export function unwindFrame(p, c) {
  const sx = c.startWidth + (1 - c.startWidth) * spring(p, c.bounce);
  const ax = c.anchor === 'center' ? MARK_W / 2 : 0;
  return { opacity: smooth(clamp01(p / 0.12)), d: warpPath((x, y) => [ax + (x - ax) * sx, y]) };
}
