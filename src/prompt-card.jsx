import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { VoiceBeam } from 'voice-glow';
import { DialRoot, useDialKit } from 'dialkit';
import 'dialkit/styles.css';
import './voice.css';
import { BEAM, PROMPTS, PromptCard, beamProps } from './recorder.jsx';
import { StatusBar } from './status-bar.jsx';
import { HeaderWave } from './header-wave.jsx';

/* ─────────────────────────────────────────────────────────
 * Dynamic mode's question card, on its own, so every slider can be tuned
 * without the card fading away.
 *
 * The 'Prompts' panel is the recorder's own config (same folders, same
 * defaults), so values copied from here apply to voice-dynamic.html as-is.
 *
 * Preview › timer
 *   loop   the countdown plays; when it ends the card re-enters after restMs
 *   scrub  the countdown holds at `at` (0 = full, 1 = empty); the star still moves
 * Actions replay the entrance, or play the tap (answer) and fade (ignore) exits.
 * ───────────────────────────────────────────────────────── */

const PREVIEW = {
  question: 'What made it go better than you expected?',
  timer: { type: 'select', options: ['loop', 'scrub'], default: 'scrub' },
  at: [0.35, 0, 1, 0.01],
  restMs: [900, 0, 5000, 50],
  cardBottom: [300, 80, 640, 1],
  glow: true,
  glowLevel: [0.25, 0, 1, 0.01],
  screenColor: '#f9f9f9',
  pageColor: '#f5f5f5',
  previewScale: [0.9, 0.4, 1.4, 0.01],
  replay: { type: 'action', label: 'Replay entrance' },
  tap: { type: 'action', label: 'Preview tap (answered)' },
  ignore: { type: 'action', label: 'Preview fade (ignored)' },
};

const SCREEN_W = 390;
const SCREEN_H = 780;

function PromptCardPreview() {
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState('offered');
  const replay = () => {
    setPhase('offered');
    setRun((n) => n + 1);
  };
  const v = useDialKit('Preview', PREVIEW, {
    id: 'card-preview',
    onAction: (path) => {
      if (path === 'replay') replay();
      else setPhase(path === 'tap' ? 'taken' : 'faded');
    },
  });
  const p = useDialKit('Prompts', PROMPTS, { id: 'voice-prompts' });
  const b = useDialKit('Voice beam', BEAM, { id: 'voice-beam', defaultCollapsed: true });

  // After an exit plays, the card comes back so tuning can carry on.
  useEffect(() => {
    if (phase === 'offered') return;
    const id = setTimeout(replay, p.motion.outMs + 700);
    return () => clearTimeout(id);
  }, [phase, p.motion.outMs]);

  // Loop: when the countdown runs out, re-enter after restMs.
  useEffect(() => {
    if (v.timer !== 'loop' || phase !== 'offered') return;
    const id = setTimeout(replay, p.lingerMs + v.restMs);
    return () => clearTimeout(id);
  }, [v.timer, phase, run, p.lingerMs, v.restMs]);

  const scrub = v.timer === 'scrub';
  const rec = {
    live: true,
    status: 'recording',
    prompt: { id: run, question: v.question, phase: phase.name ?? phase, dir: phase.dir },
    answer: () => setPhase('taken'),
    dismiss: (id, dir) => setPhase({ name: 'swiped', dir }),
  };
  const level = v.glowLevel;

  return (
    <main className="stage" style={{ background: v.pageColor }}>
      <div className="device" style={{ width: SCREEN_W * v.previewScale, height: SCREEN_H * v.previewScale }}>
        <div
          className="device-scaler"
          style={{ width: SCREEN_W, height: SCREEN_H, transform: `scale(${v.previewScale})`, '--screen-radius': '48px' }}
        >
          <VoiceBeam className="beam-host" level={() => level} active={v.glow} {...beamProps(b)}>
            <section className="voice-screen" aria-label="Prompt card preview" style={{ height: SCREEN_H, background: v.screenColor }}>
              <PromptCard
                /* A mode switch remounts, so the countdown starts clean instead of
                   resuming animations that were held paused at a scrub point. */
                key={`${run}-${v.timer}`}
                rec={rec}
                p={p}
                bottom={v.cardBottom}
                timerAt={scrub ? v.at : 0}
                timerFrozen={scrub}
              />
              <HeaderWave />
            </section>
          </VoiceBeam>
          <StatusBar height={SCREEN_H} />
        </div>
      </div>
      <DialRoot position="top-right" productionEnabled theme="light" />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<PromptCardPreview />);
