import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DialRoot, useDialKit } from 'dialkit';
import 'dialkit/styles.css';
import './voice.css';
import './notification.css';
import watchUrl from '../iphone_asset/Apple Watch Series 7 - 45mm - Starlight.png';
import waveLogo from './icons/wave.png';
import { Backdrop } from './backdrop.jsx';

/* ─────────────────────────────────────────────────────────
 * Notification: the watch senses a stress spike (heart rate variability,
 * breathing, skin temperature) and, a little later, offers a voice entry.
 *
 *    0ms   watch face: time, and a quiet vitals line
 *  +alert  the vitals chip flags a spike (HRV down, heart rate up)
 *  +ask    the prompt slides up: "Hey, how's it going? …"
 *  Yes     opens the voice recorder on the phone
 *  No      "No problem" and the watch face comes back
 * ───────────────────────────────────────────────────────── */

/* iphone_asset/Apple Watch … Starlight.png: 540×860, screen cut-out at
   x 72–467, y 193–671 (396×479). */
const WATCH = { w: 540, h: 860, x: 72, y: 193, screenW: 396, screenH: 479 };

const CONFIG = {
  scale: [0.8, 0.4, 1.4, 0.01],
  screenRadius: [70, 0, 120, 1],
  timing: {
    alertMs: [1200, 0, 8000, 50],
    askMs: [2600, 0, 10000, 50],
    loop: true,
    loopMs: [4000, 1000, 15000, 100],
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
    textSize: [26, 16, 36, 0.5],
    bodySize: [21, 14, 30, 0.5],
  },
  /* Yes opens this page. */
  yesPage: { type: 'select', options: ['voice.html', 'voice-guided.html', 'voice-dynamic.html'], default: 'voice.html' },
  replay: { type: 'action', label: 'Replay' },
};

function Notification() {
  const [run, setRun] = useState(0);
  const c = useDialKit('Notification', CONFIG, { id: 'notification', onAction: () => setRun((n) => n + 1) });
  const [phase, setPhase] = useState('face');

  useEffect(() => {
    setPhase('face');
    const a = setTimeout(() => setPhase('alert'), c.timing.alertMs);
    const b = setTimeout(() => setPhase('ask'), c.timing.askMs);
    return () => (clearTimeout(a), clearTimeout(b));
  }, [run, c.timing.alertMs, c.timing.askMs]);

  // After a No, the face comes back and (on loop) the whole thing plays again.
  useEffect(() => {
    if (phase !== 'declined') return;
    const id = setTimeout(() => (c.timing.loop ? setRun((n) => n + 1) : setPhase('face')), c.timing.loopMs);
    return () => clearTimeout(id);
  }, [phase]);

  const k = c.scale;
  const now = new Date();
  const time = `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <main className="stage" style={{ background: '#f5f5f5' }}>
      <Backdrop id="backdrop-notification" />
      <div className="device" style={{ width: WATCH.w * k, height: WATCH.h * k }}>
        <div className="device-scaler" style={{ width: WATCH.w, height: WATCH.h, transform: `scale(${k})` }}>
          <section
            className="watch-screen"
            data-phase={phase}
            aria-label="Watch notification"
            style={{
              left: WATCH.x,
              top: WATCH.y,
              width: WATCH.screenW,
              height: WATCH.screenH,
              borderRadius: c.screenRadius,
              '--accent': c.look.accent,
              '--title': `${c.look.textSize}px`,
              '--body': `${c.look.bodySize}px`,
            }}
          >
            <div className="watch-face">
              <span className="watch-time">{time}</span>
              <span className="watch-vitals">
                <span className="watch-pulse" aria-hidden="true" />
                {c.copy.vitals}
              </span>
            </div>

            <div className="watch-ask" inert={phase !== 'ask'}>
              <div className="watch-app">
                <img src={waveLogo} alt="" />
                <span>Unwind</span>
              </div>
              <p className="watch-greeting">{c.copy.greeting}</p>
              <p className="watch-body">{c.copy.body}</p>
              <div className="watch-actions">
                <button type="button" className="watch-yes" onClick={() => (window.location.href = `/${c.yesPage}`)}>
                  {c.copy.yes}
                </button>
                <button type="button" className="watch-no" onClick={() => setPhase('declined')}>
                  {c.copy.no}
                </button>
              </div>
            </div>

            <p className="watch-declined" aria-live="polite">{phase === 'declined' ? c.copy.declined : ''}</p>
          </section>
          <img className="watch-frame" src={watchUrl} alt="" draggable={false} />
        </div>
      </div>
      <DialRoot position="top-right" productionEnabled theme="light" />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Notification />);
