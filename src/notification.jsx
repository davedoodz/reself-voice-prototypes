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
  scale: [0.8, 0.4, 1.4, 0.01],
  screenRadius: [70, 0, 120, 1],
  timing: {
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

function Notification() {
  const [run, setRun] = useState(0);
  const c = useDialKit('Notification', CONFIG, { id: 'notification', onAction: () => setRun((n) => n + 1) });
  const [phase, setPhase] = useState('face');

  useEffect(() => {
    setPhase('face');
    const ids = [
      setTimeout(() => setPhase('sense'), c.timing.senseMs),
      setTimeout(() => setPhase('ask'), c.timing.askMs),
      c.timing.loop && setTimeout(() => setRun((n) => n + 1), c.timing.askMs + c.timing.holdMs),
    ];
    return () => ids.forEach((id) => id && clearTimeout(id));
  }, [run, c.design, c.timing.senseMs, c.timing.askMs, c.timing.holdMs, c.timing.loop]);

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
            <div className="nm-face">
              <span className="nm-time">{time}</span>
              <span className="nm-vitals">
                <span className="nm-dot" aria-hidden="true" />
                {c.copy.vitals}
              </span>
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
