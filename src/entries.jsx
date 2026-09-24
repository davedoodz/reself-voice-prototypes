import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { VoiceBeam } from 'voice-glow';
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
  RotateCcw,
  RotateCw,
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
import { BEAM, FRAME, FRAME_K, FRAMED_RADIUS, FRAMED_SAFE_TOP, FRAMED_SCREEN_H, beamProps } from './recorder.jsx';
import { ENTRIES } from './entries-data.js';

/* ─────────────────────────────────────────────────────────
 * UNWIND — journal entries
 *
 * Two screens in one navigation stack:
 *   LIST    every entry, newest first, grouped by month then day. The day
 *           column sticks while its cards scroll, so the date is always
 *           in view. Record entry floats over the glow at the bottom.
 *   DETAIL  tap a card → it pushes in from the right while the list slides
 *           a little left and dims (Transition › parallax, dim). Back, or a
 *           drag from the left edge, pops it again.
 *
 * The glow is the same VoiceBeam as the recorder: it breathes at rest on the
 * list and speaks again while an entry plays back (Glow panel).
 * Playback is simulated: a clock runs through the transcript, weighting each
 * segment by its word count, and the spoken segment is highlighted.
 * ───────────────────────────────────────────────────────── */

const THEMES = {
  work: ['Work', Briefcase],
  confidence: ['Confidence', Sprout],
  movement: ['Movement', Footprints],
  goals: ['Goals', Target],
  sleep: ['Sleep', BedDouble],
  frustration: ['Frustration', Flame],
  nature: ['Outdoors', Trees],
  calm: ['Calm', Wind],
  rest: ['Rest', Coffee],
  friends: ['Friendship', Users],
  worry: ['Worry', CloudRain],
  screens: ['Screens', Smartphone],
  learning: ['Learning', GraduationCap],
  family: ['Family', House],
  partner: ['Partner', HeartHandshake],
  money: ['Money', Wallet],
  home: ['Home', House],
  creativity: ['Creativity', Palette],
};

const MODES = {
  freeform: { label: 'Freeform', Icon: AudioLines },
  dynamic: { label: 'Dynamic', Icon: Sparkle },
  guided: { label: 'Guided', Icon: Compass },
};

const SCREEN = {
  deviceFrame: true,
  previewScale: [0.7, 0.4, 1.2, 0.01],
  screenHeight: [780, 500, 900, 1],
  screenColor: '#f9f9f9',
  pageColor: '#f5f5f5',
  recordPage: { type: 'select', options: ['voice-dynamic.html', 'voice.html', 'voice-guided.html'], default: 'voice-dynamic.html' },
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

const GLOW = {
  restLevel: [0.16, 0, 1, 0.01],
  breatheSec: [7, 2, 16, 0.1],
  playLevel: [0.8, 0, 1, 0.01],
  /* The glow drops back to rest on the detail screen unless audio plays. */
  showOnDetail: true,
};

/* ── Formatting ────────────────────────────────────────── */
const TODAY = new Date('2026-09-24T12:00');
const at = (e) => new Date(e.at);
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const clock = (sec) => `${Math.floor(sec / 60)}:${pad(Math.floor(sec % 60))}`;
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

function relativeDay(d) {
  const days = Math.round((new Date(dayKey(TODAY)) - new Date(dayKey(d))) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'Last week';
  return `${Math.floor(days / 7)} weeks ago`;
}

function DayPartIcon({ d }) {
  const h = d.getHours();
  const Icon = h < 5 ? Moon : h < 11 ? Sunrise : h < 17 ? Sun : h < 20 ? Sunset : Moon;
  return <Icon aria-hidden="true" />;
}

const promptCount = (e) => e.transcript.filter((s) => s.kind === 'prompt' || s.kind === 'step').length;

function modeLine(e) {
  if (e.mode === 'guided') return `Guided · ${e.framework}`;
  if (e.mode === 'dynamic') {
    const n = e.transcript.filter((s) => s.kind === 'prompt' && s.answered).length;
    return `Dynamic · ${n} ${n === 1 ? 'prompt' : 'prompts'}`;
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

/* A stable waveform per entry, so the same entry always looks the same. */
function waveform(id, n = 54) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296);
  let prev = 0.5;
  return Array.from({ length: n }, (_, i) => {
    prev = prev * 0.45 + rand() * 0.55;
    const taper = Math.min(1, (i + 2) / 5, (n - i + 1) / 5);
    return 0.18 + prev * 0.82 * taper;
  });
}

/* ── Playback ──────────────────────────────────────────── */
function usePlayback(entry) {
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const posRef = useRef(0);
  const playingRef = useRef(false);
  const duration = entry?.duration ?? 0;

  const seek = useCallback(
    (t) => {
      posRef.current = Math.max(0, Math.min(duration, t));
      setPos(posRef.current);
    },
    [duration],
  );

  useEffect(() => {
    playingRef.current = playing;
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
    posRef,
    playingRef,
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

/* ── List ──────────────────────────────────────────────── */
function Duration({ sec, max }) {
  return (
    <span className="j-duration" aria-label={`Duration ${longDuration(sec)}`}>
      <span className="j-meter" aria-hidden="true">
        <span style={{ width: `${Math.max(8, (sec / max) * 100)}%` }} />
      </span>
      {clock(sec)}
    </span>
  );
}

function ModeChip({ e, large }) {
  const { Icon } = MODES[e.mode];
  return (
    <span className="j-mode" data-mode={e.mode} data-large={large || undefined}>
      <Icon aria-hidden="true" />
      {modeLine(e)}
    </span>
  );
}

function ThemeIcons({ themes }) {
  return (
    <span className="j-theme-icons">
      {themes.map((k) => {
        const [label, Icon] = THEMES[k];
        return (
          <span key={k} className="j-theme-icon" title={label} aria-label={label} role="img">
            <Icon aria-hidden="true" />
          </span>
        );
      })}
    </span>
  );
}

function EntryCard({ e, max, onOpen, index }) {
  const d = at(e);
  return (
    <button type="button" className="j-card" onClick={() => onOpen(e.id)} style={{ '--i': index }}>
      <span className="j-card-top">
        <span className="j-time">
          <DayPartIcon d={d} />
          {timeOfDay(d)}
        </span>
        <Duration sec={e.duration} max={max} />
      </span>
      <span className="j-title">{e.title}</span>
      <span className="j-summary">{e.summary}</span>
      <span className="j-snippet">“{e.snippet}”</span>
      <span className="j-card-foot">
        <ModeChip e={e} />
        <ThemeIcons themes={e.themes} />
      </span>
    </button>
  );
}

function List({ months, max, total, onOpen, recordHref }) {
  let index = 0;
  return (
    <div className="j-scroll">
      <header className="j-head">
        <p className="j-eyebrow">Your journal</p>
        <h1 className="j-large-title">Entries</h1>
        <p className="j-stats">
          {ENTRIES.length} entries · {totalSpoken(total)} of talking it out
        </p>
      </header>

      {months.map((m) => (
        <section key={m.label} className="j-month" aria-label={m.label}>
          <h2 className="j-month-label">{m.label}</h2>
          {m.days.map((day) => (
            <div key={day.key} className="j-day">
              <div className="j-date" aria-label={day.date.toDateString()}>
                <span className="j-dow">{day.date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                <span className="j-dnum">{day.date.getDate()}</span>
                <span className="j-rel">{relativeDay(day.date)}</span>
              </div>
              <div className="j-day-cards">
                {day.entries.map((e) => (
                  <EntryCard key={e.id} e={e} max={max} onOpen={onOpen} index={index++} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
      <p className="j-end">That's everything since you started.</p>

      <a className="j-record" href={recordHref}>
        <span className="j-record-dot" aria-hidden="true" />
        Record entry
      </a>
    </div>
  );
}

/* ── Detail ────────────────────────────────────────────── */
function Player({ e, pb }) {
  const bars = useMemo(() => waveform(e.id), [e.id]);
  const waveRef = useRef(null);
  const progress = pb.pos / e.duration;

  function seekTo(ev) {
    const r = waveRef.current.getBoundingClientRect();
    pb.seek(((ev.clientX - r.left) / r.width) * e.duration);
  }

  return (
    <section className="j-player" aria-label="Recording">
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
        {bars.map((v, i) => (
          <span key={i} data-on={i / bars.length < progress || undefined} style={{ height: `${v * 100}%` }} />
        ))}
        <i className="j-playhead" style={{ left: `${progress * 100}%` }} />
      </div>
      <div className="j-times">
        <span>{clock(pb.pos)}</span>
        <span>-{clock(e.duration - pb.pos)}</span>
      </div>
      <div className="j-transport">
        <button type="button" className="j-speed" onClick={pb.cycleSpeed} aria-label="Playback speed">
          {pb.speed}×
        </button>
        <button type="button" className="j-skip" onClick={() => pb.skip(-15)} aria-label="Back 15 seconds">
          <RotateCcw aria-hidden="true" />
          <small>15</small>
        </button>
        <button type="button" className="j-play" onClick={pb.toggle} aria-label={pb.playing ? 'Pause' : 'Play'}>
          {pb.playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
        <button type="button" className="j-skip" onClick={() => pb.skip(15)} aria-label="Forward 15 seconds">
          <RotateCw aria-hidden="true" />
          <small>15</small>
        </button>
        <span className="j-speed-spacer" aria-hidden="true" />
      </div>
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
        {guided ? `${e.framework} · ${items.length} steps` : `Prompts offered · ${items.length}`}
      </h3>
      <ol className="j-prompts">
        {items.map((s, n) => (
          <li key={s.i}>
            <button type="button" onClick={() => onJump(s.i)} data-skipped={s.answered === false || undefined}>
              <span className="j-prompt-mark">{guided ? n + 1 : <Sparkle aria-hidden="true" />}</span>
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
                <Sparkle aria-hidden="true" />
                {s.text}
                {s.answered === false && <em> · faded, not answered</em>}
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

function InsightsSheet({ e, open, onClose, onOpenEntry }) {
  const links = e.insights.links.map((id) => ENTRIES.find((x) => x.id === id)).filter(Boolean);
  return (
    <div className="j-sheet-host" data-open={open || undefined} aria-hidden={!open}>
      <button type="button" className="j-scrim" onClick={onClose} tabIndex={-1} aria-label="Close insights" />
      <section className="j-sheet" role="dialog" aria-label="AI insights">
        <div className="j-sheet-grab" aria-hidden="true" />
        <header className="j-sheet-head">
          <span className="j-ai-badge">
            <Sparkles aria-hidden="true" />
            AI insights
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

function Detail({ e, pb, onBack, onOpenEntry, scrollRef }) {
  const [insights, setInsights] = useState(false);
  const segRefs = useRef([]);
  const d = at(e);

  useEffect(() => setInsights(false), [e.id]);

  function jump(i) {
    const el = segRefs.current[i];
    const box = scrollRef.current;
    if (!el || !box) return;
    box.scrollTo({ top: el.offsetTop - 140, behavior: 'smooth' });
    el.animate([{ background: 'rgba(95, 179, 184, 0.16)' }, { background: 'rgba(95, 179, 184, 0)' }], { duration: 1400, delay: 350 });
  }

  const insightCount = e.insights.lines.length;
  const linkCount = e.insights.links.length;

  return (
    <>
      <nav className="j-nav">
        <button type="button" className="ctl" onClick={onBack} aria-label="Back to entries">
          <ChevronLeft aria-hidden="true" />
        </button>
        <span className="j-nav-title">
          {relativeDay(d)} · {timeOfDay(d)}
        </span>
        <span className="j-nav-spacer" aria-hidden="true" />
      </nav>

      <div className="j-scroll" ref={scrollRef}>
        <Player e={e} pb={pb} />

        <header className="j-detail-head">
          <ModeChip e={e} large />
          <h1 className="j-detail-title">{e.title}</h1>
          <dl className="j-meta">
            <div>
              <dt>
                <CalendarDays aria-label="Date" />
              </dt>
              <dd>{d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</dd>
            </div>
            <div>
              <dt>
                <Clock aria-label="Time" />
              </dt>
              <dd>
                {timeOfDay(d)} <span className="j-meta-soft">· {longDuration(e.duration)} spoken</span>
              </dd>
            </div>
          </dl>
          <div className="j-theme-chips">
            {e.themes.map((k) => {
              const [label, Icon] = THEMES[k];
              return (
                <span key={k} className="j-theme-chip">
                  <Icon aria-hidden="true" />
                  {label}
                </span>
              );
            })}
          </div>
        </header>

        <section className="j-section">
          <h3 className="j-section-label">Summary</h3>
          <p className="j-detail-summary">{e.summary}</p>
        </section>

        <Prompts e={e} onJump={jump} />
        <Transcript e={e} pb={pb} segRefs={segRefs} />
        <p className="j-end">
          {promptCount(e) ? `${modeLine(e)} · ` : ''}
          {longDuration(e.duration)}
        </p>
      </div>

      <button type="button" className="j-ai" onClick={() => setInsights(true)}>
        <span className="j-ai-icon" aria-hidden="true">
          <Sparkles />
        </span>
        <span className="j-ai-text">
          <strong>AI insights</strong>
          <small>
            {insightCount} insights · {linkCount} connected entries
          </small>
        </span>
        <ChevronRight className="j-ai-go" aria-hidden="true" />
      </button>

      <InsightsSheet e={e} open={insights} onClose={() => setInsights(false)} onOpenEntry={onOpenEntry} />
    </>
  );
}

/* ── Screen ────────────────────────────────────────────── */
function Entries() {
  const s = useDialKit('Screen', SCREEN, { id: 'entries-screen' });
  const tr = useDialKit('Transition', TRANSITION, { id: 'entries-transition' });
  const glow = useDialKit('Glow', GLOW, { id: 'entries-glow' });
  const b = useDialKit('Voice beam', BEAM, { id: 'entries-beam', defaultCollapsed: true });

  const months = useMemo(() => group(ENTRIES), []);
  const max = Math.max(...ENTRIES.map((e) => e.duration));
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

  /* The glow: a slow breath at rest; while an entry plays, it follows a
     speech-like envelope, and falls quiet during a prompt's silence. */
  const live = useRef({});
  live.current = { glow, view, pb, entry };
  const getLevel = useCallback(() => {
    const { glow: g, view: v, pb: p, entry: e } = live.current;
    const sec = performance.now() / 1000;
    const breath = g.restLevel * (0.55 + 0.45 * Math.sin((sec / g.breatheSec) * Math.PI * 2));
    if (v === 'detail' && !g.showOnDetail) return 0;
    if (v !== 'detail' || !p.playingRef.current) return breath;
    const times = timeline(e);
    const i = times.findIndex((t) => p.posRef.current >= t.start && p.posRef.current < t.end);
    if (e.transcript[i]?.kind !== 'speech') return breath;
    const syll = Math.abs(Math.sin(sec * 9.3)) * 0.55 + Math.abs(Math.sin(sec * 3.7 + 1)) * 0.45;
    return Math.max(breath, g.playLevel * (0.35 + 0.65 * syll));
  }, []);

  /* Edge swipe: drag the entry off to the right to go back. */
  function onPointerDown(ev) {
    if (!tr.edgeSwipe || view !== 'detail') return;
    const r = stackRef.current.getBoundingClientRect();
    if (ev.clientX - r.left > 28 * (r.width / 390)) return;
    drag.current = { x: ev.clientX, w: r.width, t: performance.now(), p: 0 };
    ev.currentTarget.setPointerCapture(ev.pointerId);
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
  const beam = beamProps(b);

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
            '--safe-top': framed ? `${FRAMED_SAFE_TOP}px` : '0px',
          }}
        >
          {framed && <div className="screen-fill" style={{ height: screenH, background: s.screenColor }} />}
          <VoiceBeam className="beam-host" level={getLevel} {...beam}>
            <section
              className="voice-screen journal"
              aria-label="Journal entries"
              style={{ height: screenH, background: s.screenColor, '--screen-bg': s.screenColor }}
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
                  <List months={months} max={max} total={total} onOpen={open} recordHref={`/${s.recordPage}`} />
                </div>
                <div className="j-layer j-detail" inert={view === 'list' || undefined}>
                  <Detail e={entry} pb={pb} onBack={back} onOpenEntry={open} scrollRef={detailScroll} />
                </div>
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

createRoot(document.getElementById('root')).render(<Entries />);
