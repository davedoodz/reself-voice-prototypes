import { useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { VoiceBeam } from 'voice-glow';
import { DialRoot, useDialKit } from 'dialkit';
import 'dialkit/styles.css';
import './voice.css';
import './welcome.css';
import iphoneFrameUrl from '../iphone_asset/iPhone - Silver.png';
import { BEAM, FRAME, FRAME_K, FRAMED_RADIUS, FRAMED_SCREEN_H, beamProps } from './recorder.jsx';

/* ─────────────────────────────────────────────────────────
 * UNWIND — first-run welcome
 *
 * No mascot: the glow along the bottom edge is the entity. It is the same
 * VoiceBeam the recorder listens with, so tapping Get started hands the user
 * to a screen where that glow is already waiting in the same place.
 *
 * The glow breathes (level follows an inhale → hold → exhale → rest cycle)
 * and its colours drift sideways with `flow`, like wind.
 *
 *    0ms   screen empty, glow starts its first inhale
 *  +mark   the logo mark is drawn left → right, like a gust
 *  +word   the letters of "unwind" are blown in, one by one
 *  +line   tagline settles
 *  +cta    buttons and legal rise in
 *
 *  GET STARTED   the glow takes one deep breath (swell), then the recorder opens
 * ───────────────────────────────────────────────────────── */

const WORDMARK = 'unwind';

const BRAND = {
  color: '#80DCF7',
  wordSize: [48, 32, 72, 1],
  groupY: [0.4, 0.2, 0.6, 0.005],
  tagline: 'Breathe out. Say it out loud.',
  taglineColor: '#6f7f86',
  taglineSize: [20, 14, 28, 0.5],
};

const BREATH = {
  inhaleSec: [4, 1, 10, 0.1],
  holdSec: [1, 0, 6, 0.1],
  exhaleSec: [6, 1, 12, 0.1],
  restSec: [1.5, 0, 6, 0.1],
  low: [0.12, 0, 1, 0.01],
  high: [0.62, 0, 1, 0.01],
  swellSec: [1.1, 0.2, 4, 0.05],
};

const INTRO = {
  markDelayMs: [500, 0, 3000, 10],
  markMs: [1100, 100, 3000, 10],
  letterStaggerMs: [90, 0, 400, 5],
  letterMs: [900, 100, 3000, 10],
  letterDrift: [-26, -120, 60, 1],
  letterBlur: [10, 0, 30, 0.5],
  taglineDelayMs: [1900, 0, 5000, 10],
  ctaDelayMs: [2500, 0, 6000, 10],
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

/* The glow's level getter. VoiceBeam samples it every frame, so none of this
   re-renders React. `swell()` takes one deep breath up to full and resolves at
   the top of it. */
function useBreath(br) {
  const cfg = useRef(br);
  cfg.current = br;
  const start = useRef(performance.now());
  const swellFrom = useRef(null);

  const getLevel = useCallback(() => {
    const c = cfg.current;
    const now = performance.now();
    const base = c.low + (c.high - c.low) * breathAt((now - start.current) / 1000, c);
    if (swellFrom.current === null) return base;
    const k = Math.min(1, (now - swellFrom.current) / (c.swellSec * 1000));
    return base + (1 - base) * ease(k);
  }, []);

  const swell = useCallback(
    () =>
      new Promise((done) => {
        swellFrom.current = performance.now();
        setTimeout(done, cfg.current.swellSec * 1000);
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
const MARK_PATH =
  'M12.186 0.000C17.000 0.136 15.965 4.535 16.062 7.864C16.091 8.837 16.003 10.259 16.292 11.181C16.561 12.047 17.168 12.768 17.976 13.179C19.273 13.852 20.922 13.768 22.032 12.791C22.766 12.146 23.391 10.910 23.888 10.048L26.954 4.714C27.477 3.803 28.605 1.703 29.220 1.056C29.619 0.644 30.116 0.340 30.664 0.173C31.653 -0.136 32.743 0.013 33.646 0.484C35.502 1.503 35.389 3.069 35.484 4.794C35.578 6.519 35.220 9.642 35.691 11.187C35.947 12.046 36.544 12.761 37.343 13.168C37.916 13.466 38.591 13.618 39.237 13.620C42.883 13.628 43.449 7.939 45.201 7.453C45.454 7.383 45.733 7.465 45.954 7.594C46.216 7.748 46.462 8.010 46.527 8.316C46.590 8.614 46.451 8.882 46.323 9.144C45.976 9.860 45.534 10.543 45.137 11.233L42.965 15.014C41.090 18.271 39.191 21.523 37.329 24.788C36.670 25.944 35.848 26.365 34.618 26.668C33.874 26.743 32.810 26.551 32.164 26.138C30.228 24.899 30.477 23.172 30.435 21.315C30.406 20.033 30.573 16.744 30.282 15.643C30.044 14.753 29.457 13.998 28.654 13.548C27.219 12.749 25.193 12.932 24.173 14.216C23.206 15.433 22.353 17.122 21.570 18.480L19.013 22.910C18.175 24.376 17.460 26.089 15.698 26.574C14.728 26.842 13.722 26.631 12.841 26.161C12.279 25.861 11.655 25.181 11.379 24.585C10.592 22.481 11.426 17.535 10.867 15.567C10.630 14.712 10.060 13.988 9.284 13.557C8.709 13.238 8.031 13.084 7.375 13.070C3.623 12.991 2.901 18.887 1.413 19.197C1.087 19.265 0.650 19.176 0.380 18.981C0.183 18.839 0.046 18.627 0.010 18.385C-0.046 18.008 0.139 17.643 0.303 17.316C0.896 16.133 1.629 14.991 2.293 13.846L5.901 7.610L8.287 3.469C9.399 1.540 9.708 0.365 12.186 0.000Z';

/* Paper: 53×53 box, path offset (3.134, 13.107). Cropped here to the path itself. */
function Mark() {
  return (
    <svg className="w-mark" viewBox="0 0 46.6 26.8" aria-hidden="true">
      <path d={MARK_PATH} fill="currentColor" />
    </svg>
  );
}

function Wordmark() {
  return (
    <h1 className="w-logo" aria-label="Unwind">
      <Mark />
      <span className="w-word" aria-hidden="true">
        {[...WORDMARK].map((ch, i) => (
          <span key={i} className="w-letter" style={{ '--i': i }}>
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
  const intro = useDialKit(
    'Intro',
    { ...INTRO, replay: { type: 'action', label: 'Replay intro' } },
    { id: 'welcome-intro', onAction: () => replayIntro() },
  );
  const b = useDialKit('Voice beam', BEAM, { id: 'voice-beam', defaultCollapsed: true });

  const breath = useBreath(br);
  const [run, setRun] = useState(0);
  const [leaving, setLeaving] = useState(false);

  function replayIntro() {
    breath.replay();
    setLeaving(false);
    setRun((n) => n + 1);
  }

  async function getStarted() {
    if (leaving) return;
    setLeaving(true);
    await breath.swell();
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
          <VoiceBeam className="beam-host" level={breath.getLevel} {...beamProps(b)}>
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
                '--mark-delay': `${intro.markDelayMs}ms`,
                '--mark-ms': `${intro.markMs}ms`,
                '--letter-delay': `${intro.markDelayMs + intro.markMs * 0.45}ms`,
                '--letter-stagger': `${intro.letterStaggerMs}ms`,
                '--letter-ms': `${intro.letterMs}ms`,
                '--letter-drift': `${intro.letterDrift}px`,
                '--letter-blur': `${intro.letterBlur}px`,
                '--tagline-delay': `${intro.taglineDelayMs}ms`,
                '--cta-delay': `${intro.ctaDelayMs}ms`,
              }}
            >
              <div className="w-brand">
                <Wordmark />
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
