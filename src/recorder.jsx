import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { VoiceBeam } from 'voice-glow';
import { DialRoot, useDialKit } from 'dialkit';
import 'dialkit/styles.css';
import './voice.css';
import iphoneFrameUrl from '../iphone_asset/iPhone - Silver.png';

/* ─────────────────────────────────────────────────────────
 * VOICE JOURNAL RECORDER — simulated take
 *
 *    0ms   record pressed, transcript empty, beam listens
 *  +delay  words arrive one by one (startDelayMs, then wordMs each); level
 *          pulses per syllable while "speaking"
 *          overflow rule decides how old words leave:
 *            fade-scroll    lines scroll up under a top fade
 *            rolling-window only the last N words stay
 *            page-clear     every N words start a fresh page
 *  +hold   take finished, voice falls silent
 *  +clear  transcript fades out; loops when `loop` is on
 *
 *  DYNAMIC mode — the script carries [Question | Answer] marks:
 *    mark    speaker trails off (pauseMs); a question card rises above the text
 *    tap     question drops into the transcript, the answer is spoken, then
 *            the script carries on where it left off
 *    ignore  speaker keeps talking; the card fades after lingerMs
 *
 *  STOP    bottom controls leave, staggered (exit.*); transcript fades (fadeOutMs)
 *  +gap    after the slower of the two: label shimmers, beam sweeps (durationMs)
 *  done    saved; record button returns
 * ───────────────────────────────────────────────────────── */

/* Exit choreography order: which bottom control leaves first. */
const EXIT_ORDERS = [
  { value: 'from-record', label: 'Outward from record' },
  { value: 'into-record', label: 'Record leaves last' },
  { value: 'together', label: 'All together' },
];
const EXIT_CURVES = {
  anticipate: 'cubic-bezier(0.36, 0, 0.66, -0.56)',
  'ease-in': 'cubic-bezier(0.55, 0, 1, 0.45)',
  'ease-in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
  'ease-out': 'cubic-bezier(0.22, 1, 0.36, 1)',
  linear: 'linear',
};
/* Pill, restart, pause, record — the controls on screen when stop is pressed. */
const EXIT_COUNT = 4;

const FREEFORM_TEXT =
  'Yeah so today felt slower in a good way. I finally took the long walk by the river and noticed how quiet my head got later. I want to remember that feeling, and protect one free hour every morning this week.';

/* Written for someone who stalls without a nudge: short, flat statements that
   open up once a question lands. [Question | Answer] marks where Dynamic mode
   offers a prompt and what the speaker says if it's tapped. */
const DYNAMIC_TEXT =
  "Okay. So today was… a lot, I guess. Work was busy, the usual. I had my one-on-one with Priya and it went better than I thought it would. [What made it go better than you expected? | Honestly, I think I just said what I actually thought for once. She asked about the launch and I didn't soften it, and she thanked me for it.] Anyway, after that it was mostly emails and a couple of meetings that probably could have been messages. I ate lunch at my desk again. I don't really know what else to say about it. It was just a normal day, I think. [Was there a small moment today you'd want to remember? | Walking home, maybe. The light was hitting the buildings and for a minute I wasn't thinking about work at all.] Oh, and I skipped the gym again, which isn't great. I keep saying I'll go in the morning and then I just don't. Then I watched something on my laptop and suddenly it was eleven. [What got in the way of the gym today? | I was tired, and kind of embarrassed about how long it's been. Maybe tomorrow I just go for twenty minutes and call it a win.] Yeah. I think that's it for today. Tomorrow is another one, I guess.";

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
    borderRadius: [38, 0, 120, 1],
    scale: [3, 0.1, 5, 0.05],
    glowSize: [3, 0, 5, 0.01],
    reach: [0.85, 0, 5, 0.01],
    spread: [0.8, 0, 3, 0.01],
    flow: [48, -200, 200, 1],
    bend: [3, 0, 150, 1],
    rangeWidth: [0.59, 0.1, 4, 0.01],
    softness: [3, 0.2, 4, 0.01],
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
    brightness: [3, 0, 4, 0.01],
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
  showTimer: false,
  deviceFrame: true,
  previewScale: [0.7, 0.4, 1.2, 0.01],
  screenHeight: [780, 500, 900, 1],
  screenColor: '#fafafa',
  pageColor: '#f5f5f5',
  simulation: {
    _collapsed: true,
    loop: true,
    voiceLevel: [1, 0, 1, 0.01],
    jitter: [0.7, 0, 1, 0.01],
  },
};

/* The record → recording reveal: pause and restart only exist during a take. */
const CONTROLS = {
  reveal: {
    durationMs: [460, 0, 1500, 10],
    staggerMs: [70, 0, 400, 5],
    offsetX: [28, -120, 120, 1],
    offsetY: [0, -60, 60, 1],
    fromScale: [0.6, 0, 1, 0.01],
    fromBlur: [6, 0, 24, 0.5],
    overshoot: [1.45, 1, 2.4, 0.01],
  },
  buttons: {
    size: [46, 32, 72, 1],
    recordSize: [46, 32, 80, 1],
    gap: [12, 0, 40, 1],
    glass: [0.42, 0, 1, 0.01],
    /* Distance from the screen's bottom edge; lower = further down. */
    bottomInset: [44, 0, 140, 1],
    /* Nudge the pill or the button cluster on its own; positive = down. */
    pillShiftY: [12, -40, 40, 1],
    buttonsShiftY: [12, -40, 40, 1],
  },
  record: {
    buttonColor: '#1c1c1e',
    squareColor: '#9fe9f8',
    dotSize: [22, 6, 36, 0.5],
    squareSize: [11, 4, 28, 0.5],
    squareRadius: [2.5, 0, 14, 0.5],
    dotColor: '#9fe9f8',
    morphMs: [320, 0, 1200, 10],
  },
  /* Stop → bottom controls leave (and the transcript fades) → processing → saved. */
  exit: {
    order: { type: 'select', options: EXIT_ORDERS, default: 'from-record' },
    curve: { type: 'select', options: Object.keys(EXIT_CURVES), default: 'anticipate' },
    durationMs: [320, 0, 1500, 10],
    staggerMs: [45, 0, 400, 5],
    toScale: [0.8, 0, 1.2, 0.01],
    offsetY: [14, -60, 60, 1],
    blur: [4, 0, 20, 0.5],
  },
  processing: {
    fadeOutMs: [500, 0, 2000, 10],
    gapMs: [0, 0, 1500, 10],
    durationMs: [4000, 300, 8000, 50],
    label: 'Processing your entry',
    textSize: [17, 11, 28, 0.5],
    textColor: '#8a9aa0',
    shimmerColor: '#7dbec0',
    shimmerMs: [1600, 300, 5000, 50],
    /* VoiceBeam's own processing sweep: the glow gathers into one beam that
       travels left ↔ right along the bottom edge. With scale 3 the library's
       travel unit is ~500px, so 0.4 runs corner to corner on a 390px screen. */
    beam: {
      passSeconds: [1.05, 0.2, 4, 0.05],
      level: [1, 0, 1, 0.01],
      easeSeconds: [0.6, 0, 2, 0.05],
      travel: [0.4, 0, 2, 0.01],
      curve: [2.1, 1, 6, 0.05],
      cornerFollow: [0.4, 0, 1, 0.01],
    },
  },
};

const TRANSCRIPT = {
  text: { type: 'text', default: FREEFORM_TEXT, placeholder: 'What the recorder hears… [Question | Answer] adds a prompt' },
  timing: {
    startDelayMs: [700, 0, 3000, 10],
    wordMs: [200, 60, 800, 10],
    holdMs: [1900, 0, 6000, 50],
    clearMs: [600, 100, 2000, 50],
  },
  overflow: {
    mode: { type: 'select', options: ['fade-scroll', 'rolling-window', 'page-clear'], default: 'fade-scroll' },
    maxLines: [4, 1, 10, 1],
    fadeEdge: [1, 0, 1, 0.01],
    scrollEaseMs: [860, 0, 1500, 10],
    rollingWords: [49, 4, 80, 1],
    pageWords: [66, 4, 80, 1],
    ageFade: [0.11, 0, 0.2, 0.005],
    minOpacity: [1, 0, 1, 0.01],
  },
  words: {
    wordInMs: [620, 80, 2000, 10],
    wordBlur: [16.5, 0, 24, 0.5],
    newColor: '#7dbec0',
    textColor: '#a1acb0',
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

/* Dynamic mode: questions offered at the script's [Question | Answer] marks. */
const PROMPTS = {
  /* The speaker trails off at a mark; the card appears in this silence. */
  pauseMs: [1400, 0, 5000, 50],
  /* An untouched card fades after this, while the speaker carries on. */
  lingerMs: [6000, 1000, 15000, 100],
  /* Tap → the question drops into the transcript → first answer word. */
  answerDelayMs: [700, 0, 3000, 50],
  card: {
    hint: 'Tap to answer',
    width: [300, 200, 360, 1],
    gap: [28, 0, 240, 1],
    radius: [22, 0, 40, 1],
    glass: [0.72, 0, 1, 0.01],
    textSize: [17, 12, 26, 0.5],
    textColor: '#2a3438',
    accent: '#5fb3b8',
    showLinger: true,
  },
  motion: {
    inMs: [620, 0, 2000, 10],
    outMs: [520, 0, 2000, 10],
    offsetY: [12, -40, 40, 1],
    blur: [8, 0, 24, 0.5],
  },
  /* How an answered question reads inside the transcript. */
  question: {
    color: '#7dbec0',
    scale: [0.72, 0.5, 1.2, 0.01],
  },
};
/* Freeform scripts have no marks, so only the timing fields are ever read. */
const NO_PROMPTS = { pauseMs: 0, lingerMs: 0, answerDelayMs: 0 };

/* Each page is one variant; DialKit gets a stable config object per variant. */
const VARIANTS = {
  freeform: { modeLabel: 'Freeform', text: FREEFORM_TEXT, prompts: false },
  dynamic: { modeLabel: 'Dynamic', text: DYNAMIC_TEXT, prompts: true },
};
for (const v of Object.values(VARIANTS)) {
  v.screen = { ...SCREEN, modeLabel: v.modeLabel };
  v.transcript = { ...TRANSCRIPT, text: { ...TRANSCRIPT.text, default: v.text } };
}

function splitWords(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

/* "words [Question | Answer] words" → word and prompt tokens. */
function parseScript(text) {
  const tokens = [];
  for (const m of text.matchAll(/\[([^\]|]*)(?:\|([^\]]*))?\]|[^\s[]+/g)) {
    if (m[0][0] !== '[') tokens.push({ kind: 'word', text: m[0] });
    else if (m[1].trim()) {
      tokens.push({ kind: 'prompt', id: tokens.length, question: m[1].trim(), answer: (m[2] || '').trim() });
    }
  }
  return tokens;
}

/* Words and answered questions reach the transcript; prompts and pauses are silence. */
const spoken = (tok) => tok.kind === 'word' || tok.kind === 'question';

/* The simulated take: a clock that only runs while recording, a level
   getter for VoiceBeam, and the handful of values React renders.
   status: idle → recording ⇄ paused → processing → stopped */
function useRecorder(s, t, ctl, pr) {
  const [status, setStatus] = useState('idle');
  const [items, setItems] = useState([]);
  const [visible, setVisible] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [thinking, setThinking] = useState(false);
  /* The card on screen: { id, question, phase: 'offered' | 'faded' | 'taken' }. */
  const [prompt, setPrompt] = useState(null);
  const level = useRef(0);
  const clock = useRef({ t: 0, rec: 0, proc: 0, last: 0 });
  const statusRef = useRef(status);
  statusRef.current = status;
  const params = useRef({ s, t, ctl, pr });
  params.current = { s, t, ctl, pr };
  /* The take as it unfolds: the parsed script with any answers spliced in.
     Each token's `start` is laid out every frame, so timing sliders apply live;
     `dur` overrides a token's length when a tap cuts it short. */
  const take = useRef({ text: null, seq: [], playhead: -1, offered: null, seen: new Set() });

  const resetTake = useCallback((text) => {
    const seq = parseScript(text);
    take.current = { text, seq, playhead: -1, offered: null, seen: new Set() };
    setItems(seq.filter(spoken));
    // A card still up from the last take fades rather than vanishing mid-read.
    setPrompt((p) => p && { ...p, phase: 'faded' });
  }, []);

  const beginProcessing = useCallback(() => {
    clock.current.proc = 0;
    setStatus('processing');
  }, []);

  useEffect(() => {
    let raf;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const c = clock.current;
      const dt = c.last ? Math.min(64, now - c.last) : 0;
      c.last = now;
      const { s: sp, t: tp, ctl: cp, pr: pv } = params.current;
      if (take.current.text !== tp.text) resetTake(tp.text);
      const { startDelayMs, wordMs, holdMs, clearMs } = tp.timing;
      const lengthOf = (tok) =>
        tok.dur ?? (tok.kind === 'word' ? wordMs : tok.kind === 'question' ? pv.answerDelayMs : pv.pauseMs);

      let speakEnd = startDelayMs;
      for (const tok of take.current.seq) {
        tok.start = speakEnd;
        speakEnd += lengthOf(tok);
      }
      const total = speakEnd + holdMs + clearMs;
      const recording = statusRef.current === 'recording';
      const processing = statusRef.current === 'processing';

      if (recording) {
        c.t += dt;
        c.rec += dt;
        if (c.t >= total) {
          if (sp.simulation.loop) {
            c.t = 0;
            c.rec = 0;
            resetTake(tp.text);
          } else {
            c.t = speakEnd + holdMs;
            c.proc = 0;
            statusRef.current = 'processing';
            setStatus('processing');
          }
        }
      }

      const tk = take.current;
      let playhead = -1;
      let shown = 0;
      for (let i = 0; i < tk.seq.length && tk.seq[i].start <= c.t; i++) {
        playhead = i;
        if (spoken(tk.seq[i])) shown++;
      }
      tk.playhead = playhead;

      // Reaching a mark offers its question once; an untouched card fades after lingerMs.
      const cur = tk.seq[playhead];
      if (recording && cur?.kind === 'prompt' && !tk.seen.has(cur.id)) {
        tk.seen.add(cur.id);
        tk.offered = { id: cur.id, at: c.t };
        setPrompt({ id: cur.id, question: cur.question, phase: 'offered' });
      }
      if (tk.offered && c.t - tk.offered.at > pv.lingerMs) {
        tk.offered = null;
        setPrompt((p) => p && { ...p, phase: 'faded' });
      }

      const pp = cp.processing;
      // Processing waits for the slower of the transcript fade and the controls' exit.
      const ex = cp.exit;
      const exitTotal = ex.durationMs + (ex.order === 'together' ? 0 : ex.staggerMs * (EXIT_COUNT - 1));
      const thinkStart = Math.max(pp.fadeOutMs, exitTotal) + pp.gapMs;
      let isThinking = false;
      if (processing) {
        c.proc += dt;
        isThinking = c.proc >= thinkStart;
        if (c.proc >= thinkStart + pp.durationMs) {
          isThinking = false;
          setStatus('stopped');
        }
      }

      let target = 0;
      if (recording && cur?.kind === 'word') {
        const phase = Math.min(1, (c.t - cur.start) / lengthOf(cur));
        const syllable = Math.pow(Math.sin(Math.PI * phase), 0.7);
        const wobble = 1 - sp.simulation.jitter * (0.5 + 0.5 * Math.sin(playhead * 12.9898 + now / 170));
        target = sp.simulation.voiceLevel * (0.35 + 0.65 * syllable) * wobble;
      }
      level.current += (target - level.current) * 0.35;

      // State only changes when a word lands, the take clears, a phase flips, or a second passes.
      setVisible(shown);
      setClearing(c.t > speakEnd + holdMs);
      setSeconds(Math.floor(c.rec / 1000));
      setThinking(isThinking);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [resetTake]);

  /* Record and restart both begin a fresh take. */
  const record = useCallback(() => {
    clock.current.t = 0;
    clock.current.rec = 0;
    resetTake(params.current.t.text);
    setStatus('recording');
  }, [resetTake]);
  const togglePause = useCallback(
    () => setStatus((st) => (st === 'recording' ? 'paused' : st === 'paused' ? 'recording' : st)),
    [],
  );
  /* Tapping the card: whatever is being said ends now, the question drops into
     the transcript, the answer is spoken, a breath, then the script resumes. */
  const answer = useCallback((id) => {
    const tk = take.current;
    if (tk.offered?.id !== id) return;
    const mark = tk.seq.find((tok) => tok.kind === 'prompt' && tok.id === id);
    const cur = tk.seq[tk.playhead];
    if (cur) cur.dur = Math.max(0, clock.current.t - cur.start);
    tk.seq.splice(
      tk.playhead + 1,
      0,
      { kind: 'question', text: mark.question },
      ...splitWords(mark.answer).map((text) => ({ kind: 'word', text })),
      { kind: 'pause' },
    );
    tk.offered = null;
    setItems(tk.seq.filter(spoken));
    setPrompt((p) => p && { ...p, phase: 'taken' });
  }, []);
  const getLevel = useCallback(() => level.current, []);
  const live = status === 'recording' || status === 'paused';
  // Once stopped, the take's text stays hidden until the next recording.
  const hideText = clearing || status === 'processing' || status === 'stopped';

  return {
    status, live, items, visible, hideText, thinking, seconds, prompt,
    record, togglePause, stop: beginProcessing, answer, getLevel,
  };
}

/* ── Icons ─────────────────────────────────────────────── */
const icon = (d, extra) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">{d}{extra}</svg>
);
const BackIcon = () => icon(<path d="M15 5l-7 7 7 7" />);
const PauseIcon = () => icon(<><path d="M9 6v12" /><path d="M15 6v12" /></>);
const PlayIcon = () => icon(<path className="fill" d="M8 5.5v13l10.5-6.5z" />);
const RestartIcon = () => icon(<><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" /><path d="M4.5 4.5v4h4" /></>);
const SparkIcon = () => icon(<path className="fill" d="M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9z" />);

/* Only interactive while a take is live. `order` staggers outward from the record
   button; `dir` is 1 when the record button sits after this one, −1 when before,
   so each button grows out of it. */
function Reveal({ shown, order, dir, children }) {
  return (
    <span
      className="reveal"
      data-exit
      data-shown={shown || undefined}
      inert={!shown}
      style={{ '--i': order, '--dir': dir }}
    >
      {children}
    </span>
  );
}

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
    <button type="button" className="mode-pill" data-exit>
      {label}
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 5 6 7.5 8.5 5" /></svg>
    </button>
  );
}

function PauseButton({ rec, size, withLabel, order = 0, dir = 1 }) {
  const paused = rec.status === 'paused';
  return (
    <Reveal shown={rec.live} order={order} dir={dir}>
      <button
        type="button"
        className={`ctl ${size || ''} ${withLabel ? 'labeled' : ''}`}
        aria-label={paused ? 'Resume recording' : 'Pause recording'}
        onClick={rec.togglePause}
      >
        {paused ? <PlayIcon /> : <PauseIcon />}
        {withLabel && <span>{paused ? 'Resume' : 'Pause'}</span>}
      </button>
    </Reveal>
  );
}

function RestartButton({ rec, size, withLabel, order = 1, dir = 1 }) {
  return (
    <Reveal shown={rec.live} order={order} dir={dir}>
      <button
        type="button"
        className={`ctl ${size || ''} ${withLabel ? 'labeled' : ''}`}
        aria-label="Restart recording"
        onClick={rec.record}
      >
        <RestartIcon />
        {withLabel && <span>Restart</span>}
      </button>
    </Reveal>
  );
}

/* Record before and after a take; stop during one. The glyph morphs dot ↔ square. */
function RecordButton({ rec, size, withLabel }) {
  return (
    <button
      type="button"
      className={`ctl stop ${size || ''} ${withLabel ? 'labeled' : ''}`}
      data-exit
      data-record
      aria-label={rec.live ? 'Stop and save entry' : 'Start recording'}
      disabled={rec.status === 'processing'}
      onClick={rec.live ? rec.stop : rec.record}
    >
      <span className="rec-glyph" data-mode={rec.live ? 'stop' : 'record'} aria-hidden="true" />
      {withLabel && <span>{rec.live ? 'Stop' : 'Record'}</span>}
    </button>
  );
}

function Timer({ rec }) {
  const mm = String(Math.floor(rec.seconds / 60)).padStart(2, '0');
  const ss = String(rec.seconds % 60).padStart(2, '0');
  return (
    <div className="timer" data-status={rec.status}>
      <span className="dot" aria-hidden="true" />
      <span>{rec.status === 'stopped' ? 'Saved' : rec.status === 'processing' ? 'Processing' : `${mm}:${ss}`}</span>
    </div>
  );
}

/* Shown after the transcript fades out on stop; the label shimmers while the beam breathes. */
function Processing({ rec, p, bottom }) {
  return (
    <div
      className="processing"
      data-shown={rec.thinking || undefined}
      role="status"
      style={{
        bottom,
        fontSize: p.textSize,
        '--proc-color': p.textColor,
        '--proc-shimmer': p.shimmerColor,
        '--proc-shimmer-ms': `${p.shimmerMs}ms`,
      }}
    >
      {rec.thinking ? p.label : ''}
    </div>
  );
}

/* Dynamic mode's question card. Tapping answers it; left alone it fades after
   lingerMs, with a thin bar counting down the time it has left. */
function PromptCard({ rec, p, bottom }) {
  const card = rec.prompt;
  if (!card) return null;
  const phase = rec.live ? card.phase : 'faded';
  return (
    <button
      type="button"
      className="prompt-card"
      data-phase={phase}
      data-paused={rec.status === 'paused' || undefined}
      inert={phase !== 'offered'}
      aria-label={`Answer: ${card.question}`}
      onClick={() => rec.answer(card.id)}
      style={{
        bottom,
        '--prompt-width': `${p.card.width}px`,
        '--prompt-radius': `${p.card.radius}px`,
        '--prompt-glass': p.card.glass,
        '--prompt-size': `${p.card.textSize}px`,
        '--prompt-color': p.card.textColor,
        '--prompt-accent': p.card.accent,
        '--prompt-in': `${p.motion.inMs}ms`,
        '--prompt-out': `${p.motion.outMs}ms`,
        '--prompt-y': `${p.motion.offsetY}px`,
        '--prompt-blur': `${p.motion.blur}px`,
        '--prompt-linger': `${p.lingerMs}ms`,
      }}
    >
      <span className="prompt-hint"><SparkIcon />{p.card.hint}</span>
      <span className="prompt-question">{card.question}</span>
      {p.card.showLinger && <span className="prompt-linger" aria-hidden="true" />}
    </button>
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
              <RestartButton rec={rec} order={0} />
              <RecordButton rec={rec} size="xl" />
              <PauseButton rec={rec} order={0} dir={-1} />
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
              <PauseButton rec={rec} withLabel order={1} />
              <RecordButton rec={rec} withLabel />
              <RestartButton rec={rec} withLabel order={0} dir={-1} />
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
            <PauseButton rec={rec} order={1} />
            <RestartButton rec={rec} order={0} />
            <RecordButton rec={rec} size="lg" />
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
            <PauseButton rec={rec} order={0} />
            <RecordButton rec={rec} size="wide" withLabel />
            <RestartButton rec={rec} order={0} dir={-1} />
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
              <RestartButton rec={rec} order={1} />
              <PauseButton rec={rec} order={0} />
              <RecordButton rec={rec} />
            </div>
          </div>
        </>
      );
  }
}

/* ── Transcript ────────────────────────────────────────── */
function Transcript({ items, rec, t, rightInset, questionStyle }) {
  const { overflow: o, words: w, type: ty } = t;
  const n = Math.min(rec.visible, items.length);
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
      data-clearing={rec.hideText || undefined}
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
        ...questionStyle,
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
        {items.slice(start, n).map((tok, k) => {
          const i = start + k;
          const age = n - 1 - i;
          return (
            <span
              key={i}
              className={tok.kind === 'question' ? 'word question' : 'word'}
              style={{ opacity: Math.max(o.minOpacity, 1 - age * o.ageFade) }}
            >
              {tok.text}{' '}
            </span>
          );
        })}
      </p>
    </div>
  );
}

export function VoiceRecorder({ variant = 'freeform' }) {
  const v = VARIANTS[variant];
  const s = useDialKit('Screen', v.screen, { id: 'voice-screen' });
  const c = useDialKit('Controls', CONTROLS, { id: 'voice-controls' });
  const t = useDialKit('Transcript', v.transcript, { id: 'voice-transcript' });
  // `variant` is fixed for a page's lifetime, so this hook's call order never changes.
  const pr = v.prompts ? useDialKit('Prompts', PROMPTS, { id: 'voice-prompts' }) : NO_PROMPTS;
  const b = useDialKit('Voice beam', BEAM, { id: 'voice-beam', defaultCollapsed: true });
  const rec = useRecorder(s, t, c, pr);
  const framed = s.deviceFrame;
  const screenH = framed ? FRAMED_SCREEN_H : s.screenHeight;
  const deviceW = framed ? FRAME.w * FRAME_K : 390;
  const deviceH = framed ? FRAME.h * FRAME_K : screenH;
  const textBoxH = t.overflow.maxLines * t.type.lineHeight * t.type.textSize;

  const screenRef = useRef(null);
  /* Rank the bottom controls by distance from the record button so the exit
     stagger reads the same in every layout. Runs before paint, so the delays
     are in place when stop flips the screen into processing. */
  useLayoutEffect(() => {
    const root = screenRef.current;
    if (!root || !rec.live) return;
    const centre = (el) => {
      const r = el.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    };
    const record = root.querySelector('[data-record]');
    if (!record) return;
    const [rx, ry] = centre(record);
    const items = [...root.querySelectorAll('[data-exit]')].map((el) => {
      const [x, y] = centre(el);
      return { el, d: Math.hypot(x - rx, y - ry) };
    });
    items.sort((a, b) => (c.exit.order === 'into-record' ? b.d - a.d : a.d - b.d));
    items.forEach(({ el }, i) => el.style.setProperty('--exit-i', c.exit.order === 'together' ? 0 : i));
  }, [rec.live, s.layout, c.exit.order]);

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
            processing={rec.thinking}
            processingDuration={c.processing.beam.passSeconds}
            processingLevel={c.processing.beam.level}
            processingEase={c.processing.beam.easeSeconds}
            processingTravel={c.processing.beam.travel}
            processingCurve={c.processing.beam.curve}
            cornerFollow={c.processing.beam.cornerFollow}
            style={{
              '--voice-hue-base': `${b.color.hueBase}deg`,
              '--voice-stroke-opacity': String(b.color.strokeOpacity),
              '--voice-inner-opacity': String(b.color.innerOpacity),
              '--voice-bloom-opacity': String(b.color.bloomOpacity),
            }}
          >
            <section
              ref={screenRef}
              className="voice-screen"
              data-layout={s.layout}
              data-status={rec.status}
              aria-label="Voice journal recorder"
              style={{
                height: screenH,
                background: s.screenColor,
                '--reveal-ms': `${c.reveal.durationMs}ms`,
                '--reveal-stagger': `${c.reveal.staggerMs}ms`,
                '--reveal-x': `${c.reveal.offsetX}px`,
                '--reveal-y': `${c.reveal.offsetY}px`,
                '--reveal-scale': c.reveal.fromScale,
                '--reveal-blur': `${c.reveal.fromBlur}px`,
                '--reveal-ease': `cubic-bezier(0.34, ${c.reveal.overshoot}, 0.64, 1)`,
                '--ctl-size': `${c.buttons.size}px`,
                '--record-size': `${c.buttons.recordSize}px`,
                '--cluster-gap': `${c.buttons.gap}px`,
                '--bottom-inset': `${c.buttons.bottomInset}px`,
                '--pill-shift': `${c.buttons.pillShiftY}px`,
                '--buttons-shift': `${c.buttons.buttonsShiftY}px`,
                '--glass': c.buttons.glass,
                '--dot-size': `${c.record.dotSize}px`,
                '--square-size': `${c.record.squareSize}px`,
                '--square-radius': `${c.record.squareRadius}px`,
                '--dot-color': c.record.dotColor,
                '--button-color': c.record.buttonColor,
                '--square-color': c.record.squareColor,
                '--text-fade-ms': `${rec.status === 'processing' ? c.processing.fadeOutMs : 450}ms`,
                '--morph-ms': `${c.record.morphMs}ms`,
                '--exit-ms': `${c.exit.durationMs}ms`,
                '--exit-stagger': `${c.exit.staggerMs}ms`,
                '--exit-ease': EXIT_CURVES[c.exit.curve],
                '--exit-scale': c.exit.toScale,
                '--exit-y': `${c.exit.offsetY}px`,
                '--exit-blur': `${c.exit.blur}px`,
              }}
            >
              {/* The thumb rail sits at the right edge, so the text keeps clear of it. */}
              <Transcript
                items={rec.items}
                rec={rec}
                t={t}
                rightInset={s.layout === 'rail' ? 40 : 0}
                questionStyle={v.prompts && { '--question-color': pr.question.color, '--question-scale': pr.question.scale }}
              />
              {v.prompts && (
                <PromptCard key={rec.prompt?.id} rec={rec} p={pr} bottom={t.type.textY + textBoxH + pr.card.gap} />
              )}
              <Processing rec={rec} p={c.processing} bottom={t.type.textY} />
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
