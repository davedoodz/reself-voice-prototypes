import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { VoiceBeam } from 'voice-glow';
import { BEAM_BLUE, beamColors } from './brand.js';
import { ChevronLeft, ChevronRight, Info, X } from 'lucide-react';
import brainIcon from './icons/brain.png';
import heartIcon from './icons/heart.png';
import loopIcon from './icons/loop.png';
import nextIcon from './icons/arrow.png';
import targetIcon from './icons/target.png';
import recordIcon from './icons/circle.png';
import stopIcon from './icons/square.png';
import { DialRoot, useDialKit } from 'dialkit';
import 'dialkit/styles.css';
import './voice.css';
import './unwind-fonts.css';
import iphoneFrameUrl from '../iphone_asset/iPhone - Silver.png';
import sparkBigUrl from './assets/spark-big.png';
import sparkSmallUrl from './assets/spark-small.png';
import { StatusBar } from './status-bar.jsx';
import { Backdrop } from './backdrop.jsx';
import { HeaderWave } from './header-wave.jsx';

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
 *  GUIDED mode — a framework's prompts, one step at a time (no AI):
 *    step    prompt shows above; the user answers; the answer holds on screen
 *    Next    primary button turns into an arrow; the next prompt arrives and
 *            the transcript starts fresh; restart redoes only this answer
 *    last    primary button is a stop (Finish) → processing → saved
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
export const BEAM = {
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
    /* Overrides the variant's lobe and band colours with shades of this blue. */
    beamColor: BEAM_BLUE,
    brightness: [3, 0, 4, 0.01],
    saturation: [4, 0, 4, 0.01],
    hueRange: [0, 0, 180, 1],
    hueDuration: [2, 0.5, 30, 0.1],
    hueBase: [0, -180, 180, 1],
    strokeOpacity: [2, 0, 4, 0.05],
    innerOpacity: [2, 0, 4, 0.05],
    bloomOpacity: [2, 0, 4, 0.05],
  },
};

/* The DialKit 'Voice beam' panel → VoiceBeam props. Shared with the welcome screen. */
export function beamProps(b) {
  return {
    type: b.shape.type,
    sensitivity: b.response.sensitivity,
    threshold: b.response.threshold,
    attack: b.response.attack,
    release: b.response.release,
    breatheDuration: b.response.breatheDuration,
    colorVariant: b.color.colorVariant,
    ...beamColors(b.color.beamColor, b.color.brightness),
    theme: b.color.theme,
    borderRadius: b.shape.borderRadius,
    scale: b.shape.scale,
    glowSize: b.shape.glowSize,
    idle: b.response.idle,
    reach: b.shape.reach,
    spread: b.shape.spread,
    flow: b.shape.flow,
    bend: b.shape.bend,
    bandStrength: b.band.bandStrength,
    bandWidth: b.band.bandWidth,
    bandPosition: b.band.bandPosition,
    bandCurve: b.band.bandCurve,
    bandOffset: b.band.bandOffset,
    bandTail: b.band.bandTail,
    bandTailPosition: b.band.bandTailPosition,
    bandTailCurve: b.band.bandTailCurve,
    bandTailOverflow: b.band.bandTailOverflow,
    bandAberration: b.band.bandAberration,
    distortion: b.shape.distortion,
    distortionDetail: b.shape.distortionDetail,
    rangeWidth: b.shape.rangeWidth,
    softness: b.shape.softness,
    coreSize: b.core.coreSize,
    coreLight: b.core.coreLight,
    strokeScale: b.core.strokeScale,
    brightness: b.color.brightness,
    saturation: b.color.saturation,
    hueRange: b.color.hueRange,
    hueDuration: b.color.hueDuration,
    style: {
      '--voice-hue-base': `${b.color.hueBase}deg`,
      '--voice-stroke-opacity': String(b.color.strokeOpacity),
      '--voice-inner-opacity': String(b.color.innerOpacity),
      '--voice-bloom-opacity': String(b.color.bloomOpacity),
    },
  };
}

/* iphone_asset/iPhone - Silver.png: 874×1780, transparent screen cut-out at
   x 46–830, y 39–1741 (784×1702, ~113px corners). The frame is scaled so the
   cut-out is exactly the 390px screen. */
export const FRAME = { w: 874, h: 1780, x: 46, y: 39, screenW: 784, screenH: 1702, radius: 113 };
export const FRAME_K = 390 / FRAME.screenW;
export const FRAMED_SCREEN_H = FRAME.screenH * FRAME_K;
export const FRAMED_RADIUS = FRAME.radius * FRAME_K;
/* Clearance under the Dynamic Island for the top controls. */
export const FRAMED_SAFE_TOP = 34;

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
    pillShiftY: [-7, -40, 40, 1],
    buttonsShiftY: [-7, -40, 40, 1],
  },
  record: {
    buttonColor: '#292931',
    dotSize: [22, 6, 36, 0.5],
    squareSize: [16.5, 4, 28, 0.5],
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
    shimmerColor: '#61A8FD',
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
    newColor: '#61A8FD',
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

const select = (options, value) => ({ type: 'select', options, default: value });

/* ── Prompt card: countdown timer and star presets ─────────
 * Every timer runs on the card's lingerMs countdown and pauses with the take.
 *   bar     a thin line along one edge shrinks away (the original)
 *   ring    a small ring drains, in the corner or beside the hint
 *   border  the card's own outline drains around its edge
 *   wash    a faint accent tint behind the text recedes to one side
 *   dots    a row of dots goes out one by one, right to left
 * The star before the hint is blue-icons/blue-stars.png, split into two aligned
 * layers (src/assets/spark-big.png, spark-small.png) so each star moves alone:
 *   popIn   both stars pop in once as the card arrives (small one a beat later)
 *   twinkle the big star breathes while the small one blinks, out of phase
 *   glint   now and then the small star flicks round and flares; the big one nods
 *   spin    each star turns about its own centre, the small one faster
 *   float   both bob gently, the small one a little behind
 *   breathe the whole icon swells and settles
 * ─────────────────────────────────────────────────────── */
const TIMERS = [
  { value: 'bar', label: '1 · Bar' },
  { value: 'ring', label: '2 · Ring' },
  { value: 'border', label: '3 · Border' },
  { value: 'wash', label: '4 · Wash' },
  { value: 'dots', label: '5 · Dots' },
  { value: 'none', label: 'None' },
];
const STAR_MOTIONS = [
  { value: 'popIn', label: '1 · Pop in' },
  { value: 'twinkle', label: '2 · Twinkle' },
  { value: 'glint', label: '3 · Glint' },
  { value: 'spin', label: '4 · Spin' },
  { value: 'float', label: '5 · Float' },
  { value: 'breathe', label: '6 · Breathe' },
  { value: 'still', label: 'Still' },
];
const STAR_EASINGS = [
  { value: 'spring', label: 'Spring (overshoot)' },
  { value: 'out', label: 'Ease out' },
  { value: 'smooth', label: 'Ease in-out' },
  { value: 'linear', label: 'Linear' },
];
const DIRECTIONS = [
  { value: 'cw', label: 'Clockwise' },
  { value: 'ccw', label: 'Counter-clockwise' },
];

const CARD_TIMER = {
  style: select(TIMERS, 'ring'),
  pace: select(
    [
      { value: 'linear', label: 'Steady' },
      { value: 'ease-in', label: 'Slow, then fast' },
      { value: 'ease-out', label: 'Fast, then slow' },
    ],
    'linear',
  ),
  bar: {
    height: [2, 1, 8, 0.5],
    opacity: [0.4, 0.05, 1, 0.01],
    edge: select(['bottom', 'top'], 'bottom'),
    shrinkTo: select(['center', 'left', 'right'], 'center'),
    inset: [0, 0, 60, 1],
  },
  ring: {
    size: [23, 10, 40, 1],
    stroke: [3, 0.5, 6, 0.5],
    opacity: [0.45, 0.05, 1, 0.01],
    track: [0.1, 0, 1, 0.01],
    place: select(['corner', 'hint'], 'corner'),
  },
  border: {
    stroke: [1.5, 0.5, 4, 0.5],
    opacity: [0.6, 0.05, 1, 0.01],
    direction: select(DIRECTIONS, 'cw'),
  },
  wash: {
    opacity: [0.14, 0.02, 0.6, 0.01],
    recedeTo: select(['left', 'right', 'bottom'], 'left'),
  },
  dots: {
    count: [5, 2, 10, 1],
    size: [5, 2, 12, 0.5],
    gap: [6, 2, 16, 1],
    opacity: [0.6, 0.05, 1, 0.01],
    fadeMs: [300, 0, 1500, 10],
  },
};

const STAR = {
  motion: select(STAR_MOTIONS, 'popIn'),
  size: [20.5, 10, 32, 0.5],
  popIn: {
    durationMs: [700, 100, 3000, 10],
    delayMs: [150, 0, 3000, 10],
    fromScale: [0, 0, 1, 0.01],
    turnDeg: [-45, -180, 180, 1],
    /* The small star arrives this long after the big one. */
    smallLagMs: [180, 0, 1500, 10],
    easing: select(STAR_EASINGS, 'spring'),
  },
  twinkle: {
    cycleMs: [2400, 400, 8000, 10],
    bigScale: [1.08, 1, 1.5, 0.01],
    /* The small star dips to this size and opacity at the bottom of its blink. */
    smallScale: [0.45, 0, 1, 0.01],
    smallOpacity: [0.3, 0, 1, 0.01],
    /* 0 = both together, 0.5 = small blinks while big is at rest. */
    phase: [0.5, 0, 1, 0.01],
  },
  glint: {
    glintMs: [650, 100, 3000, 10],
    restMs: [2200, 0, 8000, 50],
    smallScale: [1.6, 1, 3, 0.01],
    smallTurnDeg: [90, 0, 360, 5],
    bigScale: [1.06, 1, 1.3, 0.01],
    easing: select(STAR_EASINGS, 'spring'),
  },
  spin: {
    bigSecPerTurn: [8, 1, 30, 0.1],
    smallSecPerTurn: [3, 0.5, 20, 0.1],
    direction: select(DIRECTIONS, 'cw'),
    smallCounter: true,
  },
  float: {
    cycleMs: [2800, 400, 8000, 10],
    bigLiftPx: [1.5, 0, 6, 0.1],
    smallLiftPx: [2.5, 0, 8, 0.1],
    /* How far behind the big star the small one moves, as a share of the cycle. */
    lag: [0.25, 0, 1, 0.01],
  },
  breathe: {
    cycleMs: [3000, 400, 8000, 10],
    scale: [1.12, 1, 1.5, 0.01],
  },
};

/* Dynamic mode: questions offered at the script's [Question | Answer] marks. */
export const PROMPTS = {
  /* The speaker trails off at a mark; the card appears in this silence. */
  pauseMs: [1400, 0, 5000, 50],
  /* An untouched card fades after this, while the speaker carries on. */
  lingerMs: [6000, 1000, 15000, 100],
  /* Tap → the question drops into the transcript → first answer word. */
  answerDelayMs: [700, 0, 3000, 50],
  card: {
    hint: 'Tap to answer',
    width: [328, 200, 360, 1],
    /* Height above the transcript; raise it to lift the card up the screen. */
    gap: [290, -200, 560, 1],
    hintSize: [12.5, 9, 22, 0.5],
    radius: [22, 0, 40, 1],
    glass: [0.06, 0, 1, 0.01],
    textSize: [18, 12, 26, 0.5],
    textColor: '#2a3438',
    accent: '#61A8FD',
  },
  /* Swipe left or right to ignore the card. */
  swipe: {
    enabled: true,
    /* How far to drag before letting go ignores it. */
    distance: [90, 30, 200, 1],
    /* A quick flick ignores it even if short (px per ms). */
    flickSpeed: [0.6, 0.1, 2, 0.05],
    /* Turn at full distance, and how much it fades while dragged. */
    tilt: [8, 0, 30, 0.5],
    fade: [0.4, 0, 1, 0.01],
    flyDistance: [420, 150, 800, 10],
    flyMs: [320, 80, 1000, 10],
  },
  /* The countdown before an untouched card fades, and the star's motion. */
  timer: CARD_TIMER,
  star: STAR,
  motion: {
    inMs: [620, 0, 2000, 10],
    outMs: [520, 0, 2000, 10],
    offsetY: [12, -40, 40, 1],
    blur: [8, 0, 24, 0.5],
  },
  /* How an answered question reads inside the transcript. */
  question: {
    color: '#61A8FD',
    scale: [0.66, 0.5, 1.2, 0.01],
  },
};
/* Freeform scripts have no marks, so only the timing fields are ever read. */
const NO_PROMPTS = { pauseMs: 0, lingerMs: 0, answerDelayMs: 0 };

/* Guided mode: a proven framework, one prompt per step, no AI. The user answers
   each prompt out loud, taps Next, and the last step's stop saves the entry.
   `answer` is only the simulated speaker's reply for this prototype. */
export const FRAMEWORKS = [
  {
    id: 'gross',
    /* Named after the person behind it: the model came from someone. */
    title: 'Gross’s Emotion Regulation Model',
    creator: 'James J. Gross',
    year: '1998',
    icon: heartIcon,
    summary: 'Untangle a strong feeling by slowing down what happened.',
    about:
      'Stanford psychologist James Gross showed that an emotion unfolds in stages: a situation, what you notice, how you read it, and how you respond. You can step in at any of them. Walking through the situation, your response, its cause, and another perspective helps you understand a feeling instead of pushing it away.',
    steps: [
      {
        label: 'Situation',
        question: 'What happened?',
        hint: 'Describe the situation: where you were, who was there, what was said.',
        answer:
          "My manager moved my presentation to next week in front of the whole team, without asking me first. I'd been preparing it for days and I just nodded and said okay.",
      },
      {
        label: 'Response',
        question: 'How were you feeling in that moment?',
        hint: 'Name the emotions, what you noticed in your body, and what you did next.',
        answer:
          'Embarrassed, mostly. My face went hot and my chest felt tight. Then I got kind of angry, and I spent the rest of the afternoon replaying it instead of working.',
      },
      {
        label: 'Cause',
        question: 'Why might it have affected you that way?',
        hint: 'Look for the belief, need, or pressure underneath the reaction.',
        answer:
          "I think I took it as a sign she doesn't trust my work. I've been worried about that since the reorg, so it hit something that was already sore.",
      },
      {
        label: 'Perspective',
        question: 'Is there another way to see what happened?',
        hint: "Consider a different explanation, or what you'd tell a friend in your place.",
        answer:
          'Maybe it had nothing to do with me. She mentioned the client call moved, so she was probably just juggling the schedule. I could ask her tomorrow instead of guessing.',
      },
    ],
  },
  {
    id: 'abcde',
    title: 'Ellis’s ABCDE Model',
    creator: 'Albert Ellis',
    year: '1950s',
    icon: brainIcon,
    summary: 'Catch an upsetting thought and check whether it holds up.',
    about:
      'Albert Ellis, who founded Rational Emotive Behavior Therapy, noticed that events rarely upset us on their own. Our beliefs about them do. His ABC model, later extended with D (dispute) and E (effective belief), helps you spot the thought in the middle and trade it for one that fits the facts.',
    steps: [
      {
        label: 'Activating event',
        question: 'What happened just before you felt upset?',
        hint: 'Stick to the facts, as a camera would have seen it.',
        answer: "A friend didn't reply to my message all weekend, even though I could see she'd been online.",
      },
      {
        label: 'Belief',
        question: 'What went through your mind about it?',
        hint: 'The thought, rule, or story you told yourself.',
        answer: "That she's pulling away from me. That I probably said something wrong and she's too polite to tell me.",
      },
      {
        label: 'Consequence',
        question: 'How did that belief make you feel and act?',
        hint: 'Emotions, urges, and what you actually did.',
        answer: 'Anxious and a bit hurt. I kept checking my phone, and I almost sent a second message apologising for nothing.',
      },
      {
        label: 'Dispute',
        question: "What's the evidence for and against that belief?",
        hint: 'Question the thought the way a fair friend would.',
        answer:
          "Honestly, she's been busy with the move. She replied warmly last week. I don't have any real sign she's upset with me.",
      },
      {
        label: 'Effective belief',
        question: "What's a more balanced way to see it?",
        hint: 'A thought that fits the evidence and helps you act.',
        answer: "A slow reply is just a slow reply. If something is wrong, she'll tell me, and I can ask her when we talk.",
      },
    ],
  },
  {
    id: 'woop',
    title: 'Oettingen’s WOOP Method',
    creator: 'Gabriele Oettingen',
    year: '2014',
    icon: targetIcon,
    summary: 'Turn a wish into a plan by facing what gets in the way.',
    about:
      'NYU psychologist Gabriele Oettingen found that picturing success alone can drain the energy to pursue it. WOOP pairs the wish with your main inner obstacle and an if-then plan, a combination her research links to better follow-through on goals and habits.',
    steps: [
      {
        label: 'Wish',
        question: 'What do you want to work toward this week?',
        hint: 'Something challenging but possible.',
        answer: 'I want to get back into running. Three short runs before Sunday.',
      },
      {
        label: 'Outcome',
        question: 'What would be the best result? Picture it.',
        hint: 'Imagine it as vividly as you can.',
        answer: 'Feeling clear-headed in the mornings again. Sleeping better, and being proud I kept a promise to myself.',
      },
      {
        label: 'Obstacle',
        question: 'What in you is most likely to get in the way?',
        hint: 'A habit, feeling, or belief, not the weather.',
        answer: "When I wake up tired I talk myself out of it. I tell myself I'll go tonight, and tonight never happens.",
      },
      {
        label: 'Plan',
        question: 'If that obstacle shows up, what will you do?',
        hint: 'Say it as: if … then I will …',
        answer: "If I wake up and want to skip, then I'll put my shoes on and just walk to the corner. That's the whole deal.",
      },
    ],
  },
  {
    id: 'gibbs',
    title: 'Gibbs’ Reflective Cycle',
    creator: 'Graham Gibbs',
    year: '1988',
    icon: loopIcon,
    summary: 'Learn from an experience by walking all the way around it.',
    about:
      'Educator Graham Gibbs introduced this cycle in Learning by Doing (1988) so students could turn experiences into lessons. It moves from what happened to how you felt, what went well, what it means, and what you would do next time.',
    steps: [
      {
        label: 'Description',
        question: 'What happened?',
        hint: 'Set the scene briefly.',
        answer: 'I led my first workshop today. Twelve people, ninety minutes, and the projector died halfway through.',
      },
      {
        label: 'Feelings',
        question: 'What were you thinking and feeling?',
        hint: 'Before, during, and after.',
        answer: 'Nervous at the start, then panicked when the screen went black. After a minute I felt oddly calm.',
      },
      {
        label: 'Evaluation',
        question: 'What went well, and what didn’t?',
        hint: 'Be honest about both sides.',
        answer: 'The discussion was great once the slides were gone. The first half felt rushed and too scripted.',
      },
      {
        label: 'Analysis',
        question: 'What sense can you make of it?',
        hint: 'Why did things go the way they did?',
        answer: 'People engaged more when I stopped presenting and started asking questions. The slides were a crutch for me.',
      },
      {
        label: 'Conclusion',
        question: 'What else could you have done?',
        hint: 'What did you learn?',
        answer: 'I could have planned more discussion from the start, and kept the slides as a backup, not the backbone.',
      },
      {
        label: 'Action plan',
        question: 'If it happened again, what would you do?',
        hint: 'One or two concrete changes.',
        answer: "Next time I'll open with a question, cut the deck in half, and test the room the day before.",
      },
    ],
  },
];

export const GUIDE = {
  /* Demo only: move on by itself once the simulated answer ends. */
  autoAdvance: false,
  advanceAfterMs: [2500, 0, 10000, 100],
  /* After Next, a short beat before the new answer's words start (on top of Transcript › startDelayMs). */
  stepDelayMs: [250, 0, 2000, 10],
  /* The framework info card: distance below the chip (negative moves it up over the chip) and its height. */
  infoCard: {
    y: [10, -140, 200, 1],
    height: [500, 280, 700, 1],
  },
  colors: {
    accent: '#61A8FD',
    track: '#e4eff2a3',
    /* The dot for the step being answered right now. */
    current: '#bedbfb9e',
  },
  /* A new prompt arriving. */
  motion: {
    inMs: [560, 0, 2000, 10],
    offsetY: [10, -40, 40, 1],
    blur: [8, 0, 24, 0.5],
  },
  /* Progress dots: how the fill moves to the next dot. The dots share a goo
     filter, so neighbours merge like metaballs while they are close. */
  dots: {
    preset: select(
      [
        { value: 'liquid', label: '1 · Liquid stretch' },
        { value: 'drip', label: '2 · Drip' },
        { value: 'bridge', label: '3 · Bridge' },
        { value: 'swell', label: '4 · Swell' },
        { value: 'hop', label: '5 · Hop' },
      ],
      'drip',
    ),
    durationMs: [600, 100, 3000, 10],
    gap: [6, 0, 24, 0.5],
    /* How far the goo reaches, in dot radii; 0 turns merging off. */
    goo: [0.29, 0, 1.5, 0.01],
    overshoot: [2.1, 1, 3, 0.01],
    /* Travelling droplet size (drip, hop) as a share of a dot. */
    drop: [0.58, 0.2, 1.2, 0.01],
    /* Hop height, in dot sizes. */
    hop: [0.8, 0, 4, 0.05],
    /* Bridge thickness (bridge) as a share of a dot. */
    bridge: [0.26, 0.1, 1, 0.01],
  },
};

/* ── Guided compositions ────────────────────────────────
 * Five arrangements of the upper portion (framework chip, progress, step label,
 * question, hint). The transcript and bottom controls are the same in all five.
 * Each composition has its own folder, so every element can be hidden (show),
 * moved (x/y nudge, px) and edited per composition; only the active one applies.
 *   stack      centred chip, bars, label, question, hint
 *   card       left-aligned prompt inside a glass card, dots on top
 *   editorial  big step number, bold left question, step names underneath
 *   bubble     chip and "2 / 4" on one row; the prompt is a chat bubble
 *   minimal    chip and dots on one row; just the step name and the question
 * ─────────────────────────────────────────────────────── */
const COMPOSITIONS = [
  { value: 'stack', label: '1 · Stack' },
  { value: 'card', label: '2 · Card' },
  { value: 'editorial', label: '3 · Editorial' },
  { value: 'bubble', label: '4 · Bubble' },
  { value: 'minimal', label: '5 · Minimal' },
];

const LABEL_FORMATS = {
  full: (i, n, name) => `${i + 1} of ${n} · ${name}`,
  count: (i, n) => `Step ${i + 1} of ${n}`,
  name: (i, n, name) => name,
  number: (i) => String(i + 1).padStart(2, '0'),
};

const move = ({ show = true, x = 0, y = 0 }) => ({ show, x: [x, -200, 200, 1], y: [y, -400, 400, 1] });

/* Every text element can use the app's font or Test Family (Klim trial, Regular + Italic). */
const TEST_FAMILY = "'Unwind Family', 'Test Family', serif";
const FONTS = [
  { value: 'current', label: 'Current (Inter)' },
  { value: 'test-family', label: 'Test Family' },
  { value: 'test-family-italic', label: 'Test Family Italic' },
];
const font = (value = 'current') => select(FONTS, value);
const fontStyle = (e) =>
  e.font === 'current' ? {} : { fontFamily: TEST_FAMILY, fontStyle: e.font === 'test-family-italic' ? 'italic' : 'normal' };

/* Deck motion curves. 'spring' swings past the target by the deck's overshoot. */
const DECK_CURVES = [
  { value: 'smooth', label: 'Smooth (in-out)' },
  { value: 'out', label: 'Ease out' },
  { value: 'in', label: 'Ease in' },
  { value: 'spring', label: 'Spring' },
  { value: 'snap', label: 'Snap' },
  { value: 'linear', label: 'Linear' },
];
const deckCurve = (name, overshoot) =>
  ({
    smooth: 'cubic-bezier(0.45, 0, 0.2, 1)',
    out: 'cubic-bezier(0.22, 1, 0.36, 1)',
    in: 'cubic-bezier(0.55, 0, 1, 0.45)',
    spring: `cubic-bezier(0.34, ${overshoot}, 0.64, 1)`,
    snap: 'cubic-bezier(0.8, 0, 0.1, 1)',
    linear: 'linear',
  })[name];

function compositionConfig(d) {
  const k = d.deck ?? {};
  return {
    _collapsed: true,
    layout: {
      align: select(['center', 'left'], d.align),
      sidePadding: [d.sidePadding, 12, 80, 1],
      /* Framework chip (and header progress) distance from the top. */
      headerTop: [d.headerTop, 40, 300, 1],
      /* Space between the framework chip (30px tall) and the cards. */
      cardGap: [d.promptTop - d.headerTop - 30, -40, 300, 1],
      /* Dots under the stack (placement below-deck): fixed distance from the prompt top, so they never move. */
      belowDeckY: [d.belowDeckY ?? 190, 40, 500, 1],
    },
    panel: {
      show: d.panel.show,
      shape: select(['card', 'bubble'], d.panel.shape),
      glass: [d.panel.glass, 0, 1, 0.01],
      radius: [d.panel.radius, 0, 40, 1],
      padding: [d.panel.padding, 0, 40, 1],
    },
    /* With a panel on: the next prompts wait as cards stacked behind this one.
       Next shuffles the front card to the back and the one beneath comes forward. */
    deck: {
      show: d.deck?.show ?? false,
      depth: [k.depth ?? 2, 0, 4, 1],
      offset: [k.offset ?? 10, 0, 40, 1],
      scale: [0.05, 0, 0.2, 0.005],
      fade: [k.fade ?? 0.3, 0, 1, 0.01],
      shuffleMs: [k.shuffleMs ?? 640, 0, 2000, 10],
      lift: [k.lift ?? 46, 0, 160, 1],
      tilt: [k.tilt ?? -4, -20, 20, 0.5],
      /* Where the answered card goes: tucked to the back, or away off the top. */
      leaveTo: select(['away', 'back'], k.leaveTo ?? 'away'),
      /* How the move feels. The answered card leaves on `leave`; the next one
         comes forward on `rise`; the waiting cards fan and settle on `stack`. */
      leave: {
        curve: select(DECK_CURVES, 'smooth'),
        /* When the lift peaks and the card slips behind (share of shuffleMs). */
        peakAt: [0.45, 0.1, 0.9, 0.01],
        driftX: [0, -160, 160, 1],
        liftScale: [0.97, 0.7, 1.15, 0.01],
        endOpacity: [0, 0, 1, 0.01],
        blur: [k.leaveBlur ?? 0, 0, 16, 0.5],
      },
      rise: {
        curve: select(DECK_CURVES, 'out'),
        durationMs: [640, 0, 2000, 10],
        delayMs: [0, 0, 1000, 10],
        fromY: [10, -40, 80, 1],
        fromScale: [0.95, 0.7, 1.1, 0.005],
        fromOpacity: [0.7, 0, 1, 0.01],
        blur: [0, 0, 16, 0.5],
      },
      stack: {
        curve: select(DECK_CURVES, 'out'),
        settleMs: [k.settleMs ?? 640, 0, 2000, 10],
        /* Per card of depth: sideways shift and turn, for a fanned deck. */
        fanX: [0, -30, 30, 0.5],
        fanTilt: [0, -8, 8, 0.25],
      },
      /* The drop shadow under every card in the deck. */
      shadow: {
        color: '#003246',
        opacity: [k.shadow?.opacity ?? 0.08, 0, 0.5, 0.01],
        y: [12, -20, 60, 1],
        blur: [k.shadow?.blur ?? 32, 0, 120, 1],
        spread: [k.shadow?.spread ?? 0, -30, 30, 1],
      },
      /* Spring curves: how far past the target they swing (1 = none). */
      overshoot: [k.overshoot ?? 1.4, 1, 2.6, 0.01],
    },
    chip: { ...move(d.chip), font: font(d.chip.font), size: [d.chip.size, 10, 18, 0.5] },
    progress: {
      ...move(d.progress),
      style: select(['bars', 'dots', 'steps', 'fraction'], d.progress.style),
      /* header-row puts the progress on the chip's row, at the far side. */
      placement: select(['header', 'header-row', 'prompt-top', 'prompt-bottom', 'below-deck'], d.progress.placement),
      /* Bar height, dot size, or font size, depending on style. */
      size: [d.progress.size, 1, 20, 0.5],
      /* Applies to the text styles (steps, fraction). */
      font: font(d.progress.font),
    },
    label: {
      ...move(d.label),
      format: select(Object.keys(LABEL_FORMATS), d.label.format),
      font: font(d.label.font),
      size: [d.label.size, 9, 60, 0.5],
      color: d.label.color,
    },
    question: {
      ...move(d.question),
      font: font(d.question.font),
      size: [d.question.size, 12, 44, 0.5],
      weight: [d.question.weight, 300, 700, 10],
      color: d.question.color,
    },
    hint: { ...move(d.hint), font: font(d.hint.font), size: [d.hint.size, 10, 24, 0.5], color: d.hint.color },
  };
}

const INK = '#1f2a2e';
const MUTED = '#8a9aa0';
const ACCENT = '#61A8FD';
const NO_PANEL = { show: false, shape: 'card', glass: 0.72, radius: 24, padding: 20 };

export const COMPOSITION = {
  active: select(COMPOSITIONS, 'bubble'),
  stack: compositionConfig({
    align: 'center', sidePadding: 32, headerTop: 100, promptTop: 176,
    panel: NO_PANEL,
    chip: { size: 13 },
    progress: { style: 'bars', placement: 'header', size: 3 },
    label: { format: 'full', size: 12, color: ACCENT },
    question: { size: 26, weight: 500, color: INK },
    hint: { size: 15, color: MUTED },
  }),
  card: compositionConfig({
    align: 'left', sidePadding: 22, headerTop: 100, promptTop: 150,
    panel: { show: true, shape: 'bubble', glass: 0.72, radius: 28, padding: 22 },
    deck: { show: true },
    chip: { size: 13 },
    progress: { style: 'steps', placement: 'prompt-top', size: 7 },
    label: { format: 'count', size: 12, color: ACCENT },
    question: { size: 24, weight: 500, color: INK },
    hint: { size: 14, color: MUTED },
  }),
  editorial: compositionConfig({
    align: 'left', sidePadding: 30, headerTop: 100, promptTop: 150,
    panel: NO_PANEL,
    chip: { size: 13 },
    progress: { style: 'steps', placement: 'prompt-bottom', size: 12 },
    label: { format: 'number', size: 44, color: ACCENT },
    question: { size: 32, weight: 600, color: INK },
    hint: { size: 16, color: MUTED },
  }),
  bubble: compositionConfig({
    align: 'left', sidePadding: 24, headerTop: 100, promptTop: 143,
    panel: { show: true, shape: 'bubble', glass: 0.62, radius: 24, padding: 18 },
    deck: { show: true, depth: 4, offset: 7, fade: 1, shuffleMs: 2000, lift: 160, tilt: 6.5, leaveBlur: 16, settleMs: 1030, overshoot: 1, shadow: { opacity: 0.07, blur: 12, spread: -10 } },
    chip: { size: 13, y: -4 },
    /* Dots sit centred under the card stack. */
    progress: { style: 'dots', placement: 'below-deck', size: 8.5, y: -26 },
    label: { show: false, format: 'name', size: 11, color: ACCENT },
    question: { size: 21, weight: 500, color: INK },
    hint: { size: 14, color: MUTED },
  }),
  minimal: compositionConfig({
    align: 'center', sidePadding: 32, headerTop: 100, promptTop: 190,
    panel: NO_PANEL,
    chip: { size: 12 },
    progress: { style: 'dots', placement: 'header-row', size: 6 },
    label: { format: 'name', size: 11, color: ACCENT },
    question: { size: 30, weight: 500, color: INK },
    hint: { show: false, size: 14, color: MUTED },
  }),
};

/* Guided copy: every text the upper portion shows, editable per framework and
   step. Shared by all five compositions; the simulated answers aren't here. */
const camel = (s) => s.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase());
const text = (value) => ({ type: 'text', default: value });
const COPY = Object.fromEntries(
  FRAMEWORKS.map((f, i) => [
    f.id,
    {
      _collapsed: i > 0,
      title: text(f.title),
      creator: text(f.creator),
      year: text(f.year),
      summary: text(f.summary),
      about: text(f.about),
      ...Object.fromEntries(
        f.steps.map((st) => [
          camel(st.label),
          { _collapsed: true, label: text(st.label), question: text(st.question), hint: text(st.hint) },
        ]),
      ),
    },
  ]),
);

/* FRAMEWORKS with the Copy panel's edits applied. */
function withCopy(copy) {
  return FRAMEWORKS.map((f) => {
    const { title, creator, year, summary, about, ...steps } = copy[f.id];
    return {
      ...f,
      title,
      creator,
      year,
      summary,
      about,
      steps: f.steps.map((st) => ({ ...st, ...steps[camel(st.label)] })),
    };
  });
}

/* Each page is one variant; DialKit gets a stable config object per variant. */
const VARIANTS = {
  freeform: { modeLabel: 'Freeform', text: FREEFORM_TEXT, prompts: false, guided: false },
  dynamic: { modeLabel: 'Dynamic', text: DYNAMIC_TEXT, prompts: true, guided: false },
  /* The script comes from the chosen framework, so the Transcript text field is unused. */
  guided: { modeLabel: 'Guided', text: FREEFORM_TEXT, prompts: false, guided: true },
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
   status: idle → recording ⇄ paused → processing → stopped
   `guide` (Guided mode) splits the take into steps, one answer per prompt:
   the text holds after each answer until Next, and the last step's stop saves. */
function useRecorder(s, t, ctl, pr, guide) {
  const [status, setStatus] = useState('idle');
  const [step, setStep] = useState(0);
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
  const stepRef = useRef(0);
  const params = useRef({ s, t, ctl, pr, guide });
  params.current = { s, t, ctl, pr, guide };
  /* The take as it unfolds: the parsed script with any answers spliced in.
     Each token's `start` is laid out every frame, so timing sliders apply live;
     `dur` overrides a token's length when a tap cuts it short. */
  const take = useRef({ text: null, seq: [], playhead: -1, offered: null, seen: new Set() });

  const scriptNow = () => {
    const { t: tp, guide: g } = params.current;
    return g ? g.answers[stepRef.current] : tp.text;
  };

  const resetTake = useCallback((text) => {
    const seq = parseScript(text);
    take.current = { text, seq, playhead: -1, offered: null, seen: new Set() };
    setItems(seq.filter(spoken));
    // A card still up from the last take fades rather than vanishing mid-read.
    setPrompt((p) => p && { ...p, phase: 'faded' });
  }, []);

  const beginProcessing = useCallback(() => {
    clock.current.proc = 0;
    statusRef.current = 'processing';
    setStatus('processing');
  }, []);

  /* Starts `to`'s answer from silence; the session timer keeps running. */
  const goToStep = useCallback((to) => {
    stepRef.current = to;
    setStep(to);
    clock.current.t = 0;
    resetTake(scriptNow());
  }, [resetTake]);

  /* Guided: move to the next prompt, or save after the last one. */
  const next = useCallback(() => {
    const g = params.current.guide;
    if (!g || stepRef.current >= g.answers.length - 1) {
      beginProcessing();
      return;
    }
    goToStep(stepRef.current + 1);
    setStatus('recording');
  }, [beginProcessing, goToStep]);

  useEffect(() => {
    let raf;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const c = clock.current;
      const dt = c.last ? Math.min(64, now - c.last) : 0;
      c.last = now;
      const { s: sp, t: tp, ctl: cp, pr: pv, guide: g } = params.current;
      const text = scriptNow();
      if (take.current.text !== text) resetTake(text);
      const { wordMs, holdMs, clearMs } = tp.timing;
      // Guided: from step 2 on, the new card lands before its words start.
      const startDelayMs = tp.timing.startDelayMs + (g && stepRef.current > 0 ? g.stepDelayMs : 0);
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
        if (g) {
          // Guided answers hold on screen until Next.
          if (g.autoAdvance && c.t >= speakEnd + g.advanceAfterMs) next();
        } else if (c.t >= total) {
          if (sp.simulation.loop) {
            c.t = 0;
            c.rec = 0;
            resetTake(text);
          } else {
            c.t = speakEnd + holdMs;
            beginProcessing();
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
          if (g) {
            // Guided loops: back to the first prompt, ready to record again.
            statusRef.current = 'idle';
            setStatus('idle');
            goToStep(0);
          } else {
            setStatus('stopped');
          }
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
      setClearing(!g && c.t > speakEnd + holdMs);
      setSeconds(Math.floor(c.rec / 1000));
      setThinking(isThinking);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [resetTake, beginProcessing, next, goToStep]);

  /* Record begins a fresh take (Guided: from the first prompt). */
  const record = useCallback(() => {
    clock.current.rec = 0;
    goToStep(0);
    setStatus('recording');
  }, [goToStep]);
  /* Restart: Freeform/Dynamic redo the whole take; Guided redoes the current answer. */
  const restart = useCallback(() => {
    if (params.current.guide) goToStep(stepRef.current);
    else record();
  }, [goToStep, record]);
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
  /* Swiping the card away ignores it now instead of waiting out lingerMs. */
  const dismiss = useCallback((id, dir) => {
    const tk = take.current;
    if (tk.offered?.id !== id) return;
    tk.offered = null;
    setPrompt((p) => p && { ...p, phase: 'swiped', dir });
  }, []);
  const getLevel = useCallback(() => level.current, []);
  const live = status === 'recording' || status === 'paused';
  // Once stopped, the take's text stays hidden until the next recording.
  const hideText = clearing || status === 'processing' || status === 'stopped';
  // The primary button: record, then stop — or, mid-framework, Next.
  const steps = guide?.answers.length ?? 1;
  const primary = !live ? 'record' : step < steps - 1 ? 'next' : 'stop';

  return {
    status, live, step, primary, guided: !!guide, items, visible, hideText, thinking, seconds, prompt,
    record, restart, next, togglePause, stop: beginProcessing, answer, dismiss, getLevel,
    /* Guided: skip the card without answering; same move as Next (Finish on the last card). */
    skip: guide ? next : undefined,
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
const Chevron = () => (
  <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 5 6 7.5 8.5 5" /></svg>
);

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

/* The three modes, in menu order; each is its own page. */
const MODES = [
  { label: 'Freeform', href: 'voice.html' },
  { label: 'Guided', href: 'voice-guided.html' },
  { label: 'Dynamic', href: 'voice-dynamic.html' },
];

/* Tapping the pill opens the mode menu above it. Locked during a take. */
function ModePill({ label, locked }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const shown = open && !locked;
  useEffect(() => {
    if (!shown) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [shown]);
  return (
    <span className="mode-wrap" ref={ref}>
      <button
        type="button"
        className="mode-pill"
        data-exit
        aria-haspopup="menu"
        aria-expanded={shown}
        disabled={locked}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        <Chevron />
      </button>
      {shown && (
        <span className="mode-menu" role="menu" aria-label="Mode">
          {MODES.map((m) => (
            <a key={m.label} role="menuitemradio" aria-checked={m.label === label} href={m.href}>
              {m.label}
            </a>
          ))}
        </span>
      )}
    </span>
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
        onClick={rec.restart}
      >
        <RestartIcon />
        {withLabel && <span>Restart</span>}
      </button>
    </Reveal>
  );
}

/* Record before a take; stop during one — or, mid-framework in Guided, Next.
   The glyph morphs dot ↔ square; Next swaps in an arrow. */
const PRIMARY = {
  record: { label: 'Record', aria: 'Start recording' },
  next: { label: 'Next', aria: 'Next prompt' },
  stop: { label: 'Stop', aria: 'Stop and save entry' },
  finish: { label: 'Finish', aria: 'Finish and save entry' },
};
function RecordButton({ rec, size, withLabel }) {
  const kind = rec.primary === 'stop' && rec.guided ? 'finish' : rec.primary;
  const { label, aria } = PRIMARY[kind];
  return (
    <button
      type="button"
      className={`ctl stop ${size || ''} ${withLabel ? 'labeled' : ''}`}
      data-exit
      data-record
      aria-label={aria}
      disabled={rec.status === 'processing'}
      onClick={rec.primary === 'record' ? rec.record : rec.primary === 'next' ? rec.next : rec.stop}
    >
      {rec.primary === 'next' ? (
        <img className="next-glyph" src={nextIcon} alt="" />
      ) : (
        <span className="rec-glyph" data-mode={rec.live ? 'stop' : 'record'} aria-hidden="true">
          <img className="rec-dot" src={recordIcon} alt="" />
          <img className="rec-square" src={stopIcon} alt="" />
        </span>
      )}
      {withLabel && <span>{label}</span>}
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

const STAR_EASE = {
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  smooth: 'cubic-bezier(0.65, 0, 0.35, 1)',
  linear: 'linear',
};
const SWAY = 'cubic-bezier(0.37, 0, 0.63, 1)';

/* A looping ease-in-out there-and-back: `from` → `to` at the middle → `from`. */
const sway = (from, to) => [
  { ...from, easing: SWAY },
  { ...to, offset: 0.5, easing: SWAY },
  from,
];

/* The star's motion preset → a list of { layer, keyframes, options } for
   element.animate(), one per moving layer ('big', 'small' or 'both'). */
function starMotion(s) {
  const c = s[s.motion];
  switch (s.motion) {
    case 'popIn': {
      const from = { transform: `rotate(${c.turnDeg}deg) scale(${c.fromScale})`, opacity: 0 };
      const kf = [from, { opacity: 1, offset: 0.35 }, { transform: 'rotate(0deg) scale(1)', opacity: 1 }];
      const o = { duration: c.durationMs, easing: STAR_EASE[c.easing], fill: 'backwards' };
      return [
        { layer: 'big', keyframes: kf, options: { ...o, delay: c.delayMs } },
        { layer: 'small', keyframes: kf, options: { ...o, delay: c.delayMs + c.smallLagMs } },
      ];
    }
    case 'twinkle': {
      const loop = { duration: c.cycleMs, iterations: Infinity };
      return [
        { layer: 'big', keyframes: sway({ transform: 'scale(1)' }, { transform: `scale(${c.bigScale})` }), options: loop },
        {
          layer: 'small',
          keyframes: sway(
            { transform: 'scale(1)', opacity: 1 },
            { transform: `scale(${c.smallScale})`, opacity: c.smallOpacity },
          ),
          /* A negative delay starts it part-way through: the phase offset. */
          options: { ...loop, delay: -c.phase * c.cycleMs },
        },
      ];
    }
    case 'glint': {
      const cycle = c.glintMs + c.restMs;
      const peak = (c.glintMs / cycle) * 0.4;
      const end = c.glintMs / cycle;
      const loop = { duration: cycle, iterations: Infinity };
      return [
        {
          layer: 'small',
          keyframes: [
            { transform: 'rotate(0deg) scale(1)', easing: STAR_EASE[c.easing] },
            { transform: `rotate(${c.smallTurnDeg}deg) scale(${c.smallScale})`, offset: peak, easing: STAR_EASE.smooth },
            { transform: 'rotate(0deg) scale(1)', offset: end },
            { transform: 'rotate(0deg) scale(1)' },
          ],
          options: loop,
        },
        {
          layer: 'big',
          keyframes: [
            { transform: 'scale(1)', easing: STAR_EASE.out },
            { transform: `scale(${c.bigScale})`, offset: peak, easing: STAR_EASE.smooth },
            { transform: 'scale(1)', offset: end },
            { transform: 'scale(1)' },
          ],
          options: loop,
        },
      ];
    }
    case 'spin': {
      const dir = c.direction === 'ccw' ? -1 : 1;
      const turn = (d) => [{ transform: 'rotate(0deg)' }, { transform: `rotate(${d * 360}deg)` }];
      return [
        { layer: 'big', keyframes: turn(dir), options: { duration: c.bigSecPerTurn * 1000, iterations: Infinity } },
        {
          layer: 'small',
          keyframes: turn(c.smallCounter ? -dir : dir),
          options: { duration: c.smallSecPerTurn * 1000, iterations: Infinity },
        },
      ];
    }
    case 'float': {
      const loop = { duration: c.cycleMs, iterations: Infinity };
      const bob = (px) => sway({ transform: 'translateY(0px)' }, { transform: `translateY(${-px}px)` });
      return [
        { layer: 'big', keyframes: bob(c.bigLiftPx), options: loop },
        { layer: 'small', keyframes: bob(c.smallLiftPx), options: { ...loop, delay: -(1 - c.lag) * c.cycleMs } },
      ];
    }
    case 'breathe':
      return [
        {
          layer: 'both',
          keyframes: sway({ transform: 'scale(1)' }, { transform: `scale(${c.scale})` }),
          options: { duration: c.cycleMs, iterations: Infinity },
        },
      ];
    default:
      return [];
  }
}

/* The blue star pair before the hint. Retuning restarts it, so every slider
   shows live. It holds still while the take is paused, like the timer. */
function Spark({ s, paused }) {
  const layers = { both: useRef(null), big: useRef(null), small: useRef(null) };
  const anims = useRef([]);
  const sRef = useRef(s);
  sRef.current = s;
  /* Restart key only: JSON would turn iterations: Infinity into null. */
  const spec = JSON.stringify(s);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const list = starMotion(sRef.current).map(({ layer, keyframes, options }) =>
      layers[layer].current.animate(keyframes, options),
    );
    anims.current = list;
    return () => list.forEach((a) => a.cancel());
  }, [spec]);

  useEffect(() => {
    for (const a of anims.current) {
      if (a.playState === 'finished') continue;
      if (paused) a.pause();
      else a.play();
    }
  }, [paused, spec]);

  return (
    <span ref={layers.both} className="prompt-star" aria-hidden="true">
      <img ref={layers.big} className="big" src={sparkBigUrl} alt="" draggable={false} />
      <img ref={layers.small} className="small" src={sparkSmallUrl} alt="" draggable={false} />
    </span>
  );
}

function RingTimer({ r }) {
  return (
    <svg className="linger-ring" data-place={r.place} viewBox="0 0 24 24" aria-hidden="true">
      <circle className="track" cx="12" cy="12" r="9" />
      <circle className="linger" cx="12" cy="12" r="9" pathLength="1" />
    </svg>
  );
}

/* The countdown before an untouched card fades. Every style is a CSS animation
   lasting --prompt-linger, so all of them pause with the take. */
function CardTimer({ t }) {
  switch (t.style) {
    case 'bar':
      return <span className="linger linger-bar" data-edge={t.bar.edge} data-to={t.bar.shrinkTo} aria-hidden="true" />;
    case 'ring':
      return t.ring.place === 'corner' ? <RingTimer r={t.ring} /> : null;
    case 'border':
      return (
        <svg className="linger-border" aria-hidden="true">
          <rect className="linger" data-dir={t.border.direction} pathLength="1" />
        </svg>
      );
    case 'wash':
      return <span className="linger linger-wash" data-to={t.wash.recedeTo} aria-hidden="true" />;
    case 'dots':
      return (
        <span className="linger-dots" aria-hidden="true">
          {Array.from({ length: t.dots.count }, (_, i) => (
            /* Right to left: the last dot goes out first; the first goes out as the card fades. */
            <span key={i} className="linger" style={{ '--dot-at': (t.dots.count - i) / t.dots.count }} />
          ))}
        </span>
      );
    default:
      return null;
  }
}

/* Dynamic mode's question card. Tapping answers it; left alone it fades after
   lingerMs, while the chosen timer counts down the time it has left.
   prompt-card.html previews it alone: `timerAt` (0–1) starts the countdown that
   far in, and `timerFrozen` holds the countdown still while the star keeps moving. */
export function PromptCard({ rec, p, bottom, timerAt = 0, timerFrozen = false }) {
  const card = rec.prompt;
  /* Swipe to ignore: the card follows the finger; past swipe.distance (or a
     quick flick) it flies off that side, otherwise it springs back. A drag
     never counts as a tap. */
  const [dragX, setDragX] = useState(0);
  const drag = useRef(null);
  if (!card) return null;
  const phase = rec.live ? card.phase : 'faded';
  const sw = p.swipe;
  const onPointerDown = (e) => {
    if (!sw.enabled || phase !== 'offered') return;
    drag.current = { x: e.clientX, t: performance.now(), moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 6) d.moved = true;
    if (d.moved) setDragX(dx);
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const dx = e.clientX - d.x;
    const speed = Math.abs(dx) / Math.max(1, performance.now() - d.t);
    if (d.moved && (Math.abs(dx) > sw.distance || speed > sw.flickSpeed)) {
      rec.dismiss(card.id, dx < 0 ? -1 : 1);
    } else if (!d.moved) {
      rec.answer(card.id);
    }
    setDragX(0);
  };
  const dragging = dragX !== 0;
  const pull = Math.min(1, Math.abs(dragX) / sw.distance);
  const paused = rec.status === 'paused';
  const t = p.timer;
  return (
    <button
      type="button"
      className="prompt-card"
      data-phase={phase}
      data-paused={paused || timerFrozen || undefined}
      data-timer={t.style}
      inert={phase !== 'offered'}
      data-dragging={dragging || undefined}
      data-dir={card.dir}
      aria-label={`Answer: ${card.question}. Swipe left or right to ignore.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { drag.current = null; setDragX(0); }}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), rec.answer(card.id))}
      style={{
        bottom,
        '--drag-x': `${dragX}px`,
        '--drag-tilt': `${(dragX / sw.distance) * sw.tilt}deg`,
        '--drag-fade': 1 - pull * sw.fade,
        '--swipe-ms': `${sw.flyMs}ms`,
        '--swipe-fly': `${sw.flyDistance}px`,
        '--swipe-tilt': `${sw.tilt * 1.6}deg`,
        '--prompt-width': `${p.card.width}px`,
        '--prompt-radius': `${p.card.radius}px`,
        '--prompt-glass': p.card.glass,
        '--prompt-size': `${p.card.textSize}px`,
        '--prompt-hint-size': `${p.card.hintSize}px`,
        '--prompt-color': p.card.textColor,
        '--prompt-accent': p.card.accent,
        '--prompt-in': `${p.motion.inMs}ms`,
        '--prompt-out': `${p.motion.outMs}ms`,
        '--prompt-y': `${p.motion.offsetY}px`,
        '--prompt-blur': `${p.motion.blur}px`,
        '--prompt-linger': `${p.lingerMs}ms`,
        '--linger-ease': t.pace,
        '--bar-h': `${t.bar.height}px`,
        '--bar-opacity': t.bar.opacity,
        '--bar-inset': `${t.bar.inset}px`,
        '--ring-size': `${t.ring.size}px`,
        '--ring-stroke': t.ring.stroke,
        '--ring-opacity': t.ring.opacity,
        '--ring-track': t.ring.track,
        '--border-stroke': `${t.border.stroke}px`,
        '--border-opacity': t.border.opacity,
        '--wash-opacity': t.wash.opacity,
        '--dot-size': `${t.dots.size}px`,
        '--dot-gap': `${t.dots.gap}px`,
        '--dot-opacity': t.dots.opacity,
        '--dot-fade': `${t.dots.fadeMs}ms`,
        '--star-size': `${p.star.size}px`,
        '--linger-at': timerAt,
      }}
    >
      <span className="prompt-hint">
        <Spark s={p.star} paused={paused} />
        {p.card.hint}
        {t.style === 'ring' && t.ring.place === 'hint' && <RingTimer r={t.ring} />}
      </span>
      <span className="prompt-question">{card.question}</span>
      <CardTimer t={t} />
    </button>
  );
}

/* A per-element nudge from its folder's x/y. */
const nudge = (e) => (e.x || e.y ? { transform: `translate(${e.x}px, ${e.y}px)` } : undefined);

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/* Overshoot 1 = plain ease-out; higher springs past the target and settles. */
const backOut = (t, overshoot) => {
  const s = (overshoot - 1) * 2.4;
  return 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
};
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Progress dots with metaball transitions. `filled` dots carry the accent; the
   last one is half-strength while its step is live. A step change animates the
   fill from the old frontier to the new one with the chosen preset. */
function GooDots({ n, filled, live, size, d, style }) {
  const filter = `goo-${useId().replace(/[^a-z0-9]/gi, '')}`;
  const [anim, setAnim] = useState({ from: filled, to: filled, t: 1 });
  const prev = useRef(filled);
  useEffect(() => {
    const from = prev.current;
    prev.current = filled;
    if (filled <= from || d.durationMs === 0 || reducedMotion()) {
      setAnim({ from: filled, to: filled, t: 1 });
      return;
    }
    let raf;
    const t0 = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / d.durationMs);
      setAnim({ from, to: filled, t });
      if (t < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [filled]);

  const r = size / 2;
  const pad = Math.max(size, r + d.hop * size) + 2;
  const x = (i) => pad + r + i * (size + d.gap);
  const cy = pad + r;
  const w = 2 * pad + n * size + (n - 1) * d.gap;
  const h = 2 * pad + size;
  const on = 'var(--guide-bar-on, #61A8FD)';
  const current = 'var(--guide-bar-current, #b0d4fe)';
  const frontier = live ? current : on;

  const { from, to, t } = anim;
  const moving = t < 1;
  const s = from - 1; // index the fill leaves from (−1: nothing filled yet)
  const e = to - 1; // index it arrives at
  const shapes = [];
  const dot = (key, cx, rad, fill, y = cy) => rad > 0.05 && shapes.push(<circle key={key} cx={cx} cy={y} r={rad} fill={fill} />);
  const bar = (key, x0, x1, fill) =>
    x1 > x0 && shapes.push(<rect key={key} x={x0} y={cy - r * d.bridge} width={x1 - x0} height={2 * r * d.bridge} fill={fill} />);

  // Settled dots. While moving, the old frontier has already turned "done".
  const settled = moving ? from : to;
  for (let i = 0; i < settled; i++) {
    if (d.preset === 'swell' && moving && i === s) continue;
    dot(`d${i}`, x(i), r, !moving && i === to - 1 ? frontier : on);
  }
  if (d.preset === 'bridge') for (let i = 1; i < settled; i++) bar(`b${i}`, x(i - 1), x(i), on);
  // Dots skipped by a multi-step jump fill in as the move lands.
  if (moving && t > 0.5) for (let i = from; i < e; i++) dot(`j${i}`, x(i), r, on);

  if (moving) {
    const u = easeInOut(t);
    const grow = (start) => r * Math.max(0, backOut(clamp01((t - start) / (1 - start)), d.overshoot));
    if (s < 0) {
      dot('grow', x(e), grow(0), frontier);
    } else if (d.preset === 'liquid') {
      // The head springs ahead; the tail follows late, so the blob stretches, snaps off, and lands.
      const head = x(s) + (x(e) - x(s)) * backOut(t, d.overshoot);
      const tail = x(s) + (x(e) - x(s)) * easeInOut(clamp01((t - 0.2) / 0.8));
      for (let k = 0; k <= 6; k++) dot(`l${k}`, tail + ((head - tail) * k) / 6, r * (k === 6 ? 1 : 0.82), frontier);
    } else if (d.preset === 'drip') {
      dot('drop', x(s) + (x(e) - x(s)) * u, r * d.drop, frontier);
      dot('land', x(e), grow(0.55), frontier);
    } else if (d.preset === 'bridge') {
      bar('reach', x(s), x(s) + (x(e) - x(s)) * clamp01(u * 1.6), on);
      dot('land', x(e), grow(0.45), frontier);
    } else if (d.preset === 'swell') {
      // Both dots lean in, touch in the middle, then spring back apart.
      const lean = (x(e) - x(s)) * 0.42 * Math.sin(Math.PI * u);
      dot('src', x(s) + lean, r, on);
      dot('dst', x(e) - lean, grow(0), frontier);
    } else if (d.preset === 'hop') {
      const y = cy - d.hop * size * Math.sin(Math.PI * u);
      dot('drop', x(s) + (x(e) - x(s)) * u, r * d.drop * (1 + 0.25 * Math.sin(Math.PI * u)), frontier, y);
      dot('land', x(e), grow(0.7), frontier);
    }
  }

  const blur = r * d.goo;
  return (
    <div className="guide-progress" data-style="dots" style={style} aria-hidden="true">
      <svg width={w} height={h} style={{ margin: -pad, overflow: 'visible' }}>
        {blur > 0 && (
          <filter id={filter} x="0" y="0" width={w} height={h} filterUnits="userSpaceOnUse">
            <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        )}
        {Array.from({ length: n }, (_, i) => (
          <circle key={i} cx={x(i)} cy={cy} r={r} fill="var(--guide-bar-off, #dde6e8)" />
        ))}
        <g filter={blur > 0 ? `url(#${filter})` : undefined}>{shapes}</g>
      </svg>
    </div>
  );
}

function GuideProgress({ fw, rec, done, p, dots }) {
  const n = fw.steps.length;
  const style = { ...nudge(p), ...fontStyle(p), '--p-size': `${p.size}px` };
  if (p.style === 'dots') {
    const filled = done ? n : rec.live ? rec.step + 1 : rec.step;
    return <GooDots n={n} filled={filled} live={rec.live && !done} size={p.size} d={dots} style={style} />;
  }
  if (p.style === 'fraction') {
    return (
      <div className="guide-progress" data-style="fraction" style={style}>
        {done ? n : rec.step + 1} / {n}
      </div>
    );
  }
  return (
    <div className="guide-progress" data-style={p.style} style={style} aria-hidden="true">
      {fw.steps.map((st, i) => (
        <span key={i} data-state={done || i < rec.step ? 'done' : i === rec.step && rec.live ? 'current' : undefined}>
          {p.style === 'steps' ? st.label : null}
        </span>
      ))}
    </div>
  );
}

/* "Learn more" for one framework: who made it, when, why, and its steps.
   The arrows step through every framework's card without closing. */
function FrameworkInfo({ f, index, count, selected, locked, onSelect, onStep, onClose }) {
  return (
    <div className="guide-info" role="dialog" aria-label={`About ${f.title}`}>
      <button type="button" className="guide-info-close guide-info-corner" aria-label="Close" onClick={onClose}><X /></button>
      <div className="guide-info-head">
        <img className="guide-icon" src={f.icon} alt="" />
        <div>
          <p className="guide-info-title">{f.title}</p>
          <p className="guide-info-by">{f.creator} · {f.year}</p>
        </div>
      </div>
      <div className="guide-info-body">
        <p className="guide-info-about">{f.about}</p>
        <ol className="guide-info-steps">
          {f.steps.map((st) => (
            <li key={st.label}><strong>{st.label}</strong> {st.question}</li>
          ))}
        </ol>
      </div>
      {/* The framework is locked during a take, like the chip. */}
      <button type="button" className="guide-info-select" disabled={selected || locked} onClick={onSelect}>
        {selected ? 'Selected' : 'Select this model'}
      </button>
      {/* Step through the frameworks without closing. */}
      <div className="guide-info-steppers">
        <button type="button" aria-label="Previous framework" onClick={() => onStep(-1)}><ChevronLeft /></button>
        <span>{index + 1} of {count}</span>
        <button type="button" aria-label="Next framework" onClick={() => onStep(1)}><ChevronRight /></button>
      </div>
    </div>
  );
}

/* Guided mode's screen: framework picker, step progress, and the current prompt,
   arranged by the active composition. The framework can only change between
   takes; its info card opens any time. During processing the prompt fades out. */
export function GuideScreen({ rec, fw, frameworks, g, comp, onPick }) {
  const [open, setOpen] = useState(false);
  const [infoId, setInfoId] = useState(null);
  /* Info opened from the picker: closing it goes back to the picker. */
  const [infoFromMenu, setInfoFromMenu] = useState(false);
  const menuOpen = open && !rec.live;
  const done = rec.status === 'processing';
  const step = fw.steps[rec.step];
  const n = fw.steps.length;
  const L = comp.layout;
  const progress = comp.progress.show && <GuideProgress fw={fw} rec={rec} done={done} p={comp.progress} dots={g.dots} />;
  const at = (where) => comp.progress.placement === where && progress;
  const { label, question, hint, panel, deck } = comp;
  const stacked = panel.show && deck.show;
  /* Prompts still to come, shown as cards behind the front one. */
  const ghosts = stacked && !done ? Math.min(deck.depth, n - 1 - rec.step) : 0;
  /* On Next, the card just answered shuffles to the back of the deck. */
  const [leaving, setLeaving] = useState(null);
  const prevStep = useRef(rec.step);
  useEffect(() => {
    const from = prevStep.current;
    prevStep.current = rec.step;
    // Any step change mid-take plays the leave (including a wrap back to step 1).
    if (!stacked || rec.step === from || rec.status === 'idle' || deck.shuffleMs === 0 || reducedMotion()) return;
    setLeaving({ step: from, key: `${fw.id}-${from}-out` });
    // Keep the leaving card until the slower of the leave and the rise has played.
    const id = setTimeout(() => setLeaving(null), Math.max(deck.shuffleMs, deck.rise.delayMs + deck.rise.durationMs));
    return () => clearTimeout(id);
  }, [rec.step]);
  const prevDone = useRef(done);
  useEffect(() => {
    const was = prevDone.current;
    prevDone.current = done;
    if (!stacked || !done || was || deck.shuffleMs === 0 || reducedMotion()) return;
    setLeaving({ step: rec.step, key: `${fw.id}-${rec.step}-done` });
    const id = setTimeout(() => setLeaving(null), deck.shuffleMs);
    return () => clearTimeout(id);
  }, [done]);
  const stepContent = (i) => (
    <>
      {label.show && (
        <span className="guide-label" style={{ ...nudge(label), ...fontStyle(label), fontSize: label.size, color: label.color }}>
          {LABEL_FORMATS[label.format](i, n, fw.steps[i].label)}
        </span>
      )}
      {question.show && (
        <p
          className="guide-question"
          style={{ ...nudge(question), ...fontStyle(question), fontSize: question.size, fontWeight: question.weight, color: question.color }}
        >
          {fw.steps[i].question}
        </p>
      )}
      {hint.show && (
        <p className="guide-hint" style={{ ...nudge(hint), ...fontStyle(hint), fontSize: hint.size, color: hint.color }}>
          {fw.steps[i].hint}
        </p>
      )}
    </>
  );
  const info = frameworks.find((f) => f.id === infoId);

  return (
    <div
      className="guide"
      data-overlay={menuOpen || info ? "" : undefined}
      data-align={L.align}
      style={{
        '--guide-pad': `${L.sidePadding}px`,
        '--guide-bar-on': g.colors.accent,
        '--guide-bar-off': g.colors.track,
        '--guide-bar-current': g.colors.current,
        '--info-y': `${g.infoCard.y}px`,
        '--info-h': `${g.infoCard.height}px`,
        '--guide-in': `${g.motion.inMs}ms`,
        '--guide-y': `${g.motion.offsetY}px`,
        '--guide-blur': `${g.motion.blur}px`,
      }}
    >
      <div
        className="guide-head"
        data-row={comp.progress.placement === 'header-row' || undefined}
        style={{ top: `calc(${L.headerTop}px + var(--safe-top, 0px))` }}
      >
        {comp.chip.show && (
          <div className="guide-framework" style={{ ...nudge(comp.chip), ...fontStyle(comp.chip), fontSize: comp.chip.size }}>
            <button
              type="button"
              className="guide-framework-pick"
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
              disabled={rec.live || rec.status === 'processing'}
              onClick={() => {
                setInfoId(null);
                setOpen((o) => !o);
              }}
            >
              <img className="guide-framework-icon" src={fw.icon} alt="" />
              <span className="guide-framework-title">{fw.title}</span>
              <Chevron />
            </button>
            <button
              type="button"
              className="guide-framework-info"
              aria-label={`About ${fw.title}`}
              aria-expanded={infoId === fw.id}
              onClick={() => {
                setOpen(false);
                setInfoFromMenu(false);
                setInfoId((id) => (id === fw.id ? null : fw.id));
              }}
            >
              <Info />
            </button>
          </div>
        )}
        {menuOpen && (
          <div className="guide-menu" role="listbox" aria-label="Framework">
            {frameworks.map((f) => {
              return (
                <div key={f.id} className="guide-menu-row" aria-selected={f.id === fw.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={f.id === fw.id}
                    onClick={() => {
                      onPick(f.id);
                      setOpen(false);
                    }}
                  >
                    <img className="guide-icon" src={f.icon} alt="" />
                    <span className="guide-menu-text">
                      <span className="guide-menu-name">{f.title}</span>
                      <span className="guide-menu-summary">{f.summary}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="guide-menu-info"
                    aria-label={`About ${f.title}`}
                    onClick={() => {
                      setOpen(false);
                      setInfoFromMenu(true);
                      setInfoId(f.id);
                    }}
                  >
                    <Info />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {info && (
          <FrameworkInfo
            f={info}
            index={frameworks.indexOf(info)}
            count={frameworks.length}
            selected={info.id === fw.id}
            locked={rec.live || rec.status === 'processing'}
            onSelect={() => {
              onPick(info.id);
              setInfoId(null);
              setOpen(false);
            }}
            onStep={(d) => {
              const i = frameworks.indexOf(info);
              setInfoId(frameworks[(i + d + frameworks.length) % frameworks.length].id);
            }}
            onClose={() => {
              setInfoId(null);
              if (infoFromMenu) setOpen(true);
            }}
          />
        )}
        {at('header')}
        {at('header-row')}
      </div>

      <div
        className="guide-prompt"
        data-hidden={(done && !leaving) || undefined}
        data-done={done || undefined}
        data-shuffling={leaving ? '' : undefined}
        style={{
          top: `calc(${L.headerTop + 30 + L.cardGap}px + var(--safe-top, 0px))`,
          '--panel-glass': panel.glass,
          '--panel-radius': `${panel.radius}px`,
          '--panel-pad': `${panel.padding}px`,
          '--deck-offset': `${deck.offset}px`,
          '--deck-scale': deck.scale,
          '--deck-fade': deck.fade,
          '--deck-depth': deck.depth,
          '--deck-shadow': `0 ${deck.shadow.y}px ${deck.shadow.blur}px ${deck.shadow.spread}px color-mix(in srgb, ${deck.shadow.color} ${deck.shadow.opacity * 100}%, transparent)`,
          '--deck-ms': `${deck.shuffleMs}ms`,
          '--deck-lift': `${deck.lift}px`,
          '--deck-tilt': `${deck.tilt}deg`,
          '--leave-ease': deckCurve(deck.leave.curve, deck.overshoot),
          '--leave-x': `${deck.leave.driftX}px`,
          '--leave-scale': deck.leave.liftScale,
          '--leave-opacity': deck.leave.endOpacity,
          '--leave-blur': `${deck.leave.blur}px`,
          '--rise-ease': deckCurve(deck.rise.curve, deck.overshoot),
          '--rise-ms': `${deck.rise.durationMs}ms`,
          '--rise-delay': `${deck.rise.delayMs}ms`,
          '--rise-y': `${deck.rise.fromY}px`,
          '--rise-scale': deck.rise.fromScale,
          '--rise-opacity': deck.rise.fromOpacity,
          '--rise-blur': `${deck.rise.blur}px`,
          '--stack-ease': deckCurve(deck.stack.curve, deck.overshoot),
          '--stack-ms': `${deck.stack.settleMs}ms`,
          '--fan-x': `${deck.stack.fanX}px`,
          '--fan-tilt': `${deck.stack.fanTilt}deg`,
        }}
      >
        <div className="guide-deck">
        {Array.from({ length: ghosts }, (_, k) => (
          <div key={rec.step + k + 1} className="guide-card guide-ghost" data-panel={panel.shape} style={{ '--d': k + 1 }} />
        ))}
        {leaving && (
          /* Keyframe stops can't read CSS variables, so the peak timing is written here. */
          <style>{`@keyframes deck-shuffle-tuned {
  ${deck.leave.peakAt * 100}% { z-index: 3; transform: translate(calc(var(--leave-x) * 0.5), calc(-1 * var(--deck-lift))) rotate(var(--deck-tilt)) scale(var(--leave-scale)); }
  ${deck.leaveTo === 'back'
    ? `${Math.min(99, deck.leave.peakAt * 100 + 10)}% { z-index: -9; }
  to { z-index: -9; opacity: var(--leave-opacity); filter: blur(var(--leave-blur)); transform: translate(var(--leave-x), calc(var(--back) * var(--deck-offset))) scale(calc(1 - var(--back) * var(--deck-scale))); }`
    : `to { z-index: 3; opacity: var(--leave-opacity); filter: blur(var(--leave-blur)); transform: translate(var(--leave-x), calc(-2 * var(--deck-lift))) rotate(calc(var(--deck-tilt) * 1.5)) scale(var(--leave-scale)); }`}
}`}</style>
        )}
        {leaving && (
          <div
            key={leaving.key}
            className="guide-card guide-leaving"
            data-panel={panel.shape}
            style={{ '--back': ghosts + 1 }}
            aria-hidden="true"
          >
            <div className="guide-step">{stepContent(leaving.step)}</div>
          </div>
        )}
        <div className="guide-card guide-front" data-panel={panel.show ? panel.shape : undefined}>
          {rec.skip && rec.live && (
            <button type="button" className="guide-skip" onClick={rec.skip} aria-label="Skip this question">
              Skip
            </button>
          )}
          {at('prompt-top')}
          {/* Every step's text sits invisibly in the same cell, so the card is
              always as tall as the longest question and never resizes. */}
          <div className="guide-step-cell">
            {fw.steps.map((_, i) => (
              <div key={i} className="guide-step guide-step-sizer" aria-hidden="true">{stepContent(i)}</div>
            ))}
            <div className="guide-step" key={`${fw.id}-${rec.step}`} aria-live="polite">
              {stepContent(rec.step)}
            </div>
          </div>
          {at('prompt-bottom')}
        </div>
        </div>
        {at('below-deck') && <div className="guide-below-deck" style={{ top: L.belowDeckY }}>{at('below-deck')}</div>}
      </div>
    </div>
  );
}

/* ── Layout presets ────────────────────────────────────── */
function Layout({ layout, rec, s }) {
  const mode = <ModePill label={s.modeLabel} locked={rec.live || rec.status === 'processing'} />;
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

/* Per-page backdrop and header-logo defaults; pages not listed use the shared ones. */
const PAGE_BACKDROP = {
  freeform: { width: 500, height: 750, radius: 0, fill: 'color', color: '#61a8fd12' },
  guided: { width: 500, height: 750, radius: 0, fill: 'color', color: '#61a8fd12' },
};
const STILL_HEADER = new Set(['freeform', 'guided']);

export function VoiceRecorder({ variant = 'freeform' }) {
  const v = VARIANTS[variant];
  const s = useDialKit('Screen', v.screen, { id: 'voice-screen' });
  const c = useDialKit('Controls', CONTROLS, { id: 'voice-controls' });
  const t = useDialKit('Transcript', v.transcript, { id: 'voice-transcript' });
  // `variant` is fixed for a page's lifetime, so this hook's call order never changes.
  const pr = v.prompts ? useDialKit('Prompts', PROMPTS, { id: 'voice-prompts' }) : NO_PROMPTS;
  const g = v.guided ? useDialKit('Guide', GUIDE, { id: 'voice-guide' }) : null;
  const gc = v.guided ? useDialKit('Composition', COMPOSITION, { id: 'voice-composition' }) : null;
  const copy = v.guided ? useDialKit('Copy', COPY, { id: 'voice-copy', defaultCollapsed: true }) : null;
  const comp = gc && gc[gc.active];
  const b = useDialKit('Voice beam', BEAM, { id: 'voice-beam', defaultCollapsed: true });
  const [frameworkId, setFrameworkId] = useState(FRAMEWORKS[0].id);
  const frameworks = copy ? withCopy(copy) : FRAMEWORKS;
  const fw = frameworks.find((f) => f.id === frameworkId);
  const guide = g && {
    answers: fw.steps.map((st) => st.answer),
    autoAdvance: g.autoAdvance,
    advanceAfterMs: g.advanceAfterMs,
    stepDelayMs: g.stepDelayMs,
  };
  const rec = useRecorder(s, t, c, pr, guide);
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
      {PAGE_BACKDROP[variant] ? (
        <Backdrop defaults={PAGE_BACKDROP[variant]} id={`backdrop-${variant}`} />
      ) : (
        <Backdrop />
      )}
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
            active={rec.status !== 'stopped' && rec.status !== 'idle'}
            {...beamProps(b)}
            processing={rec.thinking}
            processingDuration={c.processing.beam.passSeconds}
            processingLevel={c.processing.beam.level}
            processingEase={c.processing.beam.easeSeconds}
            processingTravel={c.processing.beam.travel}
            processingCurve={c.processing.beam.curve}
            cornerFollow={c.processing.beam.cornerFollow}
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
                '--button-color': c.record.buttonColor,
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
              {comp && (
                <GuideScreen
                  rec={rec}
                  fw={fw}
                  frameworks={frameworks}
                  g={g}
                  comp={comp}
                  onPick={setFrameworkId}
                />
              )}
              <Processing rec={rec} p={c.processing} bottom={t.type.textY} />
              {STILL_HEADER.has(variant) ? (
                <HeaderWave defaults={{ animate: false, loop: false }} id={`header-logo-${variant}`} />
              ) : (
                <HeaderWave />
              )}
              <Layout layout={s.layout} rec={rec} s={s} />
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
