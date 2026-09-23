import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { VoiceBeam } from 'voice-glow';
import { DialRoot, useDialKit } from 'dialkit';
import 'dialkit/styles.css';
import './voice.css';
import iphoneFrameUrl from '../iphone_asset/iPhone - Silver.png';

/* ─────────────────────────────────────────────────────────
 * VOICE JOURNAL RECORDER — simulated take
 *
 *    0ms   recording starts, transcript empty, beam idles
 *  400ms   words arrive one by one (wordMs each); level
 *          pulses per syllable while "speaking"
 *          overflow rule decides how old words leave:
 *            fade-scroll    lines scroll up under a top fade
 *            rolling-window only the last N words stay
 *            page-clear     every N words start a fresh page
 *  +hold   take finished, voice falls silent
 *  +clear  transcript fades out; loops when `loop` is on
 * ───────────────────────────────────────────────────────── */

const LEAD_IN = 400;

const DEFAULT_TEXT =
  "Today felt slower in a good way. I finally took the long walk by the river and noticed how quiet my head got after the first twenty minutes. I want to remember that feeling, and protect one unscheduled hour every morning this week. Tomorrow I'll call Mom, water the plants, and start the chapter I keep putting off.";

const LAYOUTS = [
  { value: 'dock', label: '1 · Bottom dock' },
  { value: 'center', label: '2 · Center stage' },
  { value: 'header', label: '3 · Header + capsule' },
  { value: 'rail', label: '4 · Thumb rail' },
  { value: 'minimal', label: '5 · Minimal stop' },
];

/* Libraries.dev Studio values — the DialKit defaults. */
const BEAM = {
  response: {
    sensitivity: [4, 0, 10, 0.05],
    threshold: [0.3, 0, 0.95, 0.01],
    attack: [0.105, 0, 2, 0.005],
    release: [0.42, 0, 3, 0.01],
    idle: [1, 0, 1, 0.01],
    breatheDuration: [8, 0.2, 20, 0.1],
  },
  shape: {
    type: { type: 'select', options: ['mobile', 'default', 'pill'], default: 'mobile' },
    borderRadius: [62, 0, 120, 1],
    scale: [3, 0.1, 5, 0.05],
    glowSize: [0.25, 0, 3, 0.01],
    reach: [0.85, 0, 5, 0.01],
    spread: [0.8, 0, 3, 0.01],
    flow: [-68, -200, 200, 1],
    bend: [3, 0, 150, 1],
    rangeWidth: [1.6, 0.1, 4, 0.01],
    softness: [1.35, 0.2, 3, 0.01],
    distortion: [1, 0, 1, 0.01],
    distortionDetail: [3, 0.1, 6, 0.05],
  },
  band: {
    bandStrength: [2.65, 0, 4, 0.01],
    bandWidth: [0.3, 0, 6, 0.01],
    bandPosition: [0.1, 0.1, 1.3, 0.01],
    bandCurve: [4, 0.3, 8, 0.05],
    bandOffset: [-40, -150, 50, 1],
    bandTail: [1, 0, 1.5, 0.01],
    bandTailPosition: [0, 0, 0.98, 0.01],
    bandTailCurve: [1, 0.5, 6, 0.05],
    bandTailOverflow: [13, 0, 60, 1],
    bandAberration: [1, 0, 1, 0.01],
  },
  core: {
    coreSize: [3, 0, 6, 0.05],
    coreLight: [3, 0, 3, 0.01],
    strokeScale: [1.65, 0, 5, 0.05],
  },
  color: {
    colorVariant: {
      type: 'select',
      options: ['ice', 'colorful', 'mono', 'ocean', 'sunset', 'forest', 'candy', 'gold'],
      default: 'ice',
    },
    theme: { type: 'select', options: ['light', 'dark'], default: 'light' },
    brightness: [1.45, 0, 3, 0.01],
    saturation: [2.2, 0, 4, 0.01],
    hueRange: [0, 0, 180, 1],
    hueDuration: [2, 0.5, 30, 0.1],
    hueBase: [15, -180, 180, 1],
    strokeOpacity: [2, 0, 4, 0.05],
    innerOpacity: [2, 0, 4, 0.05],
    bloomOpacity: [2, 0, 4, 0.05],
  },
};

/* iphone_asset/iPhone - Silver.png: 874×1780, transparent screen cut-out at
   x 46–830, y 39–1741 (784×1702, ~113px corners). The frame is scaled so the
   cut-out is exactly the 390px screen. */
const FRAME = { w: 874, h: 1780, x: 46, y: 39, screenW: 784, screenH: 1702, radius: 113 };
const FRAME_K = 390 / FRAME.screenW;
const FRAMED_SCREEN_H = FRAME.screenH * FRAME_K;
const FRAMED_RADIUS = FRAME.radius * FRAME_K;
/* Clearance under the Dynamic Island for the top controls. */
const FRAMED_SAFE_TOP = 34;

const SCREEN = {
  layout: { type: 'select', options: LAYOUTS, default: 'dock' },
  modeLabel: 'Freeform',
  showTimer: true,
  deviceFrame: true,
  previewScale: [0.7, 0.4, 1.2, 0.01],
  screenHeight: [780, 500, 900, 1],
  screenColor: '#fafafa',
  pageColor: '#f7f7f7',
  simulation: {
    _collapsed: true,
    loop: true,
    voiceLevel: [0.85, 0, 1, 0.01],
    jitter: [0.35, 0, 1, 0.01],
  },
};

const TRANSCRIPT = {
  text: { type: 'text', default: DEFAULT_TEXT, placeholder: 'What the recorder hears…' },
  timing: {
    wordMs: [230, 60, 800, 10],
    holdMs: [2200, 0, 6000, 50],
    clearMs: [600, 100, 2000, 50],
  },
  overflow: {
    mode: { type: 'select', options: ['fade-scroll', 'rolling-window', 'page-clear'], default: 'fade-scroll' },
    maxLines: [4, 1, 10, 1],
    fadeEdge: [0.55, 0, 1, 0.01],
    scrollEaseMs: [480, 0, 1500, 10],
    rollingWords: [22, 4, 80, 1],
    pageWords: [24, 4, 80, 1],
    ageFade: [0.025, 0, 0.2, 0.005],
    minOpacity: [0.3, 0, 1, 0.01],
  },
  words: {
    wordInMs: [620, 80, 2000, 10],
    wordBlur: [8, 0, 24, 0.5],
    newColor: '#9a9a9a',
    textColor: '#3b3b3b',
  },
  type: {
    align: { type: 'select', options: ['center', 'left'], default: 'center' },
    textSize: [21, 12, 32, 0.5],
    lineHeight: [1.38, 1, 2, 0.01],
    weight: [450, 300, 700, 10],
    textY: [210, 100, 560, 1],
    sidePadding: [44, 16, 100, 1],
  },
};

function splitWords(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

/* The simulated take: a clock that only runs while recording, a level
   getter for VoiceBeam, and the handful of values React renders. */
function useRecorder(s, t) {
  const [status, setStatus] = useState('recording');
  const [visible, setVisible] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const level = useRef(0);
  const clock = useRef({ t: 0, rec: 0, last: 0 });
  const statusRef = useRef(status);
  statusRef.current = status;
  const params = useRef({ s, t });
  params.current = { s, t };
  const cache = useRef({ text: null, words: [] });

  useEffect(() => {
    let raf;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const c = clock.current;
      const dt = c.last ? Math.min(64, now - c.last) : 0;
      c.last = now;
      const { s: sp, t: tp } = params.current;
      if (cache.current.text !== tp.text) cache.current = { text: tp.text, words: splitWords(tp.text) };
      const n = cache.current.words.length;
      const { wordMs, holdMs, clearMs } = tp.timing;
      const speakEnd = LEAD_IN + n * wordMs;
      const total = speakEnd + holdMs + clearMs;
      const recording = statusRef.current === 'recording';

      if (recording) {
        c.t += dt;
        c.rec += dt;
        if (c.t >= total) {
          if (sp.simulation.loop) {
            c.t = 0;
            c.rec = 0;
          } else {
            c.t = speakEnd + holdMs;
            setStatus('stopped');
          }
        }
      }

      let target = 0;
      if (recording && c.t >= LEAD_IN && c.t < speakEnd) {
        const w = (c.t - LEAD_IN) / wordMs;
        const i = Math.floor(w);
        const syllable = Math.pow(Math.sin(Math.PI * (w - i)), 0.7);
        const wobble = 1 - sp.simulation.jitter * (0.5 + 0.5 * Math.sin(i * 12.9898 + now / 170));
        target = sp.simulation.voiceLevel * (0.35 + 0.65 * syllable) * wobble;
      }
      level.current += (target - level.current) * 0.35;

      // State only changes when a word lands, the take clears, or a second passes.
      setVisible(Math.max(0, Math.min(n, Math.ceil((c.t - LEAD_IN) / wordMs))));
      setClearing(c.t > speakEnd + holdMs);
      setSeconds(Math.floor(c.rec / 1000));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const restart = useCallback(() => {
    clock.current.t = 0;
    clock.current.rec = 0;
    setStatus('recording');
  }, []);
  const togglePause = useCallback(
    () => setStatus((st) => (st === 'recording' ? 'paused' : st === 'paused' ? 'recording' : st)),
    [],
  );
  const stop = useCallback(() => setStatus('stopped'), []);
  const getLevel = useCallback(() => level.current, []);

  return { status, visible, clearing, seconds, restart, togglePause, stop, getLevel };
}

/* ── Icons ─────────────────────────────────────────────── */
const icon = (d, extra) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">{d}{extra}</svg>
);
const BackIcon = () => icon(<path d="M15 5l-7 7 7 7" />);
const PauseIcon = () => icon(<><path d="M9 6v12" /><path d="M15 6v12" /></>);
const PlayIcon = () => icon(<path className="fill" d="M8 5.5v13l10.5-6.5z" />);
const RestartIcon = () => icon(<><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" /><path d="M4.5 4.5v4h4" /></>);
const StopIcon = () => icon(<rect className="fill" x="7" y="7" width="10" height="10" rx="2.5" />);

/* ── Controls ──────────────────────────────────────────── */
function Back() {
  return (
    <a className="ctl" href="/" aria-label="Back to home">
      <BackIcon />
    </a>
  );
}

function ModePill({ label }) {
  return (
    <button type="button" className="mode-pill">
      {label}
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 5 6 7.5 8.5 5" /></svg>
    </button>
  );
}

function PauseButton({ rec, size, withLabel }) {
  const paused = rec.status === 'paused';
  return (
    <button
      type="button"
      className={`ctl ${size || ''} ${withLabel ? 'labeled' : ''}`}
      aria-label={paused ? 'Resume recording' : 'Pause recording'}
      disabled={rec.status === 'stopped'}
      onClick={rec.togglePause}
    >
      {paused ? <PlayIcon /> : <PauseIcon />}
      {withLabel && <span>{paused ? 'Resume' : 'Pause'}</span>}
    </button>
  );
}

function RestartButton({ rec, size, withLabel }) {
  return (
    <button
      type="button"
      className={`ctl ${size || ''} ${withLabel ? 'labeled' : ''}`}
      aria-label="Restart recording"
      onClick={rec.restart}
    >
      <RestartIcon />
      {withLabel && <span>Restart</span>}
    </button>
  );
}

function StopButton({ rec, size, withLabel }) {
  return (
    <button
      type="button"
      className={`ctl stop ${size || ''} ${withLabel ? 'labeled' : ''}`}
      aria-label="Stop and save entry"
      disabled={rec.status === 'stopped'}
      onClick={rec.stop}
    >
      <StopIcon />
      {withLabel && <span>{rec.status === 'stopped' ? 'Saved' : 'Stop'}</span>}
    </button>
  );
}

function Timer({ rec }) {
  const mm = String(Math.floor(rec.seconds / 60)).padStart(2, '0');
  const ss = String(rec.seconds % 60).padStart(2, '0');
  return (
    <div className="timer" data-status={rec.status}>
      <span className="dot" aria-hidden="true" />
      <span>{rec.status === 'stopped' ? 'Saved' : `${mm}:${ss}`}</span>
    </div>
  );
}

/* ── Layout presets ────────────────────────────────────── */
function Layout({ layout, rec, s }) {
  const mode = <ModePill label={s.modeLabel} />;
  const timer = s.showTimer ? <Timer rec={rec} /> : null;

  switch (layout) {
    case 'center':
      return (
        <>
          <div className="slot top-row"><Back />{mode}</div>
          <div className="slot bottom-center column">
            {timer}
            <div className="row gap-24">
              <RestartButton rec={rec} />
              <StopButton rec={rec} size="xl" />
              <PauseButton rec={rec} />
            </div>
          </div>
        </>
      );
    case 'header':
      return (
        <>
          <div className="slot top-row"><Back />{timer}{mode}</div>
          <div className="slot bottom-center">
            <div className="capsule">
              <PauseButton rec={rec} withLabel />
              <StopButton rec={rec} withLabel />
              <RestartButton rec={rec} withLabel />
            </div>
          </div>
        </>
      );
    case 'rail':
      return (
        <>
          <div className="slot top-row"><Back />{timer}</div>
          <div className="slot bottom-left">{mode}</div>
          <div className="slot bottom-right rail">
            <PauseButton rec={rec} />
            <RestartButton rec={rec} />
            <StopButton rec={rec} size="lg" />
          </div>
        </>
      );
    case 'minimal':
      return (
        <>
          <div className="slot top-left"><Back /></div>
          <div className="slot top-center">{timer}</div>
          <div className="slot above-controls">{mode}</div>
          <div className="slot bottom-center row gap-16">
            <PauseButton rec={rec} />
            <StopButton rec={rec} size="wide" withLabel />
            <RestartButton rec={rec} />
          </div>
        </>
      );
    case 'dock':
    default:
      return (
        <>
          <div className="slot top-left"><Back /></div>
          <div className="slot top-center">{timer}</div>
          <div className="slot bottom-row">
            {mode}
            <div className="row gap-12">
              <RestartButton rec={rec} />
              <PauseButton rec={rec} />
              <StopButton rec={rec} />
            </div>
          </div>
        </>
      );
  }
}

/* ── Transcript ────────────────────────────────────────── */
function Transcript({ words, rec, t, rightInset }) {
  const { overflow: o, words: w, type: ty } = t;
  const n = Math.min(rec.visible, words.length);
  let start = 0;
  if (o.mode === 'rolling-window') start = Math.max(0, n - o.rollingWords);
  if (o.mode === 'page-clear') start = Math.floor(Math.max(0, n - 1) / o.pageWords) * o.pageWords;

  const innerRef = useRef(null);
  const prevHeight = useRef(0);

  // FLIP: when a new line pushes the text up, start it where it was and ease it into place.
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    const delta = h - prevHeight.current;
    prevHeight.current = h;
    if (delta <= 0 || o.scrollEaseMs === 0) return;
    el.style.transition = 'none';
    el.style.transform = `translateY(${delta}px)`;
    el.getBoundingClientRect();
    el.style.transition = `transform ${o.scrollEaseMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    el.style.transform = '';
  }, [n, start]);

  const boxHeight = o.maxLines * ty.lineHeight * ty.textSize;
  const mask = o.fadeEdge > 0 ? `linear-gradient(to bottom, transparent 0, #000 ${o.fadeEdge * 100}%)` : 'none';

  return (
    <div
      className="transcript"
      data-clearing={rec.clearing || undefined}
      style={{
        left: ty.sidePadding,
        right: ty.sidePadding + rightInset,
        bottom: ty.textY,
        height: boxHeight,
        WebkitMaskImage: mask,
        maskImage: mask,
        '--new-color': w.newColor,
        '--word-blur': `${w.wordBlur}px`,
        '--word-in': `${w.wordInMs}ms`,
      }}
    >
      <p
        ref={innerRef}
        aria-live="polite"
        style={{
          color: w.textColor,
          fontSize: ty.textSize,
          lineHeight: ty.lineHeight,
          fontWeight: ty.weight,
          textAlign: ty.align,
        }}
      >
        {words.slice(start, n).map((word, k) => {
          const i = start + k;
          const age = n - 1 - i;
          return (
            <span
              key={i}
              className="word"
              style={{ opacity: Math.max(o.minOpacity, 1 - age * o.ageFade) }}
            >
              {word}{' '}
            </span>
          );
        })}
      </p>
    </div>
  );
}

function App() {
  const s = useDialKit('Screen', SCREEN, { id: 'voice-screen' });
  const t = useDialKit('Transcript', TRANSCRIPT, { id: 'voice-transcript' });
  const b = useDialKit('Voice beam', BEAM, { id: 'voice-beam', defaultCollapsed: true });
  const rec = useRecorder(s, t);
  const words = splitWords(t.text);
  const framed = s.deviceFrame;
  const screenH = framed ? FRAMED_SCREEN_H : s.screenHeight;
  const deviceW = framed ? FRAME.w * FRAME_K : 390;
  const deviceH = framed ? FRAME.h * FRAME_K : screenH;

  return (
    <main className="stage" style={{ background: s.pageColor }}>
      <div
        className="device"
        style={{ width: deviceW * s.previewScale, height: deviceH * s.previewScale }}
      >
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
            '--safe-top': framed ? `${FRAMED_SAFE_TOP}px` : '0px',
          }}
        >
          {framed && <div className="screen-fill" style={{ height: screenH, background: s.screenColor }} />}
          <VoiceBeam
            className="beam-host"
            level={rec.getLevel}
            active={rec.status !== 'stopped'}
            type={b.shape.type}
            sensitivity={b.response.sensitivity}
            threshold={b.response.threshold}
            attack={b.response.attack}
            release={b.response.release}
            breatheDuration={b.response.breatheDuration}
            colorVariant={b.color.colorVariant}
            theme={b.color.theme}
            borderRadius={b.shape.borderRadius}
            scale={b.shape.scale}
            glowSize={b.shape.glowSize}
            idle={b.response.idle}
            reach={b.shape.reach}
            spread={b.shape.spread}
            flow={b.shape.flow}
            bend={b.shape.bend}
            bandStrength={b.band.bandStrength}
            bandWidth={b.band.bandWidth}
            bandPosition={b.band.bandPosition}
            bandCurve={b.band.bandCurve}
            bandOffset={b.band.bandOffset}
            bandTail={b.band.bandTail}
            bandTailPosition={b.band.bandTailPosition}
            bandTailCurve={b.band.bandTailCurve}
            bandTailOverflow={b.band.bandTailOverflow}
            bandAberration={b.band.bandAberration}
            distortion={b.shape.distortion}
            distortionDetail={b.shape.distortionDetail}
            rangeWidth={b.shape.rangeWidth}
            softness={b.shape.softness}
            coreSize={b.core.coreSize}
            coreLight={b.core.coreLight}
            strokeScale={b.core.strokeScale}
            brightness={b.color.brightness}
            saturation={b.color.saturation}
            hueRange={b.color.hueRange}
            hueDuration={b.color.hueDuration}
            style={{
              '--voice-hue-base': `${b.color.hueBase}deg`,
              '--voice-stroke-opacity': String(b.color.strokeOpacity),
              '--voice-inner-opacity': String(b.color.innerOpacity),
              '--voice-bloom-opacity': String(b.color.bloomOpacity),
            }}
          >
            <section
              className="voice-screen"
              data-layout={s.layout}
              aria-label="Voice journal recorder"
              style={{ height: screenH, background: s.screenColor }}
            >
              {/* The thumb rail sits at the right edge, so the text keeps clear of it. */}
              <Transcript words={words} rec={rec} t={t} rightInset={s.layout === 'rail' ? 40 : 0} />
              <Layout layout={s.layout} rec={rec} s={s} />
            </section>
          </VoiceBeam>
          {framed && <img className="iphone-frame" src={iphoneFrameUrl} alt="" draggable={false} />}
        </div>
      </div>

      <DialRoot position="top-right" productionEnabled theme="light" />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
