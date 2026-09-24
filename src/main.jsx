import { createRoot } from 'react-dom/client';
import { VoiceBeam } from 'voice-glow';
import { beamColors } from './brand.js';
import './styles.css';

const beamStyle = {
  '--voice-hue-base': '0deg',
  '--voice-stroke-opacity': '2',
  '--voice-inner-opacity': '2',
  '--voice-bloom-opacity': '2',
};

function VoiceScreen() {
  return (
    <section className="voice-screen" aria-label="Voice message composer">
      <header className="phone-header">
        <button className="back-button" aria-label="Go back">‹</button>
        <div className="identity">
          <span className="avatar" aria-hidden="true">R</span>
          <div>
            <p className="eyebrow">Reself</p>
            <p className="status">Voice companion</p>
          </div>
        </div>
        <button className="more-button" aria-label="More options">•••</button>
      </header>

      <div className="conversation" aria-label="Conversation preview">
        <p className="time">Today, 10:42 AM</p>
        <div className="message incoming">What do you need to make room for today?</div>
        <div className="message outgoing">I want to slow down and listen.</div>
      </div>

      <div className="composer">
        <span className="composer-prompt">Speak freely…</span>
        <span className="pulse-dot" aria-hidden="true" />
      </div>
    </section>
  );
}

function App() {
  return (
    <main className="page-shell">
      <div className="intro">
        <p className="kicker">VOICE GLOW / ICE</p>
        <h1>Presence, made visible.</h1>
        <p className="description">Your exact <code>VoiceBeam</code> configuration rendered as a mobile voice composer.</p>
      </div>

      <div className="device-wrap">
        <div className="device" aria-label="VoiceBeam mobile preview">
          <div className="dynamic-island" aria-hidden="true" />
          <VoiceBeam
            level={1}
            type="mobile"
            sensitivity={4}
            threshold={0.3}
            attack={0.5}
            release={0.9}
            breatheDuration={8}
            colorVariant="ice"
            {...beamColors(undefined, 1.3)}
            theme="light"
            borderRadius={62}
            scale={3}
            glowSize={0.25}
            idle={1}
            reach={0.25}
            spread={0}
            flow={-76}
            bend={3}
            bandStrength={2.65}
            bandWidth={0.3}
            bandPosition={0.1}
            bandCurve={4}
            bandSpread={0.19}
            bandSkew={0.38}
            bandTail={0.67}
            bandAberration={1}
            distortion={1}
            distortionDetail={1}
            glowHeight={1.55}
            softness={1.35}
            coreSize={3}
            coreLight={3}
            coreLightWidth={3}
            coreLightHeight={3}
            strokeScale={2.85}
            innerScale={3}
            bloomScale={1.05}
            bloomHeight={2.25}
            brightness={1.3}
            saturation={2.2}
            hueRange={0}
            hueDuration={2}
            style={beamStyle}
          >
            <VoiceScreen />
          </VoiceBeam>
        </div>
      </div>

      <p className="note">Static level: 1. The light beam remains continuously active so each tuning parameter is visible.</p>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
