import { useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DialRoot, useDialKit } from 'dialkit';
import 'dialkit/styles.css';
import './logo-motion.css';
import {
  MARK_H,
  MARK_PATH,
  MARK_W,
  UNWIND_DIALS,
  clamp01,
  smooth,
  spring,
  unwindFrame,
  warpPath,
} from './unwind-mark.js';

/* ─────────────────────────────────────────────────────────
 * UNWIND — five opening animations for the logo mark
 *
 * Each plays once and ends on the exact Paper path, then holds still.
 * No tilt, no shine, no colour change: the vector itself is bent by a wave.
 * Every frame rewrites the path's points (it is all absolute M / C / L, so
 * each number pair is one point), so the curves stay crisp at any size.
 *
 *   Rise     a sound wave forms out of a flat line, left → right
 *   Ripple   a wave travels through the mark and dies out
 *   Unwind   the mark starts coiled tight and uncoils to its full width
 *   Columns  vertical slices out of phase, falling into line one by one
 *   Breath   one breath: flat → a little past full → settles
 * ───────────────────────────────────────────────────────── */

const CY = MARK_H / 2;
const easeOut = (v) => 1 - (1 - v) ** 3;

/* Each option: its DialKit folder, and a frame(p, c) → { d, opacity } or columns. */
const OPTIONS = [
  {
    key: 'rise',
    name: 'Rise',
    line: 'A sound wave forms out of a flat line, left to right.',
    dials: { durationMs: [1400, 300, 4000, 10], front: [0.5, 0.05, 1.5, 0.01], bounce: [0.6, 0, 2, 0.05] },
    frame: (p, c) => ({
      d: warpPath((x, y) => {
        const local = clamp01((p * (1 + c.front) - x / MARK_W) / c.front);
        return [x, CY + (y - CY) * spring(local, c.bounce)];
      }),
    }),
  },
  {
    key: 'ripple',
    name: 'Ripple',
    line: 'A wave travels through the mark and dies out.',
    dials: {
      durationMs: [1800, 300, 5000, 10],
      amplitude: [0.35, 0, 1, 0.01],
      wavelength: [0.7, 0.15, 2, 0.01],
      cycles: [1.5, 0.25, 5, 0.05],
    },
    frame: (p, c) => {
      const decay = (1 - p) ** 2;
      return {
        opacity: smooth(clamp01(p / 0.15)),
        d: warpPath((x, y) => [
          x,
          y + c.amplitude * MARK_H * decay * Math.sin(2 * Math.PI * (x / MARK_W / c.wavelength - c.cycles * p)),
        ]),
      };
    },
  },
  {
    key: 'unwind',
    name: 'Unwind',
    line: 'Starts coiled tight and uncoils to its full width.',
    /* The chosen opening; defaults and motion shared with welcome.html. */
    dials: UNWIND_DIALS,
    frame: unwindFrame,
  },
  {
    key: 'columns',
    name: 'Columns',
    line: 'Vertical slices start out of phase and fall into line one by one.',
    dials: {
      durationMs: [1300, 300, 4000, 10],
      columns: [9, 3, 24, 1],
      amplitude: [0.45, 0, 1.2, 0.01],
      waves: [1, 0.25, 3, 0.05],
      stagger: [0.6, 0, 0.95, 0.01],
      stepped: true,
    },
    frame: (p, c) => {
      const n = c.columns;
      const offsets = [];
      for (let i = 0; i < n; i++) {
        const start = n > 1 ? (c.stagger * i) / (n - 1) : 0;
        const local = clamp01((p - start) / (1 - c.stagger || 1));
        let off = c.amplitude * MARK_H * Math.sin((2 * Math.PI * c.waves * (i + 0.5)) / n) * (1 - easeOut(local));
        /* Stepped: offsets snap to a coarse grid, like the blocks in a pixel wave. */
        if (c.stepped) off = Math.round(off / (MARK_H / 6)) * (MARK_H / 6);
        offsets.push(off);
      }
      return { opacity: smooth(clamp01(p / 0.1)), columns: offsets };
    },
  },
  {
    key: 'breath',
    name: 'Breath',
    line: 'One breath: flat, a little past full, then settles.',
    dials: { durationMs: [1600, 300, 5000, 10], bounce: [0.9, 0, 2.5, 0.05], pivot: { type: 'select', options: ['center', 'base'], default: 'center' } },
    frame: (p, c) => {
      const amp = spring(p, c.bounce);
      const py = c.pivot === 'base' ? MARK_H : CY;
      return { d: warpPath((x, y) => [x, py + (y - py) * amp]) };
    },
  },
];

const STAGE = {
  size: [72, 32, 140, 1],
  showWord: true,
  delayMs: [400, 0, 3000, 10],
  replayAll: { type: 'action', label: 'Replay all' },
};

const PANEL = Object.fromEntries(
  OPTIONS.map((o) => [o.key, { ...o.dials, replay: { type: 'action', label: `Replay ${o.name}` } }]),
);

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Plays one option once per `run`, then leaves the exact Paper path in place. */
function AnimatedMark({ option, c, run, delayMs, color }) {
  const path = useRef(null);
  const cols = useRef(null);
  const cfg = useRef(c);
  cfg.current = c;
  const [cut, setCut] = useState(null); // column count while the Columns option plays

  useLayoutEffect(() => {
    const el = path.current;
    const done = () => {
      el.setAttribute('d', MARK_PATH);
      el.style.opacity = '';
      setCut(null);
    };
    if (reducedMotion()) return done();
    const isCols = option.key === 'columns';
    setCut(isCols ? cfg.current.columns : null);
    const t0 = performance.now() + delayMs;
    let raf;
    const tick = (now) => {
      const p = (now - t0) / cfg.current.durationMs;
      if (p >= 1) return done();
      raf = requestAnimationFrame(tick);
      const f = option.frame(clamp01(p), cfg.current);
      const opacity = p < 0 ? 0 : (f.opacity ?? 1);
      if (f.d) {
        el.setAttribute('d', f.d);
        el.style.opacity = String(opacity);
      }
      if (f.columns && cols.current) {
        cols.current.style.opacity = String(opacity);
        cols.current.querySelectorAll('[data-col]').forEach((g, i) => {
          g.setAttribute('transform', `translate(0 ${f.columns[i] ?? 0})`);
        });
      }
    };
    /* First frame now, before paint, so the full logo never flashes. */
    tick(performance.now());
    return () => cancelAnimationFrame(raf);
  }, [run, delayMs, option]);

  const colW = cut ? MARK_W / cut : 0;
  return (
    <svg className="lm-mark" viewBox={`0 0 ${MARK_W} ${MARK_H}`} aria-hidden="true">
      <path ref={path} d={MARK_PATH} fill={color} style={{ display: cut ? 'none' : undefined }} />
      {cut && (
        <g ref={cols} style={{ opacity: 0 }}>
          <defs>
            {Array.from({ length: cut }, (_, i) => (
              <clipPath key={i} id={`lm-col-${run}-${i}`}>
                {/* A hair of overlap so no seam shows between neighbours. */}
                <rect x={i * colW - 0.03} y={-MARK_H} width={colW + 0.06} height={MARK_H * 3} />
              </clipPath>
            ))}
          </defs>
          {Array.from({ length: cut }, (_, i) => (
            <g key={i} data-col clipPath={`url(#lm-col-${run}-${i})`}>
              <path d={MARK_PATH} fill={color} />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

function Lockup({ children, showWord }) {
  return (
    <div className="lm-lockup" aria-label="Unwind">
      {children}
      {showWord && (
        <span className="lm-word" aria-hidden="true">
          un<em>wind</em>
        </span>
      )}
    </div>
  );
}

function LogoMotion() {
  const [runs, setRuns] = useState(() => Object.fromEntries(OPTIONS.map((o) => [o.key, 0])));
  const replay = (keys) => setRuns((r) => ({ ...r, ...Object.fromEntries(keys.map((k) => [k, r[k] + 1])) }));
  const s = useDialKit('Stage', STAGE, { id: 'lm-stage', onAction: () => replay(OPTIONS.map((o) => o.key)) });
  const c = useDialKit('Openings', PANEL, { id: 'lm-openings', onAction: (path) => replay([path.split('.')[0]]) });

  return (
    <main className="lm-page" style={{ '--word-size': `${s.size}px` }}>
      <header className="lm-head">
        <h1>Unwind — logo opening</h1>
        <p>Five one-shot openings. Each ends on the exact logo and stays still. Tap a card to replay it.</p>
      </header>
      <div className="lm-grid">
        {OPTIONS.map((o, i) => (
          <button key={o.key} type="button" className="lm-card" onClick={() => replay([o.key])}>
            <span className="lm-stage">
              <Lockup showWord={s.showWord}>
                <AnimatedMark option={o} c={c[o.key]} run={runs[o.key]} delayMs={s.delayMs} color="#80DCF7" />
              </Lockup>
            </span>
            <span className="lm-meta">
              <span className="lm-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="lm-name">{o.name}</span>
              <span className="lm-line">{o.line}</span>
            </span>
          </button>
        ))}
      </div>
      <DialRoot position="top-right" productionEnabled theme="light" />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<LogoMotion />);
