/* The one accent blue across every prototype: highlights, progress, focus rings
   and the VoiceBeam glow. */
export const BRAND_BLUE = '#61A8FD';

const hex = (h) => h.replace('#', '').match(/../g).map((c) => parseInt(c, 16));
const rgb = (c) => `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(', ')})`;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/* VoiceBeam `colors` (centre lobe first, then pairs outward) and `bandColors`,
   all shades of one blue. The beam runs its layers through brightness(n), which
   would clip the blue channel and push the glow to cyan, so the inputs are
   divided by that brightness to land on the brand blue after the filter. */
export function beamColors(color = BRAND_BLUE, brightness = 1) {
  const c = hex(color).map((v) => v / Math.max(1, brightness));
  const deep = mix(c, [0, 0, 0], 0.25);
  const soft = mix(c, [255, 255, 255].map((v) => v / Math.max(1, brightness)), 0.25);
  return {
    colors: [c, deep, soft, c, deep, soft, c].map(rgb),
    bandColors: { core: rgb(c), above: rgb(soft), mid: rgb(deep), below: rgb(c) },
  };
}
