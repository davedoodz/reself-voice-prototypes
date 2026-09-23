import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { VoiceBeam, useMicrophone } from 'voice-glow';
import { DialRoot, useDialKit } from 'dialkit';
import 'dialkit/styles.css';
import './voice.css';

/* ─────────────────────────────────────────────────────────
 * DEMO STORYBOARD (one loop)
 *
 *    0ms   transcript empty, beam idles
 *  400ms   words arrive one by one (wordMs each); level
 *          pulses per syllable while "speaking"
 *  +hold   sentence complete, voice falls silent
 *  +clear  transcript fades out, loop restarts
 * ───────────────────────────────────────────────────────── */

const TRANSCRIPT = 'Set a timer for ten minutes and remind me to water the plants';
const WORDS = TRANSCRIPT.split(' ');
const LEAD_IN = 400;

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

const DEMO = {
  wordMs: [260, 80, 800, 10],
  holdMs: [1800, 0, 5000, 50],
  clearMs: [500, 100, 2000, 50],
  voiceLevel: [0.85, 0, 1, 0.01],
  jitter: [0.35, 0, 1, 0.01],
  previewScale: [0.7, 0.4, 1.2, 0.01],
  screenHeight: [780, 500, 900, 1],
  textSize: [21, 12, 32, 0.5],
  textY: [200, 120, 500, 1],
  screenColor: '#fafafa',
  pageColor: '#f7f7f7',
};

function useSpeechLoop(d) {
  const [words, setWords] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [playing, setPlaying] = useState(true);
  const level = useRef(0);
  const progressRef = useRef(null);
  const clock = useRef({ t: 0, last: 0 });
  const params = useRef(d);
  params.current = d;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    let raf;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const c = clock.current;
      const dt = c.last ? Math.min(64, now - c.last) : 0;
      c.last = now;
      const p = params.current;
      const speakEnd = LEAD_IN + WORDS.length * p.wordMs;
      const total = speakEnd + p.holdMs + p.clearMs;
      if (playingRef.current) c.t = (c.t + dt) % total;

      let target = 0;
      if (playingRef.current && c.t >= LEAD_IN && c.t < speakEnd) {
        const w = (c.t - LEAD_IN) / p.wordMs;
        const i = Math.floor(w);
        const frac = w - i;
        const syllable = Math.pow(Math.sin(Math.PI * frac), 0.7);
        const wobble = 1 - p.jitter * (0.5 + 0.5 * Math.sin(i * 12.9898 + now / 170));
        target = p.voiceLevel * (0.35 + 0.65 * syllable) * wobble;
      }
      level.current += (target - level.current) * 0.35;

      // React state changes only when a word lands or the transcript clears.
      setWords(Math.max(0, Math.min(WORDS.length, Math.ceil((c.t - LEAD_IN) / p.wordMs))));
      setClearing(c.t > speakEnd + p.holdMs);
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${c.t / total})`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const restart = useCallback(() => { clock.current.t = 0; setPlaying(true); }, []);
  const getLevel = useCallback(() => level.current, []);
  return { words, clearing, playing, setPlaying, restart, getLevel, progressRef };
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7l10 10M17 7 7 17" />
    </svg>
  );
}

function VoiceScreen({ visibleWords, clearing, d, mic, onClose }) {
  return (
    <div
      className="voice-screen"
      style={{ height: d.screenHeight, background: d.screenColor }}
    >
      <p
        className="transcript"
        data-clearing={clearing || undefined}
        style={{ fontSize: d.textSize, bottom: d.textY }}
        aria-live="polite"
      >
        {WORDS.slice(0, visibleWords).map((word, i) => (
          <span key={i} className="word">{word} </span>
        ))}
      </p>

      <div className="controls">
        <button type="button" className="agent-pill">
          Agent (auto)
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 5 6 7.5 8.5 5" /></svg>
        </button>
        <div className="actions">
          <button
            type="button"
            className="icon-button"
            aria-label={mic.state === 'live' ? 'Stop microphone' : 'Use microphone'}
            aria-pressed={mic.state === 'live'}
            onClick={mic.state === 'live' ? mic.stop : mic.start}
          >
            <MicIcon />
          </button>
          <button type="button" className="icon-button" aria-label="Restart" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const b = useDialKit('Voice beam', BEAM, { id: 'voice-beam' });
  const d = useDialKit('Demo', DEMO, { id: 'voice-demo', defaultCollapsed: true });
  const loop = useSpeechLoop(d);
  const mic = useMicrophone();

  return (
    <main className="stage" style={{ background: d.pageColor }}>
      <div
        className="device"
        style={{ width: 390 * d.previewScale, height: d.screenHeight * d.previewScale }}
      >
        <div className="device-scaler" style={{ transform: `scale(${d.previewScale})` }}>
          <VoiceBeam
            level={loop.getLevel}
            stream={mic.state === 'live' ? mic.stream : null}
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
            <VoiceScreen
              visibleWords={loop.words}
              clearing={loop.clearing}
              d={d}
              mic={mic}
              onClose={loop.restart}
            />
          </VoiceBeam>
        </div>
      </div>

      <div className="progress" aria-hidden="true">
        <span ref={loop.progressRef} />
      </div>
      <button type="button" className="pause" onClick={() => loop.setPlaying(!loop.playing)}>
        {loop.playing ? 'Pause' : 'Play'}
      </button>

      <DialRoot position="top-right" productionEnabled theme="light" />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
