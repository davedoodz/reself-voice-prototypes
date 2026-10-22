# ReSelf Voice Prototypes

```
        .    *   .  ~  .    *   .
           )))                         ◝◡◜  momo
      )))  )))  )))     ~
    )))))))))))))))))       "how was
      )))  )))  )))         your day?"
           )))
        ·    .   *    .   ~    .
              [ ●───rec ]
```

A set of interactive React prototypes for a voice-journaling app — recording flows, a mascot-led notification, and the screens around them.

## What it is

This repo is a design/engineering playground for an app (working name **Unwind**, mascot **Momo**) built around talking through your day out loud instead of typing it. Each prototype is its own HTML entry point sharing one component library, so a single `pnpm dev` serves the whole set and each page can be tuned independently without rebuilding the others.

The core idea across every screen is **VoiceBeam** — a glowing waveform in the app's one brand blue (`#61A8FD`) that stands in for the listening "entity" instead of a literal mascot avatar on the recording screens themselves.

## Prototypes

| Page | What it's for |
| --- | --- |
| `welcome.html` | First-run welcome screen — the beam introduces itself before handing off to recording. |
| `voice.html` | Freeform recording — talk, no structure imposed. |
| `voice-dynamic.html` | Dynamic recording — the app surfaces follow-up questions as you talk, which you can answer or let fade. |
| `voice-guided.html` | Guided recording — a fixed set of framework steps/prompts shape the entry. |
| `entries.html` | Journal history — past entries with transcripts, themes, and summaries. |
| `prompt-card.html` | The prompt-card component in isolation, for tuning its motion. |
| `guide-cards.html` | Guided mode's prompt cards in isolation, same purpose. |
| `notification.html` | A watch senses a stress spike and Momo offers a voice entry — five looped visual designs of the same flow. |
| `logo-motion.html` | The wordmark/logo animation on its own. |

## Highlights

- One shared `recorder.jsx` powers all three recording variants (freeform / dynamic / guided) via a single `variant` prop.
- `brand.js` derives every shade of the VoiceBeam's glow — core, deep, soft, and the beam's own slightly different blue — from one brand color, correcting for the brightness filter the beam runs through so the glow doesn't drift to cyan.
- A custom Vite plugin (`scopedReload`) walks the import graph on every hot-reload so editing one prototype's files only reloads the page(s) that actually import them, leaving the others running.
- `entries-data.js` is a hand-written simulated journal history (July–September 2026) that reuses the recorder's own framework steps and scripts, so the entries list and the recording flows tell one consistent story.
- Built on `dialkit` for the on-screen control panels used to tune each prototype live, and `voice-glow` for the VoiceBeam itself.

## Stack

React 19, Vite 8, `dialkit`, `voice-glow`, `motion`, `lucide-react`.

## Run locally

```bash
npm install
npm run dev     # vite --host 127.0.0.1
npm run build
```

Each `*.html` file at the repo root is its own Vite entry — the dev server serves them all at once, so navigate directly to the page you want (e.g. `/voice-guided.html`, `/entries.html`).

## Map

```
index.html, voice*.html, entries.html, …   one Vite entry per prototype
src/recorder.jsx                            shared recording UI for all three variants
src/entries.jsx + src/entries-data.js       journal history list + its simulated data
src/brand.js                                the brand-blue → VoiceBeam color math
src/welcome.jsx, notification.jsx, …        the other standalone screens
bg-images/, blue-icons/, momo-animations/   art assets used across prototypes
iphone_asset/, watch-assets/                device chrome used to frame the mockups
```
