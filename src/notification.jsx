import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DialRoot, useDialKit } from 'dialkit';
import 'dialkit/styles.css';
import './voice.css';
import './notification.css';
import watchUrl from '../iphone_asset/Apple Watch Series 7 - 45mm - Starlight.png';
import momoFloating from '../momo-animations/momo-floating.webm';
import momoListening from '../momo-animations/momo-listening.webm';
import { Backdrop } from './backdrop.jsx';
import { Heart, Wind } from 'lucide-react';

/* ─────────────────────────────────────────────────────────
 * Notification: the watch senses a stress spike and Momo offers a voice entry.
 * Five looped designs (Design › style), all in the brand blue, each running
 *   face → sense → ask → (hold) → back to face, forever.
 *   glance   Momo rests under the time; the vitals line glows blue; the prompt slides up
 *   rise     Momo floats up from below, grows to centre stage, then asks
 *   breathe  a blue ring breathes around Momo, quickens on the spike, then settles to ask
 *   pulse    a heart-rate line runs across the face, turns jagged, then smooths into Momo
 *   peek     Momo peeks up from the bottom edge with a speech bubble that holds the ask
 * Yes opens a recorder; "I'd rather not" shows a kind note and the loop carries on.
 * ───────────────────────────────────────────────────────── */

/* iphone_asset/Apple Watch … Starlight.png: 540×860, screen cut-out at
   x 72–467, y 193–671 (396×479). */
const WATCH = { w: 540, h: 860, x: 72, y: 193, screenW: 396, screenH: 479 };

const DESIGNS = [
  { value: 'glance', label: '1 · Glance' },
  { value: 'rise', label: '2 · Rise' },
  { value: 'breathe', label: '3 · Breathe' },
  { value: 'pulse', label: '4 · Pulse line' },
  { value: 'peek', label: '5 · Peek' },
];

const CONFIG = {
  design: { type: 'select', options: DESIGNS, default: 'glance' },
  /* The watch lock screen shown before the spike (works with every design). */
  face: {
    type: 'select',
    options: [
      { value: 'classic', label: '1 · Classic' },
      { value: 'modular', label: '2 · Modular' },
      { value: 'stacked', label: '3 · Stacked' },
      { value: 'minimal', label: '4 · Minimal' },
      { value: 'analog', label: '5 · Analog' },
      { value: 'tall-trio', label: '6 · Tall · three circles' },
      { value: 'tall-momo', label: '7 · Tall · Momo circle' },
      { value: 'tall-split', label: '8 · Tall · split' },
      { value: 'tall-gauge', label: '9 · Tall · calm gauge' },
      { value: 'tall-graph', label: '10 · Tall · heart graph' },
      { value: 'smart-stack', label: '11 · Smart Stack (card on spike)' },
    ],
    default: 'classic',
  },
  /* Tall faces and Smart Stack: brand blue, or white with dark circles. */
  faceTint: { type: 'select', options: ['blue', 'white'], default: 'blue' },
  scale: [0.8, 0.4, 1.4, 0.01],
  screenRadius: [70, 0, 120, 1],
  /* How far the black extends past the screen, under the frame. */
  bleed: [18, 0, 60, 1],
  timing: {
    /* Screen off (black) before the notification wakes it; 0 skips it. */
    offMs: [1500, 0, 8000, 50],
    /* The rest are measured from the moment the screen wakes. */
    senseMs: [1400, 0, 8000, 50],
    askMs: [3000, 0, 10000, 50],
    /* How long the ask stays before the loop starts over. */
    holdMs: [4500, 1000, 15000, 100],
    loop: true,
    moveMs: [700, 100, 2000, 10],
  },
  momo: {
    size: [120, 40, 260, 1],
    /* Momo listens (eyes open) while asking. */
    listenOnAsk: true,
  },
  copy: {
    greeting: 'Hey, how’s it going?',
    body: 'I noticed you seemed a little stressed not long ago. Want to talk about it?',
    yes: 'Yes',
    no: 'I’d rather not',
    declined: 'No problem. I’m here if you need me.',
    vitals: 'HRV 38 ms · 104 bpm',
  },
  look: {
    accent: '#61A8FD',
    soft: '#9fc9fe',
    textSize: [24, 16, 36, 0.5],
    bodySize: [19, 14, 30, 0.5],
  },
  yesPage: { type: 'select', options: ['voice.html', 'voice-guided.html', 'voice-dynamic.html'], default: 'voice.html' },
  replay: { type: 'action', label: 'Replay' },
};

function Momo({ listening }) {
  return (
    <span className="nm-momo" data-listening={listening || undefined} aria-hidden="true">
      <video className="nm-float" src={momoFloating} autoPlay loop muted playsInline />
      <video className="nm-listen" src={momoListening} autoPlay loop muted playsInline />
    </span>
  );
}

/* A heart-rate line: steady, then jagged on the spike. */
function PulseLine({ spiking }) {
  const pts = Array.from({ length: 41 }, (_, i) => {
    const x = i * 10;
    const beat = i % 8 === 4 ? (spiking ? -46 : -22) : i % 8 === 5 ? (spiking ? 30 : 12) : spiking ? (i % 2 ? -6 : 6) : 0;
    return `${x},${50 + beat}`;
  });
  return (
    <svg className="nm-line" viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts.join(' ')} />
    </svg>
  );
}

/* Lock screen faces. Each keeps a .nm-vitals line so the spike can light it up. */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* Circular complications, in the brand blue on a tinted disc. */
const Circle = ({ children, className = '' }) => <span className={`nfc ${className}`}>{children}</span>;
function Rings() {
  const arc = (r, pct) => {
    const c = 2 * Math.PI * r;
    return <circle r={r} strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90)" />;
  };
  return (
    <svg className="nfc-rings" viewBox="-50 -50 100 100" aria-hidden="true">
      <g className="nfc-track"><circle r="38" /><circle r="27" /><circle r="16" /></g>
      <g className="nfc-fill">{arc(38, 0.72)}{arc(27, 0.55)}{arc(16, 0.86)}</g>
    </svg>
  );
}
function Gauge({ value, lo, hi, pct }) {
  const r = 38, c = 2 * Math.PI * r, span = 0.75;
  return (
    <span className="nfc-gauge">
      <svg viewBox="-50 -50 100 100" aria-hidden="true">
        <circle className="nfc-track" r={r} strokeDasharray={`${c * span} ${c}`} transform="rotate(135)" />
        <circle className="nfc-fill" r={r} strokeDasharray={`${c * span * pct} ${c}`} transform="rotate(135)" />
      </svg>
      <b>{value}</b>
      <i>{lo}</i><i>{hi}</i>
    </span>
  );
}
const TallTime = ({ time, className = '' }) => (
  <span className={`nft-time ${className}`}>{time.split('').map((ch, i) => <span key={i} className={ch === ':' ? 'nft-colon' : undefined}>{ch}</span>)}</span>
);

function Face({ face, now, time, vitals }) {
  const date = `${DAYS[now.getDay()]} ${now.getDate()}`;
  const [hh, mm] = time.split(':');
  const line = (
    <span className="nm-vitals">
      <span className="nm-dot" aria-hidden="true" />
      {vitals}
    </span>
  );
  if (face.startsWith('tall')) {
    const [, hrv = '38', bpm = '104'] = vitals.match(/(\d+)\D+(\d+)/) || [];
    const bigDate = `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;
    const date = <span className="nft-date">{bigDate}</span>;
    const hrvGauge = (
      <Circle className="nm-vitals nfc-live"><Gauge value={hrv} lo="20" hi="80" pct={(hrv - 20) / 60} /></Circle>
    );
    const heart = (
      <Circle className="nm-vitals nfc-live nfc-stack"><Heart /><b>{bpm}</b></Circle>
    );
    if (face === 'tall-trio') return (<>{date}<TallTime time={time} /><span className="nft-row"><Circle><Wind /></Circle><Circle><Rings /></Circle>{hrvGauge}</span></>);
    if (face === 'tall-momo') return (<>{date}<TallTime time={time} /><span className="nft-row">{hrvGauge}<Circle className="nfc-momo"><video src={momoFloating} autoPlay loop muted playsInline /></Circle>{heart}</span></>);
    if (face === 'tall-split') {
      const [hh, mm] = time.split(':');
      return (
        <span className="nft-split">
          <span className="nft-col">{date}<TallTime time={hh} className="nft-half" /><TallTime time={mm} className="nft-half" /></span>
          <span className="nft-side">{hrvGauge}{heart}<Circle><Rings /></Circle></span>
        </span>
      );
    }
    if (face === 'tall-gauge') {
      return (
        <>{date}<TallTime time={time} />
          <span className="nft-calm nm-vitals">
            <span className="nft-calm-bar"><span className="nft-calm-dot nm-dot" /></span>
            <span className="nft-calm-labels"><span>Calm</span><span>HRV {hrv}</span><span>Tense</span></span>
          </span>
        </>
      );
    }
    const bars = [30, 34, 31, 36, 40, 38, 44, 52, 61, 70, 66, 74, 80, 72, 78, 86];
    return (
      <>{date}<TallTime time={time} />
        <span className="nft-graph nm-vitals">
          <span className="nft-bars">{bars.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</span>
          <span className="nft-graph-label"><Heart /> {bpm} bpm · rising</span>
        </span>
      </>
    );
  }
  if (face === 'smart-stack') {
    // At rest: tall digits. On the spike, the time shrinks to the top and an
    // Unwind card with Momo and the readings slides in above the circles.
    const [, hrv = '38', bpm = '104'] = vitals.match(/(\d+)\D+(\d+)/) || [];
    return (
      <span className="nfs">
        <span className="nfs-time">{time}</span>
        <TallTime time={time} className="nfs-tall" />
        <span className="nfs-card">
          <span className="nfs-card-head">
            <video src={momoFloating} autoPlay loop muted playsInline />
            <b>Unwind</b>
          </span>
          <span className="nfs-card-body">Your heart rate is up and HRV is down.</span>
          <span className="nfs-card-meta nm-vitals"><span className="nm-dot" />HRV {hrv} ms · {bpm} bpm</span>
        </span>
        <span className="nft-row nfs-row">
          <Circle><Wind /></Circle>
          <Circle className="nm-vitals nfc-live nfc-stack"><Heart /><b>{bpm}</b></Circle>
          <Circle><Rings /></Circle>
        </span>
      </span>
    );
  }
  if (face === 'modular') {
    const [hrv, bpm] = vitals.split('·').map((v) => v.trim());
    return (
      <>
        <span className="nf-date">{date}</span>
        <span className="nm-time">{time}</span>
        <span className="nm-vitals nf-chips">
          <span className="nm-dot" aria-hidden="true" />
          <span className="nf-chip">{hrv}</span>
          <span className="nf-chip">{bpm}</span>
        </span>
      </>
    );
  }
  if (face === 'stacked') {
    return (
      <>
        <span className="nf-stack">
          <span>{hh.padStart(2, '0')}</span>
          <span className="nf-min">{mm}</span>
        </span>
        {line}
      </>
    );
  }
  if (face === 'minimal') {
    return (
      <>
        <span className="nf-corner">
          <span className="nm-time">{time}</span>
          <span className="nf-date">{date}</span>
        </span>
        {line}
      </>
    );
  }
  if (face === 'analog') {
    const m = now.getMinutes();
    const h = (now.getHours() % 12) + m / 60;
    return (
      <>
        <svg className="nf-analog" viewBox="-100 -100 200 200" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <line key={i} x1="0" y1="-88" x2="0" y2={i % 3 ? -80 : -74} transform={`rotate(${i * 30})`} />
          ))}
          <line className="nf-hour" x1="0" y1="8" x2="0" y2="-46" transform={`rotate(${h * 30})`} />
          <line className="nf-minute" x1="0" y1="10" x2="0" y2="-72" transform={`rotate(${m * 6})`} />
          <circle r="4" />
        </svg>
        {line}
      </>
    );
  }
  return (
    <>
      <span className="nm-time">{time}</span>
      {line}
    </>
  );
}

function Notification() {
  const [run, setRun] = useState(0);
  const c = useDialKit('Notification', CONFIG, { id: 'notification', onAction: () => setRun((n) => n + 1) });
  const [phase, setPhase] = useState('face');

  useEffect(() => {
    const off = c.timing.offMs;
    setPhase(off > 0 ? 'off' : 'face');
    const ids = [
      off > 0 && setTimeout(() => setPhase('face'), off),
      setTimeout(() => setPhase('sense'), off + c.timing.senseMs),
      setTimeout(() => setPhase('ask'), off + c.timing.askMs),
      c.timing.loop && setTimeout(() => setRun((n) => n + 1), off + c.timing.askMs + c.timing.holdMs),
    ];
    return () => ids.forEach((id) => id && clearTimeout(id));
  }, [run, c.design, c.timing.offMs, c.timing.senseMs, c.timing.askMs, c.timing.holdMs, c.timing.loop]);

  // After "I'd rather not", a kind note, then the loop starts over.
  useEffect(() => {
    if (phase !== 'declined') return;
    const id = setTimeout(() => setRun((n) => n + 1), 2600);
    return () => clearTimeout(id);
  }, [phase]);

  const k = c.scale;
  const now = new Date();
  const time = `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`;
  const asking = phase === 'ask';

  return (
    <main className="stage" style={{ background: '#f5f5f5' }}>
      <Backdrop id="backdrop-notification" />
      <div className="device" style={{ width: WATCH.w * k, height: WATCH.h * k }}>
        <div className="device-scaler" style={{ width: WATCH.w, height: WATCH.h, transform: `scale(${k})` }}>
          {/* Black underlay larger than the cut-out, so no light gap shows at the glass edge. */}
          <div
            className="watch-bleed"
            style={{ left: WATCH.x - c.bleed, top: WATCH.y - c.bleed, width: WATCH.screenW + 2 * c.bleed, height: WATCH.screenH + 2 * c.bleed, borderRadius: c.screenRadius + c.bleed }}
          />
          <section
            key={run}
            className="watch-screen"
            data-design={c.design}
            data-phase={phase}
            aria-label="Watch notification"
            style={{
              left: WATCH.x,
              top: WATCH.y,
              width: WATCH.screenW,
              height: WATCH.screenH,
              borderRadius: c.screenRadius,
              '--accent': c.look.accent,
              '--soft': c.look.soft,
              '--title': `${c.look.textSize}px`,
              '--body': `${c.look.bodySize}px`,
              '--momo': `${c.momo.size}px`,
              '--move': `${c.timing.moveMs}ms`,
            }}
          >
            <div className="nm-face" data-face={c.face} data-tint={c.faceTint}>
              <Face face={c.face} now={now} time={time} vitals={c.copy.vitals} />
            </div>

            {c.design === 'breathe' && <span className="nm-ring" aria-hidden="true" />}
            {c.design === 'pulse' && <PulseLine spiking={phase === 'sense'} />}
            <Momo listening={asking && c.momo.listenOnAsk} />

            <div className="nm-ask" inert={!asking}>
              <p className="nm-greeting">{c.copy.greeting}</p>
              <p className="nm-body">{c.copy.body}</p>
              <div className="nm-actions">
                <button type="button" className="nm-yes" onClick={() => (window.location.href = `/${c.yesPage}`)}>
                  {c.copy.yes}
                </button>
                <button type="button" className="nm-no" onClick={() => setPhase('declined')}>
                  {c.copy.no}
                </button>
              </div>
            </div>

            <p className="nm-declined" aria-live="polite">{phase === 'declined' ? c.copy.declined : ''}</p>
          </section>
          <img className="watch-frame" src={watchUrl} alt="" draggable={false} />
        </div>
      </div>
      <DialRoot position="top-right" productionEnabled theme="light" />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Notification />);
