import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DialRoot, useDialKit } from 'dialkit';
import 'dialkit/styles.css';
import {
  AudioLines,
  BedDouble,
  Briefcase,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudRain,
  Coffee,
  Compass,
  Flame,
  Footprints,
  GraduationCap,
  HeartHandshake,
  House,
  Moon,
  Palette,
  Pause,
  Play,
  Smartphone,
  Sparkle,
  Sparkles,
  Sprout,
  Sun,
  Sunrise,
  Sunset,
  Target,
  Trees,
  Users,
  Wallet,
  Wind,
  X,
} from 'lucide-react';
import './voice.css';
import './unwind-fonts.css';
import './entries.css';
import iphoneFrameUrl from '../iphone_asset/iPhone - Silver.png';
import { FRAME, FRAME_K, FRAMED_RADIUS, FRAMED_SAFE_TOP, FRAMED_SCREEN_H } from './recorder.jsx';
import { StatusBar } from './status-bar.jsx';
import { Backdrop } from './backdrop.jsx';
import { HeaderWave } from './header-wave.jsx';
import { ENTRIES } from './entries-data.js';

/* ─────────────────────────────────────────────────────────
 * UNWIND — journal entries
 *
 * Two screens in one navigation stack:
 *   LIST    every entry, newest first, grouped by month then day. The day
 *           column sticks beside its cards; the current month is a fixed
 *           bar outside the scroller, so it never moves once it's up.
 *   DETAIL  tap a card → it pushes in from the right while the list slides
 *           a little left and dims (Transition › parallax, dim). Back, or a
 *           drag from the left edge, pops it again.
 *
 * Playback is simulated: a clock runs through the transcript, weighting each
 * segment by its word count, and the spoken segment is highlighted.
 * The player's wave has five drawings (Player › style); "ribbon" is the
 * logo's slanted, round-jointed zigzag.
 * ───────────────────────────────────────────────────────── */

/* Every content icon, as [Lucide flat icon, Apple emoji] (Icons › style).
   Controls (back, play, close, chevrons) stay as glyphs in both styles. */
const ICONS = {
  sunrise: [Sunrise, '🌅'],
  sun: [Sun, '☀️'],
  sunset: [Sunset, '🌇'],
  moon: [Moon, '🌙'],
  duration: [Clock, '⏱️'],
  calendar: [CalendarDays, '📅'],
  clock: [Clock, '🕗'],
  freeform: [AudioLines, '🎙️'],
  dynamic: [Sparkle, '💬'],
  guided: [Compass, '🧭'],
  prompt: [Sparkle, '✨'],
  insights: [Sparkles, '✨'],
  work: [Briefcase, '💼'],
  confidence: [Sprout, '🌱'],
  movement: [Footprints, '👟'],
  goals: [Target, '🎯'],
  sleep: [BedDouble, '🛌'],
  frustration: [Flame, '🔥'],
  nature: [Trees, '🌳'],
  calm: [Wind, '🍃'],
  rest: [Coffee, '☕️'],
  friends: [Users, '🫂'],
  worry: [CloudRain, '🌧️'],
  screens: [Smartphone, '📱'],
  learning: [GraduationCap, '🎓'],
  family: [House, '👪'],
  partner: [HeartHandshake, '💞'],
  money: [Wallet, '💰'],
  home: [House, '🏠'],
  creativity: [Palette, '🎨'],
};

const THEME_LABELS = {
  work: 'Work',
  confidence: 'Confidence',
  movement: 'Movement',
  goals: 'Goals',
  sleep: 'Sleep',
  frustration: 'Frustration',
  nature: 'Outdoors',
  calm: 'Calm',
  rest: 'Rest',
  friends: 'Friendship',
  worry: 'Worry',
  screens: 'Screens',
  learning: 'Learning',
  family: 'Family',
  partner: 'Partner',
  money: 'Money',
  home: 'Home',
  creativity: 'Creativity',
};

const MODE_LABELS = { freeform: 'Freeform', dynamic: 'Dynamic', guided: 'Guided' };

const SCREEN = {
  deviceFrame: true,
  previewScale: [0.7, 0.4, 1.2, 0.01],
  screenHeight: [780, 500, 900, 1],
  screenColor: '#f9f9f9',
  pageColor: '#f5f5f5',
  recordPage: { type: 'select', options: ['voice-dynamic.html', 'voice.html', 'voice-guided.html'], default: 'voice-dynamic.html' },
};

/* Which icon set, and which groups of icons show at all. */
const ICON_DIALS = {
  style: { type: 'select', options: ['flat', 'emoji'], default: 'emoji' },
  time: true,
  duration: true,
  mode: true,
  themes: true,
};

/* The entries header copy. {count} and {time} fill in from the entries. */
const HEADER = {
  eyebrow: { type: 'text', default: 'Your journal' },
  title: { type: 'text', default: 'Entries' },
  stats: { type: 'text', default: '{count} entries, {time} of talking it out' },
};

/* Which parts of an entry card show. Hidden parts take no space, so cards shrink. */
const CARD = {
  time: true,
  duration: true,
  title: true,
  summary: true,
  quote: true,
  mode: true,
  themes: true,
};

/* The welcome screen's two button looks, shared by Record entry and the AI
   button: primary = Get started, glass = I already have an account. */
const BUTTON_LOOKS = { type: 'select', options: ['dark', 'primary', 'glass'], default: 'dark' };
const BUTTON_STYLES = {
  primary: {
    background: '#72bdfa',
    text: '#ffffff',
    strokeColor: '#ffffff',
    strokeOpacity: [0.72, 0, 1, 0.01],
    strokeWidth: [1, 0, 6, 0.5],
  },
  glass: {
    background: '#ffffff',
    opacity: [0.42, 0, 1, 0.01],
    text: '#1f1f1f',
    borderOpacity: [0.6, 0, 1, 0.01],
    blur: [12, 0, 40, 1],
  },
};

const RECORD = {
  label: { type: 'text', default: 'Record entry' },
  look: BUTTON_LOOKS,
  background: '#1c1c1e',
  textColor: '#ffffff',
  dot: true,
  dotColor: '#ff453a',
  height: [56, 36, 84, 1],
  fontSize: [16, 12, 22, 0.5],
  paddingX: [24, 10, 56, 1],
  radius: [28, 0, 42, 1],
  /* From the horizontal centre, and up from the bottom edge. */
  x: [0, -150, 150, 1],
  bottom: [42, 0, 260, 1],
};

const CURVES = {
  ios: 'cubic-bezier(0.32, 0.72, 0, 1)',
  'ease-out': 'cubic-bezier(0.22, 1, 0.36, 1)',
  soft: 'cubic-bezier(0.45, 0, 0.2, 1)',
  linear: 'linear',
};

const TRANSITION = {
  durationMs: [480, 150, 1200, 10],
  curve: { type: 'select', options: Object.keys(CURVES), default: 'ios' },
  /* How far the list drifts left under the incoming entry (% of its width). */
  parallax: [28, 0, 100, 1],
  dim: [0.1, 0, 0.5, 0.01],
  shadow: [0.14, 0, 0.5, 0.01],
  edgeSwipe: true,
};

/* AI insights: the sheet title and the round button's look. */
const AI = {
  title: { type: 'text', default: 'AI insights' },
  button: {
    look: BUTTON_LOOKS,
  },
};

/* The player's wave. `style` picks the drawing; each drawing has its own
   folder. followVoice 0 = even wave, 1 = follows the recording's loudness. */
const WAVE_STYLES = ['ribbon', 'sine', 'bars', 'dots', 'mirror'];
const PLAYER = {
  style: { type: 'select', options: WAVE_STYLES, default: 'ribbon' },
  layout: {
    card: true,
    playSize: [34, 24, 56, 1],
    showTime: true,
    showSpeed: true,
  },
  color: {
    played: '#61A8FD',
    track: '#dde6e9',
    playhead: false,
    playheadColor: '#1f2a2e',
  },
  ribbon: {
    height: [30, 12, 64, 1],
    stroke: [4, 1, 10, 0.1],
    cycles: [14, 3, 40, 0.5],
    amplitude: [0.85, 0.1, 1, 0.01],
    sharpness: [0.8, 0, 1, 0.01],
    slant: [0.45, -1, 1, 0.01],
    followVoice: [0.8, 0, 1, 0.01],
  },
  sine: {
    height: [26, 12, 64, 1],
    stroke: [2, 0.5, 6, 0.1],
    cycles: [24, 3, 60, 0.5],
    amplitude: [0.9, 0.1, 1, 0.01],
    slant: [0, -1, 1, 0.01],
    followVoice: [1, 0, 1, 0.01],
  },
  bars: {
    height: [26, 10, 64, 1],
    count: [48, 12, 120, 1],
    width: [0.5, 0.1, 1, 0.01],
    minHeight: [0.14, 0, 1, 0.01],
    skew: [0, -30, 30, 1],
    round: true,
  },
  dots: {
    height: [22, 10, 64, 1],
    count: [40, 10, 100, 1],
    maxSize: [5, 1, 12, 0.1],
    minSize: [1.4, 0.5, 6, 0.1],
  },
  mirror: {
    height: [26, 10, 64, 1],
    amplitude: [0.95, 0.1, 1, 0.01],
    resolution: [60, 12, 160, 1],
  },
};

/* ── Formatting ────────────────────────────────────────── */
const at = (e) => new Date(e.at);
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/* Always four digits: 6:52 → 06:52. */
const clock = (sec) => `${pad(Math.floor(sec / 60))}:${pad(Math.floor(sec % 60))}`;
const timeOfDay = (d) =>
  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' AM', ' am').replace(' PM', ' pm');
const longDuration = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
};
const totalSpoken = (sec) => {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};
const dayPart = (d) => {
  const h = d.getHours();
  return h < 5 ? 'moon' : h < 11 ? 'sunrise' : h < 17 ? 'sun' : h < 20 ? 'sunset' : 'moon';
};

const promptCount = (e) => e.transcript.filter((s) => s.kind === 'prompt' || s.kind === 'step').length;

function modeLine(e) {
  if (e.mode === 'guided') return `Guided\u2002${e.framework}`;
  if (e.mode === 'dynamic') {
    const n = e.transcript.filter((s) => s.kind === 'prompt' && s.answered).length;
    return `Dynamic\u2002${n} ${n === 1 ? 'prompt' : 'prompts'}`;
  }
  return 'Freeform';
}

/* Newest first: month → day → entries. */
function group(entries) {
  const months = [];
  for (const e of [...entries].sort((a, b) => at(b) - at(a))) {
    const d = at(e);
    const month = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    let m = months.at(-1);
    if (m?.label !== month) months.push((m = { label: month, days: [] }));
    let day = m.days.at(-1);
    if (day?.key !== dayKey(d)) m.days.push((day = { key: dayKey(d), date: d, entries: [] }));
    day.entries.push(e);
  }
  return months;
}

/* Each segment's slice of the recording, by word count. Prompts and steps are
   the short silences where a question sat on screen. */
function timeline(e) {
  const weights = e.transcript.map((s) => (s.kind === 'speech' ? s.text.split(/\s+/).length : 7));
  const total = weights.reduce((a, b) => a + b, 0);
  let t = 0;
  return weights.map((w) => {
    const start = t;
    t += (w / total) * e.duration;
    return { start, end: t };
  });
}

/* ── Icons ─────────────────────────────────────────────── */
const IconCtx = createContext({ style: 'flat', time: true, duration: true, mode: true, themes: true });

/* `group` is the Icons toggle that hides it (time, duration, mode, themes). */
function Ico({ k, group }) {
  const ic = useContext(IconCtx);
  if (group && !ic[group]) return null;
  const [Flat, emoji] = ICONS[k];
  return ic.style === 'emoji' ? (
    <span className="j-emoji" aria-hidden="true">
      {emoji}
    </span>
  ) : (
    <Flat aria-hidden="true" />
  );
}

/* ── Playback ──────────────────────────────────────────── */
function usePlayback(entry) {
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const posRef = useRef(0);
  const duration = entry?.duration ?? 0;

  const seek = useCallback(
    (t) => {
      posRef.current = Math.max(0, Math.min(duration, t));
      setPos(posRef.current);
    },
    [duration],
  );

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      posRef.current = Math.min(duration, posRef.current + ((now - last) / 1000) * speed);
      last = now;
      setPos(posRef.current);
      if (posRef.current >= duration) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, duration]);

  // A new entry starts from the top, stopped.
  useEffect(() => {
    setPlaying(false);
    seek(0);
  }, [entry?.id, seek]);

  return {
    pos,
    playing,
    speed,
    seek,
    toggle: () => {
      if (!playing && posRef.current >= duration) seek(0);
      setPlaying(!playing);
    },
    play: () => setPlaying(true),
    stop: () => setPlaying(false),
    skip: (d) => seek(posRef.current + d),
    cycleSpeed: () => setSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 2 : 1)),
  };
}

/* ── Wave drawings ─────────────────────────────────────── */

/* A stable loudness curve per entry, 0.18–1, quiet at both ends. */
function loudness(id, n = 64) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => (h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296;
  let prev = 0.5;
  return Array.from({ length: n }, (_, i) => {
    prev = prev * 0.45 + rand() * 0.55;
    const taper = Math.min(1, (i + 2) / 5, (n - i + 1) / 5);
    return 0.18 + prev * 0.82 * taper;
  });
}

/* Loudness at u ∈ [0, 1], eased between samples. */
function envAt(v, u) {
  const x = Math.max(0, Math.min(1, u)) * (v.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const b = v[Math.min(i + 1, v.length - 1)];
  return v[i] + (b - v[i]) * f * f * (3 - 2 * f);
}

/* sin → triangle as sharpness goes 0 → 1; the triangle's corners get the
   round joins, like the logo's peaks. */
const waveAt = (phi, sharp) => (1 - sharp) * Math.sin(phi) + sharp * (2 / Math.PI) * Math.asin(Math.sin(phi));

/* A stroked line through the wave; `slant` leans every peak right, as in the logo. */
function linePath(w, h, v, d, sharp) {
  const lean = Math.abs(d.slant) * h * 0.5;
  const x0 = d.stroke / 2 + lean;
  const span = w - 2 * x0;
  const amp = d.amplitude * (h / 2 - d.stroke / 2);
  const n = Math.max(160, Math.round(d.cycles * 18));
  let p = '';
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const edge = Math.min(1, u * 10, (1 - u) * 10);
    const e = (1 - d.followVoice + d.followVoice * envAt(v, u)) * edge;
    const dy = amp * e * waveAt(u * d.cycles * Math.PI * 2, sharp);
    p += `${i ? 'L' : 'M'}${(x0 + u * span + d.slant * dy).toFixed(2)} ${(h / 2 - dy).toFixed(2)}`;
  }
  return p;
}

function waveShape(style, w, h, v, d, color) {
  if (style === 'ribbon' || style === 'sine') {
    return (
      <path
        d={linePath(w, h, v, d, style === 'ribbon' ? d.sharpness : 0)}
        fill="none"
        stroke={color}
        strokeWidth={d.stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  if (style === 'bars') {
    const step = w / d.count;
    const bw = Math.max(1, step * d.width);
    return (
      <g transform={`translate(0 ${h / 2}) skewX(${-d.skew}) translate(0 ${-h / 2})`} fill={color}>
        {Array.from({ length: d.count }, (_, i) => {
          const bh = Math.max(d.minHeight, envAt(v, (i + 0.5) / d.count)) * h;
          return <rect key={i} x={i * step + (step - bw) / 2} y={(h - bh) / 2} width={bw} height={bh} rx={d.round ? bw / 2 : 0.5} />;
        })}
      </g>
    );
  }
  if (style === 'dots') {
    const step = w / d.count;
    return (
      <g fill={color}>
        {Array.from({ length: d.count }, (_, i) => {
          const r = (d.minSize + (d.maxSize - d.minSize) * envAt(v, (i + 0.5) / d.count)) / 2;
          return <circle key={i} cx={i * step + step / 2} cy={h / 2} r={Math.min(r, step / 2, h / 2)} />;
        })}
      </g>
    );
  }
  // mirror: the loudness as a soft filled shape, top and bottom.
  const n = d.resolution;
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n;
    const edge = Math.min(1, u * 12, (1 - u) * 12);
    return [u * w, (d.amplitude * envAt(v, u) * edge * h) / 2];
  });
  const top = pts.map(([x, a], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${(h / 2 - a).toFixed(2)}`).join('');
  const bottom = pts
    .reverse()
    .map(([x, a]) => `L${x.toFixed(2)} ${(h / 2 + a).toFixed(2)}`)
    .join('');
  return <path d={`${top}${bottom}Z`} fill={color} />;
}

function useWidth(ref) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    const ro = new ResizeObserver(() => setW(el.offsetWidth));
    ro.observe(el);
    setW(el.offsetWidth);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/* ── List ──────────────────────────────────────────────── */
function Duration({ sec }) {
  return (
    <span className="j-duration" aria-label={`Duration ${longDuration(sec)}`}>
      <Ico k="duration" group="duration" />
      {clock(sec)}
    </span>
  );
}

function ModeChip({ e, large }) {
  return (
    <span className="j-mode" data-mode={e.mode} data-large={large || undefined}>
      <Ico k={e.mode} group="mode" />
      {modeLine(e)}
    </span>
  );
}

function ThemeIcons({ themes }) {
  const ic = useContext(IconCtx);
  if (!ic.themes) return null;
  return (
    <span className="j-theme-icons">
      {themes.map((k) => (
        <span key={k} className="j-theme-icon" title={THEME_LABELS[k]} aria-label={THEME_LABELS[k]} role="img">
          <Ico k={k} />
        </span>
      ))}
    </span>
  );
}

function EntryCard({ e, onOpen, index, show }) {
  const d = at(e);
  const top = show.time || show.duration;
  const foot = show.mode || show.themes;
  return (
    <button type="button" className="j-card" onClick={() => onOpen(e.id)} style={{ '--i': index }}>
      {top && (
        <span className="j-card-top">
          {show.time && (
            <span className="j-time">
              <Ico k={dayPart(d)} group="time" />
              {timeOfDay(d)}
            </span>
          )}
          {show.duration && <Duration sec={e.duration} />}
        </span>
      )}
      {show.title && <span className="j-title">{e.title}</span>}
      {show.summary && <span className="j-summary">{e.summary}</span>}
      {show.quote && <span className="j-snippet">“{e.snippet}”</span>}
      {foot && (
        <span className="j-card-foot">
          {show.mode && <ModeChip e={e} />}
          {show.themes && <ThemeIcons themes={e.themes} />}
        </span>
      )}
    </button>
  );
}

/* The month bar lives outside the scroller, so once a month label reaches
   it, the bar takes over that label's text and stays perfectly still. */
function useStuckMonth(scrollRef, barRef) {
  const [month, setMonth] = useState(null);
  useEffect(() => {
    const box = scrollRef.current;
    const update = () => {
      const line = barRef.current.offsetTop;
      let label = null;
      for (const el of box.querySelectorAll('.j-month-label')) {
        if (el.offsetTop - box.scrollTop <= line) label = el.textContent;
      }
      setMonth(label);
    };
    update();
    box.addEventListener('scroll', update, { passive: true });
    return () => box.removeEventListener('scroll', update);
  }, [scrollRef, barRef]);
  return month;
}

function List({ months, total, onOpen, recordHref, rec, show, head }) {
  const scrollRef = useRef(null);
  const barRef = useRef(null);
  const stuck = useStuckMonth(scrollRef, barRef);
  let index = 0;
  return (
    <>
      <div className="j-status" aria-hidden="true" />
      <div ref={barRef} className="j-month-label j-month-bar" data-shown={stuck ? true : undefined} aria-hidden="true">
        {stuck}
      </div>
      <div className="j-scroll" ref={scrollRef}>
        <header className="j-head">
          {head.eyebrow && <p className="j-eyebrow">{head.eyebrow}</p>}
          {head.title && <h1 className="j-large-title">{head.title}</h1>}
          {head.stats && (
            <p className="j-stats">
              {head.stats.replaceAll('{count}', ENTRIES.length).replaceAll('{time}', totalSpoken(total))}
            </p>
          )}
        </header>

        {months.map((m) => (
          <section key={m.label} className="j-month" aria-label={m.label}>
            <h2 className="j-month-label">{m.label}</h2>
            {m.days.map((day) => (
              <div key={day.key} className="j-day">
                <div className="j-date" aria-label={day.date.toDateString()}>
                  <span className="j-dow">{day.date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                  <span className="j-dnum">{day.date.getDate()}</span>
                </div>
                <div className="j-day-cards">
                  {day.entries.map((e) => (
                    <EntryCard key={e.id} e={e} onOpen={onOpen} index={index++} show={show} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
        <p className="j-end">That's everything since you started.</p>
      </div>

      <a className="j-record" href={recordHref}>
        {rec.dot && <span className="j-record-dot" aria-hidden="true" />}
        {rec.label}
      </a>
    </>
  );
}

/* ── Detail ────────────────────────────────────────────── */
function Player({ e, pb, p }) {
  const v = useMemo(() => loudness(e.id), [e.id]);
  const waveRef = useRef(null);
  const w = useWidth(waveRef);
  const d = p[p.style];
  const h = d.height;
  const progress = pb.pos / e.duration;
  const started = pb.playing || pb.pos > 0;

  function seekTo(ev) {
    const r = waveRef.current.getBoundingClientRect();
    pb.seek(((ev.clientX - r.left) / r.width) * e.duration);
  }

  return (
    <section
      className="j-player"
      data-card={p.layout.card || undefined}
      aria-label="Recording"
      style={{ '--play-size': `${p.layout.playSize}px` }}
    >
      <button type="button" className="j-play" onClick={pb.toggle} aria-label={pb.playing ? 'Pause' : 'Play'}>
        {pb.playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </button>
      <div
        ref={waveRef}
        className="j-wave"
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={e.duration}
        aria-valuenow={Math.round(pb.pos)}
        aria-valuetext={`${clock(pb.pos)} of ${clock(e.duration)}`}
        style={{ height: h }}
        onPointerDown={(ev) => {
          ev.currentTarget.setPointerCapture(ev.pointerId);
          seekTo(ev);
        }}
        onPointerMove={(ev) => ev.buttons && seekTo(ev)}
        onKeyDown={(ev) => {
          if (ev.key === 'ArrowRight') pb.skip(5);
          if (ev.key === 'ArrowLeft') pb.skip(-5);
        }}
      >
        {w > 0 && (
          <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
            <defs>
              <clipPath id="j-played">
                <rect x={-20} y={-20} width={progress * w + 20} height={h + 40} />
              </clipPath>
            </defs>
            {waveShape(p.style, w, h, v, d, p.color.track)}
            <g clipPath="url(#j-played)">{waveShape(p.style, w, h, v, d, p.color.played)}</g>
            {p.color.playhead && started && (
              <line
                x1={progress * w}
                x2={progress * w}
                y1={1}
                y2={h - 1}
                stroke={p.color.playheadColor}
                strokeWidth={2}
                strokeLinecap="round"
              />
            )}
          </svg>
        )}
      </div>
      {p.layout.showTime && <span className="j-ptime">{clock(started ? pb.pos : e.duration)}</span>}
      {p.layout.showSpeed && (
        <button type="button" className="j-speed" onClick={pb.cycleSpeed} aria-label="Playback speed">
          {pb.speed}×
        </button>
      )}
    </section>
  );
}

function Prompts({ e, onJump }) {
  const guided = e.mode === 'guided';
  const items = e.transcript.map((s, i) => ({ ...s, i })).filter((s) => s.kind === 'prompt' || s.kind === 'step');
  if (!items.length) return null;
  return (
    <section className="j-section">
      <h3 className="j-section-label">
        {guided ? `${e.framework}\u2002${items.length} steps` : `Prompts offered\u2002${items.length}`}
      </h3>
      <ol className="j-prompts" data-guided={guided || undefined}>
        {items.map((s, n) => (
          <li key={s.i}>
            <button type="button" onClick={() => onJump(s.i)} data-skipped={s.answered === false || undefined}>
              <span className="j-prompt-mark">{guided ? n + 1 : <Ico k="prompt" />}</span>
              <span className="j-prompt-body">
                {guided && <span className="j-step-label">{s.label}</span>}
                <span className="j-prompt-text">{s.text}</span>
                {s.answered === false && <span className="j-skipped">Not answered</span>}
              </span>
              <ChevronRight className="j-prompt-go" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Transcript({ e, pb, segRefs }) {
  const times = useMemo(() => timeline(e), [e]);
  const active = times.findIndex((t) => pb.pos >= t.start && pb.pos < t.end);
  const started = pb.pos > 0;
  return (
    <section className="j-section">
      <h3 className="j-section-label">Transcript</h3>
      <div className="j-transcript" data-following={started || undefined}>
        {e.transcript.map((s, i) => (
          <div
            key={i}
            ref={(el) => (segRefs.current[i] = el)}
            className={`j-seg ${s.kind}`}
            data-active={(started && i === active) || undefined}
            data-skipped={s.answered === false || undefined}
            onClick={() => {
              pb.seek(times[i].start);
              pb.play();
            }}
          >
            {s.kind === 'speech' && <p>{s.text}</p>}
            {s.kind === 'prompt' && (
              <p className="j-seg-q">
                <Ico k="prompt" group="mode" />
                {s.text}
                {s.answered === false && <em>{'\u2002'}faded, not answered</em>}
              </p>
            )}
            {s.kind === 'step' && (
              <>
                <span className="j-step-label">{s.label}</span>
                <p className="j-seg-q">{s.text}</p>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function InsightsSheet({ e, open, onClose, onOpenEntry, title }) {
  const links = e.insights.links.map((id) => ENTRIES.find((x) => x.id === id)).filter(Boolean);
  return (
    <div className="j-sheet-host" data-open={open || undefined} aria-hidden={!open}>
      <button type="button" className="j-scrim" onClick={onClose} tabIndex={-1} aria-label="Close insights" />
      <section className="j-sheet" role="dialog" aria-label={title}>
        <div className="j-sheet-grab" aria-hidden="true" />
        <header className="j-sheet-head">
          <span className="j-ai-badge">
            <Ico k="insights" />
            {title}
          </span>
          <button type="button" className="ctl j-sheet-close" onClick={onClose} aria-label="Close" tabIndex={open ? 0 : -1}>
            <X aria-hidden="true" />
          </button>
        </header>
        <ul className="j-insights">
          {e.insights.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <h3 className="j-section-label">Connected entries</h3>
        <div className="j-links">
          {links.map((x) => (
            <button key={x.id} type="button" className="j-link" onClick={() => onOpenEntry(x.id)} tabIndex={open ? 0 : -1}>
              <span className="j-link-date">
                {at(x).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <span className="j-link-title">{x.title}</span>
              <ChevronRight aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function Detail({ e, pb, p, onBack, onOpenEntry, scrollRef, aiTitle }) {
  const [insights, setInsights] = useState(false);
  const segRefs = useRef([]);
  const ic = useContext(IconCtx);
  const d = at(e);

  useEffect(() => setInsights(false), [e.id]);

  function jump(i) {
    const el = segRefs.current[i];
    const box = scrollRef.current;
    if (!el || !box) return;
    box.scrollTo({ top: el.offsetTop - 140, behavior: 'smooth' });
    el.animate([{ background: 'rgba(97, 168, 253, 0.16)' }, { background: 'rgba(97, 168, 253, 0)' }], { duration: 1400, delay: 350 });
  }

  return (
    <>
      <nav className="j-nav">
        <button type="button" className="ctl" onClick={onBack} aria-label="Back to entries">
          <ChevronLeft aria-hidden="true" />
        </button>
        <span className="j-nav-title">
          {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{'\u2002'}{timeOfDay(d)}
        </span>
        <span aria-hidden="true" />
      </nav>

      <div className="j-scroll" ref={scrollRef}>
        <Player e={e} pb={pb} p={p} />

        <header className="j-detail-head">
          <ModeChip e={e} large />
          <h1 className="j-detail-title">{e.title}</h1>
          <dl className="j-meta" data-icons={ic.time || undefined}>
            <div>
              <dt>{ic.time ? <Ico k="calendar" /> : 'Date'}</dt>
              <dd>{d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</dd>
            </div>
            <div>
              <dt>{ic.time ? <Ico k="clock" /> : 'Time'}</dt>
              <dd>
                {timeOfDay(d)}{'\u2002'}<span className="j-meta-soft">{longDuration(e.duration)} spoken</span>
              </dd>
            </div>
          </dl>
          <div className="j-theme-chips">
            {e.themes.map((k) => (
              <span key={k} className="j-theme-chip">
                <Ico k={k} group="themes" />
                {THEME_LABELS[k]}
              </span>
            ))}
          </div>
        </header>

        <section className="j-section">
          <h3 className="j-section-label">Summary</h3>
          <p className="j-detail-summary">{e.summary}</p>
        </section>

        <Prompts e={e} onJump={jump} />
        <Transcript e={e} pb={pb} segRefs={segRefs} />
        <p className="j-end">
          {promptCount(e) ? `${modeLine(e)}\u2002` : ''}
          {longDuration(e.duration)}
        </p>
      </div>

      <button type="button" className="j-ai" onClick={() => setInsights(true)} aria-label={aiTitle}>
        <Ico k="insights" />
      </button>

      <InsightsSheet e={e} open={insights} onClose={() => setInsights(false)} onOpenEntry={onOpenEntry} title={aiTitle} />
    </>
  );
}

/* ── Screen ────────────────────────────────────────────── */
function Entries() {
  const s = useDialKit('Screen', SCREEN, { id: 'entries-screen' });
  const icons = useDialKit('Icons', ICON_DIALS, { id: 'entries-icons' });
  const head = useDialKit('Header', HEADER, { id: 'entries-header' });
  const show = useDialKit('Entry card', CARD, { id: 'entries-card' });
  const bs = useDialKit('Button styles', BUTTON_STYLES, { id: 'entries-button-styles' });
  const rec = useDialKit('Record button', RECORD, { id: 'entries-record' });
  const p = useDialKit('Player', PLAYER, { id: 'entries-player' });
  const ai = useDialKit('AI insights', AI, { id: 'entries-ai' });
  const tr = useDialKit('Transition', TRANSITION, { id: 'entries-transition', defaultCollapsed: true });

  const months = useMemo(() => group(ENTRIES), []);
  const total = ENTRIES.reduce((a, e) => a + e.duration, 0);

  const [view, setView] = useState('list');
  const [openId, setOpenId] = useState(ENTRIES[0].id);
  const entry = ENTRIES.find((e) => e.id === openId);
  const pb = usePlayback(entry);
  const detailScroll = useRef(null);
  const stackRef = useRef(null);
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);

  const open = useCallback((id) => {
    setOpenId(id);
    requestAnimationFrame(() => detailScroll.current?.scrollTo({ top: 0 }));
    setView('detail');
  }, []);

  const back = useCallback(() => {
    pb.stop();
    setView('list');
  }, [pb]);

  /* Edge swipe: drag the entry off to the right to go back. */
  function onPointerDown(ev) {
    if (!tr.edgeSwipe || view !== 'detail') return;
    const r = stackRef.current.getBoundingClientRect();
    if (ev.clientX - r.left > 28 * (r.width / 390)) return;
    drag.current = { x: ev.clientX, w: r.width, t: performance.now(), p: 0 };
    ev.currentTarget.setPointerCapture(ev.pointerId);
    ev.preventDefault(); // no text selection or autoscroll while swiping
    setDragging(true);
  }
  function onPointerMove(ev) {
    const g = drag.current;
    if (!g) return;
    g.p = Math.max(0, Math.min(1, (ev.clientX - g.x) / g.w));
    stackRef.current.style.setProperty('--drag', g.p);
  }
  function onPointerUp() {
    const g = drag.current;
    if (!g) return;
    drag.current = null;
    const speed = g.p / ((performance.now() - g.t) / 1000);
    setDragging(false);
    stackRef.current.style.setProperty('--drag', 0);
    if (g.p > 0.35 || (g.p > 0.08 && speed > 1.2)) back();
  }

  const framed = s.deviceFrame;
  const screenH = framed ? FRAMED_SCREEN_H : s.screenHeight;
  const deviceW = framed ? FRAME.w * FRAME_K : 390;
  const deviceH = framed ? FRAME.h * FRAME_K : screenH;

  return (
    <main className="stage" style={{ background: s.pageColor }}>
      <Backdrop />
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
            '--safe-top': framed ? `${FRAMED_SAFE_TOP}px` : '0px',
          }}
        >
          {framed && <div className="screen-fill" style={{ height: screenH, background: s.screenColor }} />}
          <IconCtx.Provider value={icons}>
            <section
              className="voice-screen journal"
              data-rec-look={rec.look}
              data-ai-look={ai.button.look}
              data-icons={icons.style}
              aria-label="Journal entries"
              style={{
                height: screenH,
                background: s.screenColor,
                '--screen-bg': s.screenColor,
                '--rec-bg': rec.background,
                '--rec-fg': rec.textColor,
                '--rec-dot': rec.dotColor,
                '--rec-h': `${rec.height}px`,
                '--rec-font': `${rec.fontSize}px`,
                '--rec-pad': `${rec.paddingX}px`,
                '--rec-radius': `${rec.radius}px`,
                '--rec-x': `${rec.x}px`,
                '--rec-bottom': `${rec.bottom}px`,
                '--btn-p-bg': bs.primary.background,
                '--btn-p-fg': bs.primary.text,
                '--btn-p-stroke': `color-mix(in srgb, ${bs.primary.strokeColor} ${bs.primary.strokeOpacity * 100}%, transparent)`,
                '--btn-p-stroke-w': `${bs.primary.strokeWidth}px`,
                '--btn-g-bg': `color-mix(in srgb, ${bs.glass.background} ${bs.glass.opacity * 100}%, transparent)`,
                '--btn-g-fg': bs.glass.text,
                '--btn-g-border': `rgba(255, 255, 255, ${bs.glass.borderOpacity})`,
                '--btn-g-blur': `${bs.glass.blur}px`,
              }}
            >
              <div
                ref={stackRef}
                className="j-stack"
                data-view={view}
                data-dragging={dragging || undefined}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                style={{
                  '--push-ms': `${tr.durationMs}ms`,
                  '--push-ease': CURVES[tr.curve],
                  '--parallax': `${tr.parallax}%`,
                  '--dim': tr.dim,
                  '--push-shadow': tr.shadow,
                }}
              >
                <div className="j-layer j-list" inert={view === 'detail' || undefined}>
                  <List months={months} total={total} onOpen={open} recordHref={`/${s.recordPage}`} rec={rec} show={show} head={head} />
                </div>
                <div className="j-layer j-detail" inert={view === 'list' || undefined}>
                  <Detail e={entry} pb={pb} p={p} onBack={back} onOpenEntry={open} scrollRef={detailScroll} aiTitle={ai.title} />
                </div>
              </div>
              <HeaderWave />
            </section>
          </IconCtx.Provider>
          <StatusBar height={screenH} />
          {framed && <img className="iphone-frame" src={iphoneFrameUrl} alt="" draggable={false} />}
        </div>
      </div>

      <DialRoot position="top-right" productionEnabled theme="light" />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Entries />);
