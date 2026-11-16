# bin's Form Calibrator

[简体中文](README.md) | **English**

A single-file meme toy: **drag the slider to dial "how much bin"** — seven forms of a League of Legends
top laner, from a champion skin all the way to a trophy lift and a power-up finale.

Single static page. No framework, no build step, no network calls, and a single 59 KB audio file.

> **Live demo** — https://3445215166wq-ai.github.io/bin-form-calibrator/
> (a China-optimized mirror runs on Tencent CloudBase: https://binform-d0g0vgl1rde2f7fde-1533757942.tcloudbaseapp.com/)

## What makes it interesting

- **Video scrubbing, not frame swapping.** The slider position is mapped through a piecewise-linear
  anchor table to `video.currentTime`; on every `seeked` the decoded frame is `drawImage`d onto a canvas.
  Dragging literally morphs the video instead of cross-fading stills.
- **The seven tick marks are buttons.** Each one owns a full-width hit area, so you can't miss the target;
  tapping jumps straight to that tier while a CSS transition catches the knob up — and that transition is
  removed the moment you start dragging, so dragging stays 1:1.
- **One-tap share card.** Generates a 900×1200 framed image plus a copyable deep link. The QR code in the
  corner is **computed in the page** by a hand-written encoder (Reed-Solomon, format info, automatic mask
  selection) — no QR service, no library, and it doesn't taint the canvas, so export keeps working.
- **Almost all audio is synthesized** — exactly one 59 KB audio file. Tier blips are WebAudio oscillators, and the final tier is a **formant-synthesized sung "aah"** (sawtooth glottal source + vibrato + three vowel formants + a generated impulse-response reverb). The three "trophy" tiers (FMVP / champion / final form) add a real stadium crowd taken from an **NFL Arrowhead Stadium** field recording (**CC BY-SA 4.0**, credited in `LICENSE-ASSETS`).
- **Easter egg:** type `bin`, or long-press the title for 0.7 s.
- Haptic feedback on mobile via `navigator.vibrate` (no toggle — it's always on).

## Quick start

```bash
# Just open index.html — it runs, but under file:// the canvas is treated as
# cross-origin and image export is blocked.
# Recommended: serve it over http so sharing/QR export works.
node tools/serve.js 8099     # then open http://127.0.0.1:8099/
```

## Deploying your own

```bash
# Assemble dist/ (only the files needed at runtime, ~7.5 MB)
pwsh tools/build-dist.ps1

# e.g. Tencent CloudBase static hosting
tcb hosting deploy ./dist / -e <your-env-id>
```

The repo ships a GitHub Actions workflow (`.github/workflows/pages.yml`): every push to `main` builds
`dist/` and publishes it to GitHub Pages. Enable it once under **Settings → Pages → Source → GitHub Actions**.

## URL parameters

| Param | Meaning |
| --- | --- |
| `?t=N` | Jump straight to tier N (1-based). Defaults to tier 3 |
| `?p=0..1` | Position by fraction |
| `?v=file.mp4` | Use a different video (looked up in the anchor table) |
| `?frames=1` | Force the sprite-sequence fallback |
| `?img=1` | Force the seven-still fallback |

## Making it yours

Everything page-specific lives in one place: the `TIERS` array near the top of `index.html`
(names, captions, fallback image paths), plus `VIDEO_ANCHORS` (the timestamp of each tier's key frame).

**To fork with your own content: delete `assets/` and drop in your own media.** The code doesn't depend
on the specific images — update `TIERS`/`VIDEO_ANCHORS` and it runs.

You also need one video built from your clips, concatenated back-to-back **without cross-fades**,
cutting only where the two neighbouring shots already match. Seeks are mapped onto that single file,
which is why scrubbing feels continuous.

## Repo layout

```
index.html          # the entire app, including the hand-written QR encoder
assets/
  evolution.mp4     # the stitched 7-form video (720x960, 24 fps, 24.9 s, 4.81 MB)
  opt/              # compressed stills (fallback mode ?img=1)
  frames/           # sprite sequence (fallback mode ?frames=1)
  share.png         # Open Graph cover
tools/              # build scripts + a pile of CDP verification scripts
```

## Notes from building it

A few of the non-obvious things, in case they save you time:

- **Draw on every `seeked`, then chase the latest target.** The first version only drew when the seek
  landed exactly on the current target; during a fast drag the target keeps moving, so it drew *nothing*
  and the picture froze until you let go. Drawing whatever frame just landed (then re-seeking) is what makes
  fast scrubbing continuous.
- **Draw before queueing the next seek.** Re-seeking first drops `readyState` below `HAVE_CURRENT_DATA`,
  and the draw guard then skips it — back to zero frames.
- **A shared reverb node may have many inputs but exactly one output.** Reconnecting the same cached
  convolver to a fresh wet-gain on every note made the reverb noticeably louder each time it played.
- **Levels must be measured, not guessed.** An `AnalyserNode` spliced in front of the destination
  (peak/RMS) is the only reliable way to set them; a formant filter bank silently ate ~90% of the gain.
- **Anchors belong on each tier's most representative frame**, since the label switches at the midpoint
  between adjacent anchors — put one at the end of a long shot and the previous tier's footage leaks in.

## License

- **Code: MIT** — see [`LICENSE`](LICENSE).
- **Assets** (images/video under `assets/`): **not** covered by MIT. Personal/educational use only, no
  commercial use. See [`LICENSE-ASSETS`](LICENSE-ASSETS).

The media under `assets/` is AI-generated fan work. It depicts a real public figure and game characters
whose rights belong to their respective owners (game characters © Riot Games). This project is
unaffiliated with that player or their team, and is not an endorsement by them.
