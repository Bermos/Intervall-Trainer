# Intervall-Trainer

A local-first ear and intonation trainer. It plays a random root note, you sing or
play it back until it locks green, then it asks you for an interval from that root
— a major sixth up from C, say — and listens through the microphone to tell you how
close you are.

Everything runs in the browser. No account, no backend, no audio ever leaves the
device: the microphone stream is analysed in-page and thrown away frame by frame.

## How a prompt works

1. **Step 1 — the root.** The reference note sounds. Sing or play it and hold it
   inside the tolerance until the bar fills. This is what makes the next step an
   interval rather than a tuner exercise: you have to *produce* the root, not just
   hear it.
2. **Step 2 — the interval.** The prompt names the interval (a major sixth up, a
   perfect fourth down, …) and you find it from the root you just sang. Hold it
   green and the prompt is solved.
3. **Timeout.** If the interval note does not lock within the configured time
   limit (15 s by default, adjustable or off), you drop back to step 1 for the
   *same* interval and set it up again. The retry is counted, so the stats show
   which leaps you keep losing.

## Features

- **Live pitch feedback** — deviation in cents, a tolerance band, and a hold bar.
- **Ranges** — the six common voice classifications plus tenor trombone (straight
  and with F attachment), or a custom low/high pair. Both notes of every prompt
  are guaranteed to fall inside the range.
- **Interval and direction picker** — any subset of m2 through the octave, up,
  down, or both.
- **Difficulty** — tolerance in cents, how long the note must be held, and the
  interval time limit.
- **Ear training mode** — hides the name of the interval note until you solve it.
- **Local stats** — success rate, average time to lock, average deviation and
  average retries per interval, a 14-day activity chart, best streak and day
  streak. Stored in `localStorage`, clearable from the Stats tab.
- **Installable PWA** — works offline once loaded.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the production build
npm test           # unit tests
npm run typecheck
```

The microphone needs a secure context: `localhost` is fine, anything else has to
be HTTPS.

Deploying under a sub-path (GitHub Pages and friends) needs the base path set at
build time:

```sh
VITE_BASE=/intervall-trainer/ npm run build
```

## How it works

| Module | Job |
| --- | --- |
| `src/core/music.ts` | Note names, MIDI ↔ frequency, cents, range presets |
| `src/core/exercise.ts` | Picks a random (root, interval, direction) that fits the range |
| `src/core/pitch.ts` | Pitch detection and smoothing |
| `src/core/lock.ts` | Decides when a note has been held long enough |
| `src/core/stats.ts` | Practice history and its `localStorage` store |
| `src/core/settings.ts` | Settings, defaults and migration of stored values |
| `src/core/audio.ts` | Web Audio: reference tones and the microphone analyser |
| `src/composables/useTrainer.ts` | The two-step prompt loop that drives the UI |

Pitch detection uses the **McLeod Pitch Method** (normalised square difference
function with parabolic interpolation over the chosen peak) rather than plain
autocorrelation, because autocorrelation drops an octave on harmonic-rich sounds
— exactly what a trombone or a chesty low voice produces — and an octave error
would mark a correct interval wrong. Readings are median-smoothed over five
frames so a single bad frame cannot move the needle, and the microphone is opened
with echo cancellation, noise suppression and auto gain control **off**, since all
three fight a sustained tone.

Everything except the Web Audio wrapper and the Vue components is a pure function
or a small class with time injected, which is why the exercise generator, the hold
tracker, the pitch detector and the stats reducer are all covered by unit tests
(`npm test`).

## Notes on the ranges

The presets are comfortable working ranges, not the extremes a specialist can
reach. Tenor trombone is the straight horn from E2 to B♭4; the F-attachment
variant extends down to B1. Everything is at concert pitch — if you read
treble-clef B♭ trombone parts, the app is showing you sounding notes. Concert
pitch A4 is adjustable between 415 and 450 Hz.
