import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { VoiceBeam } from 'voice-glow';
import { DialRoot, useDialKit } from 'dialkit';
import 'dialkit/styles.css';
import './voice.css';
import './welcome.css';
import iphoneFrameUrl from '../iphone_asset/iPhone - Silver.png';
import { BEAM, FRAME, FRAME_K, FRAMED_RADIUS, FRAMED_SCREEN_H, beamProps } from './recorder.jsx';
import { MARK_PATH, MARK_W, MARK_H, UNWIND_DIALS, clamp01, unwindFrame } from './unwind-mark.js';

/* ─────────────────────────────────────────────────────────
 * UNWIND — first-run welcome
 *
 * No mascot: the glow along the bottom edge is the entity. It is the same
 * VoiceBeam the recorder listens with, so tapping Get started hands the user
 * to a screen where that glow is already waiting in the same place.
 *
 * The glow pulses to announce itself, then breathes (level follows an
 * inhale → hold → exhale → rest cycle) while its colours drift sideways with
 * `flow`, like wind.
 *
 *    0ms   screen empty, glow at rest (Breath › low)
 *  +start  the glow pulses `count` times: rise → fall → gap (Beam pulse)
 *  +end    last pulse lands; the train repeats every restMs (or, with
 *          afterIntro 'breathe', breathing begins with its first inhale)
 *  +offset the logo mark uncoils from a sliver to full width (Logo opening)
 *          (negative offset = the mark arrives while the last pulse falls)
 *  +word   the letters of "unwind" are blown in, one by one
 *  +line   tagline settles (Intro › taglineAfterMs after the mark)
 *  +cta    buttons and legal rise in (Intro › ctaAfterMs after the mark)
 *
 *  GET STARTED   the glow takes one deep breath (swell), then the recorder opens
 * ───────────────────────────────────────────────────────── */

/* Paper wordmark: "un" in Test Family Regular, "wind" in Test Family Italic. */
const WORDMARK = [...'unwind'].map((ch, i) => ({ ch, italic: i >= 2 }));

const BRAND = {
  color: '#80DCF7',
  wordSize: [48, 32, 72, 1],
  groupY: [0.4, 0.2, 0.6, 0.005],
  tagline: 'Talk it out. Find clarity.',
  taglineColor: '#6f7f86',
  taglineSize: [20, 14, 28, 0.5],
};

const BREATH = {
  inhaleSec: [4, 1, 10, 0.1],
  holdSec: [1, 0, 6, 0.1],
  exhaleSec: [6, 1, 12, 0.1],
  restSec: [1.5, 0, 6, 0.1],
  low: [0.12, 0, 1, 0.01],
  high: [0.83, 0, 1, 0.01],
  swellSec: [0.65, 0.2, 4, 0.05],
};

/* The glow's heartbeat: `count` pulses open the intro, then (afterIntro 'pulse')
   the same train repeats every restMs for as long as the screen is up.
   VoiceBeam smooths the level (Voice beam › attack / release), so pulses much
   shorter than ~250ms read as one soft swell. */
const PULSE = {
  startMs: [360, 0, 3000, 10],
  count: [5, 1, 6, 1],
  riseMs: [230, 40, 2000, 10],
  fallMs: [240, 40, 3000, 10],
  gapMs: [140, 0, 2000, 10],
  peak: [1, 0, 1, 0.01],
  /* When the logo appears relative to the last intro pulse ending. */
  wordmarkOffsetMs: [-570, -2000, 2000, 10],
  /* After the intro: keep pulsing, or settle into the slow Breath cycle. */
  afterIntro: { type: 'select', options: ['pulse', 'breathe'], default: 'breathe' },
  /* Stillness between repeated trains; the glow rests at Breath › low. */
  restMs: [1190, 0, 10000, 10],
};

/* The recorder's beam, retuned for this screen: a slightly faster release and
   a stronger, wider band. Its own DialKit id keeps the recorder pages untouched. */
const WELCOME_BEAM = {
  ...BEAM,
  response: { ...BEAM.response, release: [0.4, 0, 3, 0.01] },
  band: { ...BEAM.band, bandStrength: [3.16, 0, 4, 0.01], bandWidth: [0.91, 0, 6, 0.01] },
};

const INTRO = {
  /* The letters start this far into the logo's opening (0 = with it, 1 = after). */
  lettersAt: [0.16, 0, 1, 0.01],
  letterStaggerMs: [90, 0, 400, 5],
  letterMs: [960, 100, 3000, 10],
  letterDrift: [-26, -120, 60, 1],
  letterBlur: [10, 0, 30, 0.5],
  /* Both measured from the moment the mark starts drawing. */
  taglineAfterMs: [1190, 0, 5000, 10],
  ctaAfterMs: [2000, 0, 6000, 10],
};

const SCREEN = {
  deviceFrame: true,
  previewScale: [0.7, 0.4, 1.2, 0.01],
  screenHeight: [780, 500, 900, 1],
  screenColor: '#f9f9f9',
  pageColor: '#f5f5f5',
  nextPage: { type: 'select', options: ['voice-dynamic.html', 'voice.html', 'voice-guided.html'], default: 'voice-dynamic.html' },
};

/* 0 → 1 → 0 with no corners, so each phase eases into the next. */
const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);

/* One breath in 0–1, looped: inhale, hold full, exhale, rest empty. */
function breathAt(sec, br) {
  const total = br.inhaleSec + br.holdSec + br.exhaleSec + br.restSec;
  let t = sec % total;
  if (t < br.inhaleSec) return ease(t / br.inhaleSec);
  t -= br.inhaleSec;
  if (t < br.holdSec) return 1;
  t -= br.holdSec;
  if (t < br.exhaleSec) return 1 - ease(t / br.exhaleSec);
  return 0;
}

/* One train's length: `count` × (rise + fall), with gaps between. */
const trainMs = (p) => p.count * (p.riseMs + p.fallMs) + (p.count - 1) * p.gapMs;

/* Where the last intro pulse lands, in ms from the start of the intro. */
const pulseEndMs = (p) => p.startMs + trainMs(p);

/* One pulse train in 0–1, t in ms from its first rise: rise → fall → gap, `count` times. */
function trainAt(t, p) {
  if (t < 0 || t >= trainMs(p)) return 0;
  const x = t % (p.riseMs + p.fallMs + p.gapMs);
  if (x < p.riseMs) return ease(x / p.riseMs);
  if (x < p.riseMs + p.fallMs) return 1 - ease((x - p.riseMs) / p.fallMs);
  return 0;
}

/* After the intro's train: rest, then the same train again, forever. */
function loopAt(t, p) {
  const x = t % (p.restMs + trainMs(p));
  return x < p.restMs ? 0 : trainAt(x - p.restMs, p);
}

/* The glow's level getter: the intro's pulse train, then either the train on a
   loop or breathing, from the moment it ends. VoiceBeam samples it every frame,
   so none of this re-renders React.
   `swell()` takes one deep breath up to full and resolves at the top of it. */
function useGlow(br, pulse) {
  const cfg = useRef({ br, pulse });
  cfg.current = { br, pulse };
  const start = useRef(performance.now());
  const swellFrom = useRef(null);

  const getLevel = useCallback(() => {
    const { br: c, pulse: p } = cfg.current;
    const now = performance.now();
    const ms = now - start.current;
    const end = pulseEndMs(p);
    let base;
    if (ms < end) base = c.low + (p.peak - c.low) * trainAt(ms - p.startMs, p);
    else if (p.afterIntro === 'pulse') base = c.low + (p.peak - c.low) * loopAt(ms - end, p);
    else base = c.low + (c.high - c.low) * breathAt((ms - end) / 1000, c);
    if (swellFrom.current === null) return base;
    const k = Math.min(1, (now - swellFrom.current) / (c.swellSec * 1000));
    return base + (1 - base) * ease(k);
  }, []);

  const swell = useCallback(
    () =>
      new Promise((done) => {
        swellFrom.current = performance.now();
        setTimeout(done, cfg.current.br.swellSec * 1000);
      }),
    [],
  );

  const replay = useCallback(() => {
    start.current = performance.now();
    swellFrom.current = null;
  }, []);

  return { getLevel, swell, replay };
}

/* ── Brand ─────────────────────────────────────────────── */

/* The "Unwind" opening (logo-motion.html option 03): the mark starts coiled to a
   sliver and uncoils to full width, once, then holds the exact Paper path.
   Every frame rewrites the path's points; no tilt, shine or colour change. */
function Mark({ o, delayMs }) {
  const path = useRef(null);
  const cfg = useRef(o);
  cfg.current = o;

  useLayoutEffect(() => {
    const el = path.current;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t0 = performance.now() + delayMs;
    let raf;
    const tick = (now) => {
      const p = (now - t0) / cfg.current.durationMs;
      if (p >= 1) {
        el.setAttribute('d', MARK_PATH);
        el.style.opacity = '';
        return;
      }
      raf = requestAnimationFrame(tick);
      const f = unwindFrame(clamp01(p), cfg.current);
      el.setAttribute('d', f.d);
      el.style.opacity = p < 0 ? '0' : String(f.opacity);
    };
    /* First frame before paint, so the finished logo never flashes. */
    tick(performance.now());
    return () => cancelAnimationFrame(raf);
  }, [delayMs]);

  return (
    <svg className="w-mark" viewBox={`0 0 ${MARK_W} ${MARK_H}`} aria-hidden="true">
      <path ref={path} d={MARK_PATH} fill="currentColor" />
    </svg>
  );
}

function Wordmark(markProps) {
  return (
    <h1 className="w-logo" aria-label="Unwind">
      <Mark {...markProps} />
      <span className="w-word" aria-hidden="true">
        {WORDMARK.map(({ ch, italic }, i) => (
          <span key={i} className="w-letter" data-italic={italic || undefined} style={{ '--i': i }}>
            {ch}
          </span>
        ))}
      </span>
    </h1>
  );
}

/* ── Screen ────────────────────────────────────────────── */
function Welcome() {
  const s = useDialKit('Screen', SCREEN, { id: 'welcome-screen' });
  const brand = useDialKit('Brand', BRAND, { id: 'welcome-brand' });
  const br = useDialKit('Breath', BREATH, { id: 'welcome-breath' });
  const pulse = useDialKit('Beam pulse', PULSE, { id: 'welcome-pulse' });
  const intro = useDialKit(
    'Intro',
    { ...INTRO, replay: { type: 'action', label: 'Replay intro' } },
    { id: 'welcome-intro', onAction: () => replayIntro() },
  );
  const logo = useDialKit('Logo opening', UNWIND_DIALS, { id: 'welcome-logo' });
  const b = useDialKit('Voice beam', WELCOME_BEAM, { id: 'welcome-beam', defaultCollapsed: true });

  const glow = useGlow(br, pulse);
  const markDelay = Math.max(0, pulseEndMs(pulse) + pulse.wordmarkOffsetMs);
  const [run, setRun] = useState(0);
  const [leaving, setLeaving] = useState(false);

  function replayIntro() {
    glow.replay();
    setLeaving(false);
    setRun((n) => n + 1);
  }

  async function getStarted() {
    if (leaving) return;
    setLeaving(true);
    await glow.swell();
    window.location.href = `/${s.nextPage}`;
  }

  const framed = s.deviceFrame;
  const screenH = framed ? FRAMED_SCREEN_H : s.screenHeight;
  const deviceW = framed ? FRAME.w * FRAME_K : 390;
  const deviceH = framed ? FRAME.h * FRAME_K : screenH;

  return (
    <main className="stage" style={{ background: s.pageColor }}>
      <div className="device" style={{ width: deviceW * s.previewScale, height: deviceH * s.previewScale }}>
        <div
          className="device-scaler"
          data-framed={framed || undefined}
          style={{
            width: deviceW,
            height: deviceH,
            transform: `scale(${s.previewScale})`,
            '--screen-x': framed ? `${FRAME.x * FRAME_K}px` : '0px',
            '--screen-y': framed ? `${FRAME.y * FRAME_K}px` : '0px',
            '--screen-radius': framed ? `${FRAMED_RADIUS}px` : '62px',
          }}
        >
          {framed && <div className="screen-fill" style={{ height: screenH, background: s.screenColor }} />}
          <VoiceBeam className="beam-host" level={glow.getLevel} {...beamProps(b)}>
            <section
              key={run}
              className="voice-screen welcome"
              data-leaving={leaving || undefined}
              aria-label="Welcome to Unwind"
              style={{
                height: screenH,
                background: s.screenColor,
                '--brand': brand.color,
                '--word-size': `${brand.wordSize}px`,
                '--group-y': `${brand.groupY * 100}%`,
                '--tagline-color': brand.taglineColor,
                '--tagline-size': `${brand.taglineSize}px`,
                '--letter-delay': `${markDelay + logo.durationMs * intro.lettersAt}ms`,
                '--letter-stagger': `${intro.letterStaggerMs}ms`,
                '--letter-ms': `${intro.letterMs}ms`,
                '--letter-drift': `${intro.letterDrift}px`,
                '--letter-blur': `${intro.letterBlur}px`,
                '--tagline-delay': `${markDelay + intro.taglineAfterMs}ms`,
                '--cta-delay': `${markDelay + intro.ctaAfterMs}ms`,
              }}
            >
              <div className="w-brand">
                <Wordmark o={logo} delayMs={markDelay} />
                <p className="w-tagline">{brand.tagline}</p>
              </div>

              <div className="w-actions">
                <button type="button" className="w-btn primary" onClick={getStarted}>
                  Get started
                </button>
                <button type="button" className="w-btn secondary">
                  I already have an account
                </button>
                <p className="w-legal">
                  By continuing, you agree to Unwind’s <a href="#terms">Terms of Service</a> and{' '}
                  <a href="#privacy">Privacy Policy</a>.
                </p>
              </div>
            </section>
          </VoiceBeam>
          {framed && <img className="iphone-frame" src={iphoneFrameUrl} alt="" draggable={false} />}
        </div>
      </div>

      <DialRoot position="top-right" productionEnabled theme="light" />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Welcome />);
