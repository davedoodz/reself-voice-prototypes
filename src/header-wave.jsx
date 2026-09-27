import { useId, useLayoutEffect, useRef } from 'react';
import { useDialKit } from 'dialkit';
import waveLogo from './icons/wave.png';
import momoFloating from '../momo-animations/momo-floating.webm';
import momoListening from '../momo-animations/momo-listening.webm';
import { WAVE_H, WAVE_PATH, WAVE_W } from './wave-path.js';

/* The blue wave mark at the top of each app screen, drawn left to right along
   its curves with the welcome screen's brush opening, optionally on a loop:
   draw → hold → fade → draw again. One shared panel ('Header logo'). */
const HEADER_WAVE = {
  show: true,
  /* Which mark: the blue wave, or Momo the cloud (floats; listens while recording). */
  mark: { type: 'select', options: [{ value: 'wave', label: 'Blue wave' }, { value: 'momo', label: 'Momo' }], default: 'momo' },
  momo: {
    size: [96, 30, 240, 1],
    /* Floating ↔ listening crossfade. */
    blendMs: [500, 0, 2000, 10],
  },
  width: [46, 16, 140, 1],
  x: [0, -180, 180, 1],
  /* From the top of the screen, to the mark's centre. */
  y: [70, 0, 400, 1],
  animate: true,
  loop: true,
  drawMs: [1640, 200, 6000, 10],
  holdMs: [950, 0, 10000, 50],
  fadeMs: [1010, 0, 3000, 10],
  softness: [20.5, 0, 30, 0.5],
  strokePad: [1.2, 1, 3, 0.05],
};

const easeOut = (t) => 1 - (1 - t) ** 3;

/* `defaults` overrides starting values for one page; its own `id` keeps them apart. */
export function HeaderWave({ defaults, id: panelId = 'header-logo', listening = false }) {
  const config = defaults ? { ...HEADER_WAVE, ...defaults } : HEADER_WAVE;
  const h = useDialKit('Header logo', config, { id: panelId, defaultCollapsed: true });
  const root = useRef(null);
  const stroke = useRef(null);
  const cfg = useRef(h);
  cfg.current = h;
  const id = useId().replace(/[^a-z0-9]/gi, '');

  useLayoutEffect(() => {
    const el = root.current;
    const path = stroke.current;
    if (!el || !path) return;
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len} ${len}`;
    const still = () => {
      path.style.strokeDashoffset = '0';
      el.style.opacity = '1';
    };
    if (!h.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return still();
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const c = cfg.current;
      const cycle = c.drawMs + c.holdMs + c.fadeMs;
      const elapsed = now - t0;
      if (!c.loop && elapsed >= c.drawMs) return still();
      raf = requestAnimationFrame(tick);
      const t = elapsed % cycle;
      const draw = easeOut(Math.min(1, t / c.drawMs));
      const fade = t > c.drawMs + c.holdMs ? 1 - (t - c.drawMs - c.holdMs) / Math.max(1, c.fadeMs) : 1;
      path.style.strokeDashoffset = String(len * (1 - draw));
      el.style.opacity = String(Math.max(0, fade));
    };
    tick(performance.now());
    return () => cancelAnimationFrame(raf);
  }, [h.show, h.animate, h.loop, h.mark]);

  if (!h.show) return null;
  if (h.mark === 'momo') {
    return (
      <div
        className="header-momo"
        data-listening={listening || undefined}
        style={{ width: h.momo.size, '--hw-x': `${h.x}px`, '--hw-y': `${h.y}px`, '--momo-blend': `${h.momo.blendMs}ms` }}
        aria-hidden="true"
      >
        <video className="momo-floating" src={momoFloating} autoPlay loop muted playsInline />
        <video className="momo-listening" src={momoListening} autoPlay loop muted playsInline />
      </div>
    );
  }
  return (
    <svg
      ref={root}
      className="header-wave"
      viewBox={`0 0 ${WAVE_W} ${WAVE_H}`}
      style={{ width: h.width, '--hw-x': `${h.x}px`, '--hw-y': `${h.y}px` }}
      aria-hidden="true"
    >
      <defs>
        <filter id={`f${id}`} filterUnits="userSpaceOnUse" x="-80" y="-80" width={WAVE_W + 160} height={WAVE_H + 160}>
          <feGaussianBlur stdDeviation={h.softness} />
        </filter>
        <mask id={`m${id}`} maskUnits="userSpaceOnUse" x="-80" y="-80" width={WAVE_W + 160} height={WAVE_H + 160}>
          <path
            ref={stroke}
            d={WAVE_PATH}
            fill="none"
            stroke="#fff"
            strokeWidth={42 * h.strokePad + 3 * h.softness}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={h.softness ? `url(#f${id})` : undefined}
          />
        </mask>
      </defs>
      <image href={waveLogo} width={WAVE_W} height={WAVE_H} mask={`url(#m${id})`} />
    </svg>
  );
}
