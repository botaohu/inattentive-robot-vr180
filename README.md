# Inattentive Robots — VR180 Scenario Library

Immersive WebXR site for the [Inattentive Robot](https://amber.botao.hu/project/inattentive-robot)
project: six AI-generated VR180 scenario clips shot from a domestic humanoid robot's own eyes,
each staging an attention conflict (whose claim on the robot wins?). Watch flat in a browser or
put on a headset (Quest, Vision Pro, etc.) and press **Enter VR**.

## Pages

| Page | Purpose |
| --- | --- |
| `index.html` | Scenario library — six VR180 attention-conflict clips |
| `watch.html?s=<id>` | WebXR VR180 player (drag-look fallback; Enter VR on headsets) |
| `lab.html` | Projection calibration lab (validates VR180 mapping; used by tests and by the generation workflow) |
| `survey/` | Post-viewing survey — sign in with Google, write what the robot should do first |

## Run locally

```bash
npm install
npx http-server -p 8173 .
# open http://127.0.0.1:8173/
```

## Tests

End-to-end tests (Playwright, software WebGL — run headless and in CI):

```bash
npx playwright test
```

- `tests/projection-calibration.spec.js` — renders a synthetic half-equirect calibration
  pattern through the real three.js pipeline and probes known view directions (angular
  mapping, 15° grid alignment, SBS per-eye routing, flat-window placement).
- `tests/site.spec.js` — gallery, viewer playback (video actually renders on the dome),
  WebXR fallback, survey demo-mode flow.

## Media generation workflow

See [`docs/PROMPT-WORKFLOW.md`](docs/PROMPT-WORKFLOW.md) for the validated prompt template
and the full fal.ai pipeline (Seedance 2.5 geometry template → Nano Banana Pro re-dress →
MiniMax H3 image-to-video), including why each stage exists and its failure modes.

## Survey backend

The survey ships in local demo mode. To enable real Google sign-in and cloud storage,
create a Firebase project and paste its config into `survey/config.js` (step-by-step
instructions are in that file).

## Deploy

Pushing to `main` runs the Playwright suite and, on success, deploys to GitHub Pages
via `.github/workflows/pages.yml`.
