import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { VoiceBeam } from 'voice-glow';
import { DialRoot, useDialKit } from 'dialkit';
import 'dialkit/styles.css';
import './voice.css';
import './unwind-fonts.css';
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

const select = (options, value) => ({ type: 'select', options, default: value });

/* ── Prompt card: countdown timer and star presets ─────────
 * Every timer runs on the card's lingerMs countdown and pauses with the take.
 *   bar     a thin line along one edge shrinks away (the original)
 *   ring    a small ring drains, in the corner or beside the hint
 *   border  the card's own outline drains around its edge
 *   wash    a faint accent tint behind the text recedes to one side
 *   dots    a row of dots goes out one by one, right to left
 * The star before the hint:
 *   spinIn  spins in once as the card arrives, then holds still
 *   spin    turns slowly and continuously
 *   tick    a quick partial turn, a rest, repeat (a quarter turn reads as a tick)
 *   twinkle a quick grow-and-turn, a rest, repeat
 *   swing   rocks back and forth
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
  { value: 'spinIn', label: '1 · Spin in' },
  { value: 'spin', label: '2 · Spin' },
  { value: 'tick', label: '3 · Tick' },
  { value: 'twinkle', label: '4 · Twinkle' },
  { value: 'swing', label: '5 · Swing' },
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
  style: select(TIMERS, 'bar'),
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
    size: [18, 10, 40, 1],
    stroke: [2, 0.5, 6, 0.5],
    opacity: [0.7, 0.05, 1, 0.01],
    track: [0.18, 0, 1, 0.01],
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
  motion: select(STAR_MOTIONS, 'spinIn'),
  size: [12, 8, 24, 0.5],
  spinIn: {
    durationMs: [900, 100, 4000, 10],
    delayMs: [150, 0, 3000, 10],
    turns: [1, 0.25, 4, 0.25],
    fromScale: [0.4, 0, 1, 0.01],
    easing: select(STAR_EASINGS, 'spring'),
    direction: select(DIRECTIONS, 'cw'),
  },
  spin: {
    secPerTurn: [4, 0.5, 20, 0.1],
    direction: select(DIRECTIONS, 'cw'),
  },
  tick: {
    turnMs: [600, 100, 3000, 10],
    restMs: [1800, 0, 8000, 50],
    turns: [0.25, 0.125, 2, 0.125],
    easing: select(STAR_EASINGS, 'spring'),
    direction: select(DIRECTIONS, 'cw'),
  },
  twinkle: {
    twinkleMs: [700, 100, 3000, 10],
    restMs: [1600, 0, 8000, 50],
    scale: [1.4, 1, 2.5, 0.01],
    rotateDeg: [45, 0, 180, 1],
  },
  swing: {
    cycleMs: [1600, 200, 6000, 10],
    angleDeg: [18, 2, 90, 1],
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
    color: '#7dbec0',
    scale: [0.72, 0.5, 1.2, 0.01],
  },
};
/* Freeform scripts have no marks, so only the timing fields are ever read. */
const NO_PROMPTS = { pauseMs: 0, lingerMs: 0, answerDelayMs: 0 };

/* Guided mode: a proven framework, one prompt per step, no AI. The user answers
   each prompt out loud, taps Next, and the last step's stop saves the entry.
   `answer` is only the simulated speaker's reply for this prototype. */
const FRAMEWORKS = [
  {
    id: 'gross',
    name: 'Gross model',
    domain: 'Emotion regulation',
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
    name: 'ABCDE',
    domain: 'Unhelpful thoughts',
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
    name: 'WOOP',
    domain: 'Goals and habits',
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
    name: 'Gibbs cycle',
    domain: 'Learning from experience',
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

const GUIDE = {
  /* Demo only: move on by itself once the simulated answer ends. */
  autoAdvance: false,
  advanceAfterMs: [2500, 0, 10000, 100],
  colors: {
    accent: '#5fb3b8',
    track: '#dde6e8',
  },
  /* A new prompt arriving. */
  motion: {
    inMs: [560, 0, 2000, 10],
    offsetY: [10, -40, 40, 1],
    blur: [8, 0, 24, 0.5],
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

function compositionConfig(d) {
  return {
    _collapsed: true,
    layout: {
      align: select(['center', 'left'], d.align),
      sidePadding: [d.sidePadding, 12, 80, 1],
      /* Framework chip (and header progress) distance from the top. */
      headerTop: [d.headerTop, 40, 300, 1],
      /* Prompt block distance from the top. */
      promptTop: [d.promptTop, 80, 420, 1],
    },
    panel: {
      show: d.panel.show,
      shape: select(['card', 'bubble'], d.panel.shape),
      glass: [d.panel.glass, 0, 1, 0.01],
      radius: [d.panel.radius, 0, 40, 1],
      padding: [d.panel.padding, 0, 40, 1],
    },
    chip: { ...move(d.chip), font: font(d.chip.font), size: [d.chip.size, 10, 18, 0.5] },
    progress: {
      ...move(d.progress),
      style: select(['bars', 'dots', 'steps', 'fraction'], d.progress.style),
      /* header-row puts the progress on the chip's row, at the far side. */
      placement: select(['header', 'header-row', 'prompt-top', 'prompt-bottom'], d.progress.placement),
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
const ACCENT = '#5fb3b8';
const NO_PANEL = { show: false, shape: 'card', glass: 0.72, radius: 24, padding: 20 };

const COMPOSITION = {
  active: select(COMPOSITIONS, 'stack'),
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
    panel: { show: true, shape: 'card', glass: 0.72, radius: 28, padding: 22 },
    chip: { size: 13 },
    progress: { style: 'dots', placement: 'prompt-top', size: 7 },
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
    align: 'left', sidePadding: 24, headerTop: 100, promptTop: 156,
    panel: { show: true, shape: 'bubble', glass: 0.85, radius: 24, padding: 18 },
    chip: { size: 13 },
    progress: { style: 'dots', placement: 'header-row', size: 7 },
    label: { format: 'name', size: 11, color: ACCENT },
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
const COPY = {
  finished: {
    _collapsed: true,
    label: text('All {n} steps'),
    processing: text('That’s the whole reflection.'),
    saved: text('Entry saved.'),
  },
  ...Object.fromEntries(
    FRAMEWORKS.map((f, i) => [
      f.id,
      {
        _collapsed: i > 0,
        domain: text(f.domain),
        name: text(f.name),
        ...Object.fromEntries(
          f.steps.map((st) => [
            camel(st.label),
            { _collapsed: true, label: text(st.label), question: text(st.question), hint: text(st.hint) },
          ]),
        ),
      },
    ]),
  ),
};

/* FRAMEWORKS with the Copy panel's edits applied. */
function withCopy(copy) {
  return FRAMEWORKS.map((f) => {
    const c = copy[f.id];
    return {
      ...f,
      domain: c.domain,
      name: c.name,
      steps: f.steps.map((st) => ({ ...st, ...c[camel(st.label)] })),
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
      setClearing(!g && c.t > speakEnd + holdMs);
      setSeconds(Math.floor(c.rec / 1000));
      setThinking(isThinking);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [resetTake, beginProcessing, next]);

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
  const getLevel = useCallback(() => level.current, []);
  const live = status === 'recording' || status === 'paused';
  // Once stopped, the take's text stays hidden until the next recording.
  const hideText = clearing || status === 'processing' || status === 'stopped';
  // The primary button: record, then stop — or, mid-framework, Next.
  const steps = guide?.answers.length ?? 1;
  const primary = !live ? 'record' : step < steps - 1 ? 'next' : 'stop';

  return {
    status, live, step, primary, guided: !!guide, items, visible, hideText, thinking, seconds, prompt,
    record, restart, next, togglePause, stop: beginProcessing, answer, getLevel,
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
const NextIcon = () => icon(<><path d="M5 12h13" /><path d="M13 6l6 6-6 6" /></>);
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

function ModePill({ label }) {
  return (
    <button type="button" className="mode-pill" data-exit>
      {label}
      <Chevron />
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
        <span className="next-glyph" aria-hidden="true"><NextIcon /></span>
      ) : (
        <span className="rec-glyph" data-mode={rec.live ? 'stop' : 'record'} aria-hidden="true" />
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

/* The star's motion preset → [keyframes, options] for element.animate(), or null. */
function starMotion(s) {
  const c = s[s.motion];
  const dir = c?.direction === 'ccw' ? -1 : 1;
  switch (s.motion) {
    case 'spinIn':
      return [
        [
          { transform: `rotate(${-dir * c.turns * 360}deg) scale(${c.fromScale})`, opacity: 0 },
          { opacity: 1, offset: 0.3 },
          { transform: 'rotate(0deg) scale(1)', opacity: 1 },
        ],
        { duration: c.durationMs, delay: c.delayMs, easing: STAR_EASE[c.easing], fill: 'backwards' },
      ];
    case 'spin':
      return [
        [{ transform: 'rotate(0deg)' }, { transform: `rotate(${dir * 360}deg)` }],
        { duration: c.secPerTurn * 1000, iterations: Infinity },
      ];
    case 'tick': {
      const cycle = c.turnMs + c.restMs;
      const to = `rotate(${dir * c.turns * 360}deg)`;
      return [
        [
          { transform: 'rotate(0deg)', easing: STAR_EASE[c.easing] },
          { transform: to, offset: c.turnMs / cycle },
          { transform: to },
        ],
        { duration: cycle, iterations: Infinity },
      ];
    }
    case 'twinkle': {
      const cycle = c.twinkleMs + c.restMs;
      const k = c.twinkleMs / cycle;
      return [
        [
          { transform: 'scale(1) rotate(0deg)', easing: STAR_EASE.out },
          { transform: `scale(${c.scale}) rotate(${c.rotateDeg}deg)`, offset: k * 0.4, easing: STAR_EASE.smooth },
          { transform: 'scale(1) rotate(0deg)', offset: k },
          { transform: 'scale(1) rotate(0deg)' },
        ],
        { duration: cycle, iterations: Infinity },
      ];
    }
    case 'swing':
      return [
        [
          { transform: 'rotate(0deg)', easing: SWAY },
          { transform: `rotate(${c.angleDeg}deg)`, offset: 0.25, easing: SWAY },
          { transform: `rotate(${-c.angleDeg}deg)`, offset: 0.75, easing: SWAY },
          { transform: 'rotate(0deg)' },
        ],
        { duration: c.cycleMs, iterations: Infinity },
      ];
    default:
      return null;
  }
}

/* The star before the hint. Retuning restarts it, so every slider shows live.
   It holds still while the take is paused, like the timer. */
function Spark({ s, paused }) {
  const el = useRef(null);
  const anim = useRef(null);
  const sRef = useRef(s);
  sRef.current = s;
  /* Restart key only: JSON would turn iterations: Infinity into null. */
  const spec = JSON.stringify(s);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const m = starMotion(sRef.current);
    if (!m) return;
    const a = el.current.animate(...m);
    anim.current = a;
    return () => a.cancel();
  }, [spec]);

  useEffect(() => {
    const a = anim.current;
    if (!a || a.playState === 'finished') return;
    if (paused) a.pause();
    else a.play();
  }, [paused, spec]);

  return (
    <svg ref={el} className="prompt-star" viewBox="0 0 24 24" aria-hidden="true">
      {/* Nudged down 1 unit so the star's centre is the box's centre: it turns in place. */}
      <path className="fill" transform="translate(0 1)" d="M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9z" />
    </svg>
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
   lingerMs, while the chosen timer counts down the time it has left. */
function PromptCard({ rec, p, bottom }) {
  const card = rec.prompt;
  if (!card) return null;
  const phase = rec.live ? card.phase : 'faded';
  const paused = rec.status === 'paused';
  const t = p.timer;
  return (
    <button
      type="button"
      className="prompt-card"
      data-phase={phase}
      data-paused={paused || undefined}
      data-timer={t.style}
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

function GuideProgress({ fw, rec, done, p }) {
  const n = fw.steps.length;
  const style = { ...nudge(p), ...fontStyle(p), '--p-size': `${p.size}px` };
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

/* Guided mode's screen: framework picker, step progress, and the current prompt,
   arranged by the active composition. The framework can only change between takes. */
function GuideScreen({ rec, fw, frameworks, copy, g, comp, onPick }) {
  const [open, setOpen] = useState(false);
  const menuOpen = open && !rec.live;
  const done = rec.status === 'processing' || rec.status === 'stopped';
  const step = fw.steps[rec.step];
  const n = fw.steps.length;
  const L = comp.layout;
  const progress = comp.progress.show && <GuideProgress fw={fw} rec={rec} done={done} p={comp.progress} />;
  const at = (where) => comp.progress.placement === where && progress;
  const { label, question, hint, panel } = comp;

  return (
    <div
      className="guide"
      data-align={L.align}
      style={{
        '--guide-pad': `${L.sidePadding}px`,
        '--guide-bar-on': g.colors.accent,
        '--guide-bar-off': g.colors.track,
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
          <button
            type="button"
            className="guide-framework"
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            disabled={rec.live || rec.status === 'processing'}
            onClick={() => setOpen((o) => !o)}
            style={{ ...nudge(comp.chip), ...fontStyle(comp.chip), fontSize: comp.chip.size }}
          >
            {fw.domain} · {fw.name}
            <Chevron />
          </button>
        )}
        {menuOpen && (
          <div className="guide-menu" role="listbox" aria-label="Framework">
            {frameworks.map((f) => (
              <button
                key={f.id}
                type="button"
                role="option"
                aria-selected={f.id === fw.id}
                onClick={() => {
                  onPick(f.id);
                  setOpen(false);
                }}
              >
                <span className="guide-menu-name">{f.domain} · {f.name}</span>
                <span className="guide-menu-steps">{f.steps.map((st) => st.label).join(' → ')}</span>
              </button>
            ))}
          </div>
        )}
        {at('header')}
        {at('header-row')}
      </div>

      <div
        className="guide-prompt"
        data-panel={panel.show ? panel.shape : undefined}
        style={{
          top: `calc(${L.promptTop}px + var(--safe-top, 0px))`,
          '--panel-glass': panel.glass,
          '--panel-radius': `${panel.radius}px`,
          '--panel-pad': `${panel.padding}px`,
        }}
      >
        {at('prompt-top')}
        <div className="guide-step" key={done ? 'done' : `${fw.id}-${rec.step}`} aria-live="polite">
          {label.show && (
            <span className="guide-label" style={{ ...nudge(label), ...fontStyle(label), fontSize: label.size, color: label.color }}>
              {done ? copy.finished.label.replace('{n}', n) : LABEL_FORMATS[label.format](rec.step, n, step.label)}
            </span>
          )}
          {question.show && (
            <p
              className="guide-question"
              style={{
                ...nudge(question),
                ...fontStyle(question),
                fontSize: question.size,
                fontWeight: question.weight,
                color: question.color,
              }}
            >
              {done ? (rec.status === 'stopped' ? copy.finished.saved : copy.finished.processing) : step.question}
            </p>
          )}
          {hint.show && !done && (
            <p className="guide-hint" style={{ ...nudge(hint), ...fontStyle(hint), fontSize: hint.size, color: hint.color }}>
              {step.hint}
            </p>
          )}
        </div>
        {at('prompt-bottom')}
      </div>
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
              {comp && (
                <GuideScreen
                  rec={rec}
                  fw={fw}
                  frameworks={frameworks}
                  copy={copy}
                  g={g}
                  comp={comp}
                  onPick={setFrameworkId}
                />
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
