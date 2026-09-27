import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { VoiceBeam } from 'voice-glow';
import { DialRoot, useDialKit } from 'dialkit';
import 'dialkit/styles.css';
import './voice.css';
import './welcome.css';
import iphoneFrameUrl from '../iphone_asset/iPhone - Silver.png';
import { BEAM, FRAME, FRAME_K, FRAMED_RADIUS, FRAMED_SCREEN_H, beamProps } from './recorder.jsx';
import { StatusBar } from './status-bar.jsx';
import { Backdrop } from './backdrop.jsx';
import { UNWIND_DIALS } from './unwind-mark.js';
import waveLogo from './icons/wave.png';
import { WAVE_H, WAVE_PATH, WAVE_W } from './wave-path.js';
import wordLogo from './icons/unwind.png';

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

const BRAND = {
  wordSize: [50, 32, 72, 1],
  groupY: [0.395, 0.2, 0.6, 0.005],
  logo: {
    /* The word: the blue PNG, or flat Test Family text ("un" upright, "wind" italic). */
    word: { type: 'select', options: [{ value: 'png', label: 'Blue PNG' }, { value: 'text', label: 'Flat text' }], default: 'text' },
    textColor: '#72bdfa',
    /* Flat text: "un" in italic like "wind", or upright. */
    italicUn: false,
    /* The word stays centred on screen; the mark sits to its left or above it. */
    markPlace: { type: 'select', options: [{ value: 'left', label: 'Left of word' }, { value: 'above', label: 'Above word' }], default: 'left' },
    markGap: [7, -20, 60, 1],
    markScale: [1.03, 0.4, 2.5, 0.01],
    markX: [0, -120, 120, 1],
    markY: [2, -120, 120, 1],
    wordX: [41, -150, 150, 1],
    wordY: [6, -200, 200, 1],
  },
  tagline: 'Talk it out. Find clarity.',
  taglineColor: '#8e98a6',
  taglineSize: [19.5, 14, 28, 0.5],
  taglineFont: {
    type: 'select',
    options: [
      { value: 'test', label: 'Test Family' },
      { value: 'test-italic', label: 'Test Family Italic' },
      { value: 'inter', label: 'Inter' },
    ],
    default: 'inter',
  },
  button: {
    background: '#72bdfa',
    text: '#ffffff',
    strokeColor: '#ffffff',
    strokeOpacity: [0.72, 0, 1, 0.01],
    strokeWidth: [1, 0, 6, 0.5],
  },
};

const WELCOME_BACKDROP = { width: 700, height: 750, radius: 0, fill: '../bg-images/day-park.png', color: '#bcc8d5' };

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
  count: [3, 1, 6, 1],
  riseMs: [450, 40, 2000, 10],
  fallMs: [750, 40, 3000, 10],
  gapMs: [300, 0, 2000, 10],
  peak: [1, 0, 1, 0.01],
  /* When the logo appears relative to the last intro pulse ending. */
  wordmarkOffsetMs: [150, -2000, 2000, 10],
  /* After the intro: keep pulsing, or settle into the slow Breath cycle. */
  afterIntro: { type: 'select', options: ['spread', 'pulse', 'breathe'], default: 'spread' },
  /* afterIntro 'spread': once everything is on screen, the glow rises slowly to
     `height` (1 = the beam's full reach) and stays there. */
  spread: {
    /* The last pulse rises to this and stays, then climbs to `height`. */
    hold: [0.55, 0, 1, 0.01],
    height: [0.9, 0, 1, 0.01],
    /* How long the last pulse holds before it starts climbing. */
    delayMs: [0, 0, 5000, 10],
    durationMs: [3500, 200, 12000, 50],
  },
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
  /* The wordmark starts this far into the logo's opening (0 = with it, 1 = after). */
  lettersAt: [0.45, 0, 1, 0.01],
  letterMs: [1810, 100, 3000, 10],
  letterDrift: [-29, -120, 60, 1],
  letterBlur: [13, 0, 30, 0.5],
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
function useGlow(br, pulse, intro) {
  const cfg = useRef({ br, pulse, intro });
  cfg.current = { br, pulse, intro };
  const start = useRef(performance.now());
  const swellFrom = useRef(null);

  const getLevel = useCallback(() => {
    const { br: c, pulse: p, intro: it } = cfg.current;
    const now = performance.now();
    const ms = now - start.current;
    const end = pulseEndMs(p);
    let base;
    const cycle = p.riseMs + p.fallMs + p.gapMs;
    const lastStart = p.startMs + (p.count - 1) * cycle;
    if (p.afterIntro === 'spread' && ms >= lastStart) {
      // The last pulse rises and stays, then climbs slowly to the spread height.
      const x = ms - lastStart;
      const up = p.spread.hold * ease(Math.min(1, x / p.riseMs));
      const k = Math.min(1, Math.max(0, (x - p.riseMs - p.spread.delayMs) / p.spread.durationMs));
      base = x < p.riseMs ? up : p.spread.hold + (p.spread.height - p.spread.hold) * ease(k);
    }
    // The opening pulses run from nothing to the peak and back to nothing.
    else if (ms < end) base = p.peak * trainAt(ms - p.startMs, p);
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

/* The logo is two parts: the blue wave mark (src/icons/wave.png) and the
   "unwind" wordmark. The mark opens with one of five styles (Logo opening ›
   style). The draw styles reveal the PNG through a mask stroked along the
   wave's traced centreline, so it is painted left to right following its curves:
 *   squeeze  starts squeezed to a sliver and springs out to full width
 *   pen      a crisp pen stroke traces the wave
 *   brush    a soft, feathered brush paints it in
 *   comet    the brush with a bright head leading the stroke
 *   ink      traces in, then the finished mark gives a small settle
 * The wordmark then sweeps in from the left on the wind, blurred, settling. */
const MARK_STYLES = [
  { value: 'squeeze', label: '1 · Squeeze' },
  { value: 'pen', label: '2 · Pen' },
  { value: 'brush', label: '3 · Brush' },
  { value: 'comet', label: '4 · Comet' },
  { value: 'ink', label: '5 · Ink settle' },
];
const LOGO_DIALS = {
  style: { type: 'select', options: MARK_STYLES, default: 'brush' },
  ...UNWIND_DIALS,
  durationMs: [2140, 300, 5000, 10],
  bounce: [0.55, 0, 2, 0.05],
  /* Draw styles: stroke width over the wave's thickness, feather, and the curve. */
  strokePad: [1.5, 1, 3, 0.05],
  softness: [15.5, 0, 30, 0.5],
  drawEase: {
    type: 'select',
    options: [
      { value: 'smooth', label: 'Smooth (in-out)' },
      { value: 'out', label: 'Ease out' },
      { value: 'linear', label: 'Linear' },
    ],
    default: 'out',
  },
  headGlow: [0.9, 0, 1, 0.01],
};
const EASES = {
  smooth: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  out: (t) => 1 - (1 - t) ** 3,
  linear: (t) => t,
};

function Mark({ o, delayMs }) {
  const root = useRef(null);
  const stroke = useRef(null);
  const head = useRef(null);
  const cfg = useRef(o);
  cfg.current = o;
  const id = useId().replace(/[^a-z0-9]/gi, '');
  const drawn = o.style !== 'squeeze';

  useLayoutEffect(() => {
    const el = root.current;
    const path = stroke.current;
    const dot = head.current;
    const len = path?.getTotalLength();
    if (path) path.style.strokeDasharray = `${len} ${len}`;
    const done = () => {
      el.style.transform = '';
      el.style.opacity = '';
      path?.style.setProperty('stroke-dashoffset', '0');
      if (dot) dot.style.opacity = '0';
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return done();
    const t0 = performance.now() + delayMs;
    let raf;
    const tick = (now) => {
      const c = cfg.current;
      const p = (now - t0) / c.durationMs;
      if (p >= 1) return done();
      raf = requestAnimationFrame(tick);
      const q = Math.min(1, Math.max(0, p));
      if (c.style === 'squeeze') {
        const sx = c.startWidth + (1 - c.startWidth) * springOut(q, c.bounce);
        el.style.transformOrigin = c.anchor === 'center' ? '50% 50%' : '0 50%';
        el.style.transform = `scaleX(${sx})`;
        el.style.opacity = p < 0 ? '0' : String(Math.min(1, q / 0.12));
        return;
      }
      // Draw styles: ink draws in 80% of the time, then settles.
      const drawP = c.style === 'ink' ? Math.min(1, q / 0.8) : q;
      const e = EASES[c.drawEase](drawP);
      el.style.opacity = p < 0 ? '0' : '1';
      path.style.strokeDashoffset = String(len * (1 - e));
      if (c.style === 'ink') {
        const s = q < 0.8 ? 1 : 1 + 0.06 * c.bounce * 5 * Math.sin(((q - 0.8) / 0.2) * Math.PI);
        el.style.transform = `scale(${s})`;
      }
      if (dot) {
        const pt = path.getPointAtLength(len * e);
        dot.setAttribute('cx', pt.x);
        dot.setAttribute('cy', pt.y);
        dot.style.opacity = String(c.headGlow * Math.min(1, e * 8, (1 - e) * 8));
      }
    };
    /* First frame before paint, so the finished logo never flashes. */
    tick(performance.now());
    return () => cancelAnimationFrame(raf);
  }, [delayMs, o.style]);

  if (!drawn) return <img ref={root} className="w-mark" src={waveLogo} alt="" draggable={false} />;
  const soft = o.style === 'pen' ? 0 : o.softness;
  return (
    <svg ref={root} className="w-mark" viewBox={`0 0 ${WAVE_W} ${WAVE_H}`} style={{ aspectRatio: `${WAVE_W} / ${WAVE_H}`, overflow: 'visible' }} aria-hidden="true">
      <defs>
        <filter id={`f${id}`} filterUnits="userSpaceOnUse" x="-80" y="-80" width={WAVE_W + 160} height={WAVE_H + 160}>
          <feGaussianBlur stdDeviation={soft} />
        </filter>
        <mask id={`m${id}`} maskUnits="userSpaceOnUse" x="-80" y="-80" width={WAVE_W + 160} height={WAVE_H + 160}>
          <path
            ref={stroke}
            d={WAVE_PATH}
            fill="none"
            stroke="#fff"
            strokeWidth={42 * o.strokePad + 3 * soft}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={soft ? `url(#f${id})` : undefined}
          />
        </mask>
        <radialGradient id={`g${id}`}>
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.4" stopColor="#bfe0ff" />
          <stop offset="1" stopColor="#61A8FD" stopOpacity="0" />
        </radialGradient>
      </defs>
      <image href={waveLogo} width={WAVE_W} height={WAVE_H} mask={`url(#m${id})`} />
      {o.style === 'comet' && <circle ref={head} r="26" fill={`url(#g${id})`} style={{ mixBlendMode: 'screen' }} />}
    </svg>
  );
}

/* 0 → 1 with a damped overshoot; bounce 0 is a plain ease-out. */
function springOut(t, bounce) {
  const e = 1 - (1 - t) ** 3;
  return e + bounce * Math.sin(Math.PI * t) * (1 - t);
}

const WORD_LETTERS = [...'unwind'].map((ch, i) => ({ ch, un: i < 2 }));

function Wordmark({ lg, ...markProps }) {
  return (
    <h1 className="w-logo" data-mark={lg.markPlace} aria-label="Unwind">
      <Mark {...markProps} />
      {lg.word === 'png' ? (
        <img className="w-word" src={wordLogo} alt="" draggable={false} />
      ) : (
        <span className="w-word w-word-text" aria-hidden="true" style={{ color: lg.textColor }}>
          {WORD_LETTERS.map(({ ch, un }, i) => (
            <span key={i} data-italic={!un || lg.italicUn || undefined}>{ch}</span>
          ))}
        </span>
      )}
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
  const logo = useDialKit('Logo opening', LOGO_DIALS, { id: 'welcome-logo' });
  const b = useDialKit('Voice beam', WELCOME_BEAM, { id: 'welcome-beam', defaultCollapsed: true });

  const glow = useGlow(br, pulse, intro);
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
      <Backdrop defaults={WELCOME_BACKDROP} id="backdrop-welcome" />
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
                '--word-size': `${brand.wordSize}px`,
                '--group-y': `${brand.groupY * 100}%`,
                '--tagline-color': brand.taglineColor,
                '--tagline-size': `${brand.taglineSize}px`,
                '--word-x': `${brand.logo.wordX}px`,
                '--word-y': `${brand.logo.wordY}px`,
                '--mark-gap': `${brand.logo.markGap}px`,
                '--mark-scale': brand.logo.markScale,
                '--mark-x': `${brand.logo.markX}px`,
                '--mark-y': `${brand.logo.markY}px`,
                '--cta-bg': brand.button.background,
                '--cta-fg': brand.button.text,
                '--cta-stroke': `color-mix(in srgb, ${brand.button.strokeColor} ${brand.button.strokeOpacity * 100}%, transparent)`,
                '--cta-stroke-w': `${brand.button.strokeWidth}px`,
                '--letter-delay': `${markDelay + logo.durationMs * intro.lettersAt}ms`,
                '--letter-ms': `${intro.letterMs}ms`,
                '--letter-drift': `${intro.letterDrift}px`,
                '--letter-blur': `${intro.letterBlur}px`,
                '--tagline-delay': `${markDelay + intro.taglineAfterMs}ms`,
                '--cta-delay': `${markDelay + intro.ctaAfterMs}ms`,
              }}
            >
              <div className="w-brand">
                <Wordmark lg={brand.logo} o={logo} delayMs={markDelay} />
                <p
                  className="w-tagline"
                  style={
                    brand.taglineFont === 'inter'
                      ? { fontFamily: 'Inter, -apple-system, system-ui, sans-serif', fontStyle: 'normal' }
                      : { fontStyle: brand.taglineFont === 'test-italic' ? 'italic' : 'normal' }
                  }
                >
                  {brand.tagline}
                </p>
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
          <StatusBar height={screenH} />
          {framed && <img className="iphone-frame" src={iphoneFrameUrl} alt="" draggable={false} />}
        </div>
      </div>

      <DialRoot position="top-right" productionEnabled theme="light" />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Welcome />);
