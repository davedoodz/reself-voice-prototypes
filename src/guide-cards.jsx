import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DialRoot, useDialKit } from 'dialkit';
import 'dialkit/styles.css';
import './voice.css';
import { COMPOSITION, FRAMEWORKS, GUIDE, GuideScreen } from './recorder.jsx';
import { StatusBar } from './status-bar.jsx';

/* ─────────────────────────────────────────────────────────
 * Guided mode's prompt cards, on their own, so the card motion can be tuned
 * without recording a take each time.
 *
 * 'Guide' and 'Composition' are the recorder's own panels (same ids, same
 * defaults), so values copied from here apply to voice-guided.html as-is:
 *   Guide › motion              how a new prompt's text arrives
 *   Guide › dots                the metaball step transition
 *   Composition › <layout> › deck   the stacked cards and the shuffle on Next
 *
 * Preview
 *   Next / Restart     play one shuffle, or go back to step 1
 *   autoplay           shuffles every intervalMs and wraps to step 1
 * ───────────────────────────────────────────────────────── */

const PREVIEW = {
  framework: { type: 'select', options: FRAMEWORKS.map((f) => ({ value: f.id, label: f.title })), default: 'gross' },
  autoplay: true,
  intervalMs: [1800, 400, 6000, 50],
  screenColor: '#f9f9f9',
  pageColor: '#f5f5f5',
  previewScale: [0.9, 0.4, 1.4, 0.01],
  next: { type: 'action', label: 'Next card' },
  restart: { type: 'action', label: 'Back to step 1' },
};

const SCREEN_W = 390;
const SCREEN_H = 780;

function GuideCardsPreview() {
  const [step, setStep] = useState(0);
  const v = useDialKit('Preview', PREVIEW, {
    id: 'guide-cards-preview',
    onAction: (a) => (a === 'next' ? advance() : setStep(0)),
  });
  const g = useDialKit('Guide', GUIDE, { id: 'voice-guide' });
  const gc = useDialKit('Composition', COMPOSITION, { id: 'voice-composition' });
  const comp = gc[gc.active];
  const fw = FRAMEWORKS.find((f) => f.id === v.framework);
  const n = fw.steps.length;
  const advance = () => setStep((s) => (s + 1) % n);

  // Autoplay walks the deck and wraps back to the first card.
  useEffect(() => {
    if (!v.autoplay) return;
    const id = setInterval(advance, v.intervalMs);
    return () => clearInterval(id);
  }, [v.autoplay, v.intervalMs, n]);

  // A new framework starts from its first card.
  useEffect(() => setStep(0), [v.framework]);

  const rec = { status: 'recording', live: true, step: Math.min(step, n - 1), skip: advance };

  return (
    <main className="stage" style={{ background: v.pageColor }}>
      <div className="device" style={{ width: SCREEN_W * v.previewScale, height: SCREEN_H * v.previewScale }}>
        <div
          className="device-scaler"
          style={{ width: SCREEN_W, height: SCREEN_H, transform: `scale(${v.previewScale})`, '--screen-radius': '48px' }}
        >
          <section
            className="voice-screen"
            aria-label="Guided card motion preview"
            style={{ height: SCREEN_H, background: v.screenColor, overflow: 'hidden', '--safe-top': '0px' }}
          >
            <GuideScreen rec={rec} fw={fw} frameworks={FRAMEWORKS} g={g} comp={comp} onPick={() => {}} />
          </section>
          <StatusBar height={SCREEN_H} />
        </div>
      </div>
      <DialRoot position="top-right" productionEnabled theme="light" />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<GuideCardsPreview />);
