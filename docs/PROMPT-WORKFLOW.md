# VR180 Generation: Standard Prompt Template & Workflow

Validated 2026-08-12 for the Inattentive Robots scenario library. Reusable for any project
that needs AI-generated 180° immersive video that projects correctly in a WebXR viewer.

## TL;DR pipeline

```
1. GEOMETRY TEMPLATE (once per project)
   Seedance 2.5 text-to-video · 1:1 · VR180 prompt block → pick a run whose frame
   passes the projection lab → extract a still. This is your geometry template.

2. SCENE STILLS (per scenario)
   fal-ai/nano-banana-pro/edit · input = template still + scene description with the
   PRESERVE block → 2K half-equirect still with new scene, same projection.
   Validate each still in the lab; regenerate on failure (~$0.15, 30 s).

3. MOTION + AUDIO (per scenario)
   fal-ai/kling-video/o3/4k/image-to-video · input = validated still · motion/
   dialogue prompt · 10 s, audio → final clip. Kling follows the input frame's
   projection and is the face-quality winner (see below).

4. VALIDATE
   Projection lab (lab.html): synthetic calibration must pass; per-clip contact
   sheets must show straight verticals at yaw ±45–85° and grid-consistent curvature.
```

## Why this shape

| Approach | Result |
| --- | --- |
| Prompt any t2v model for "VR180 half-equirectangular" directly | **Seed lottery.** Seedance 2.5 *can* produce genuine half-equirect (our template came from such a run) but adherence varies run to run; MiniMax H3 ignores the projection instruction and renders rectilinear; Seedance mini renders a circular fisheye. Six independent t2v runs gave six subtly different lens geometries. |
| Text-to-image "equirectangular" still → i2v | Nano Banana Pro renders a *near*-fisheye at 1:1 — close, but verticals still bow. Not exact. |
| **Edit a known-good half-equirect frame (template) into each new scene** | **Deterministic.** Edit models preserve input geometry strongly; every scenario inherits the validated projection, and stills are cheap to iterate until the lab passes. |
| Seedance 2.5 image-to-video for motion | Rejected our stills (`content_policy_violation`: photoreal people in input images trip its likeness filter). |
| MiniMax H3 image-to-video for motion | Accepts the stills, preserves projection, cheap 4K ($0.16/s) — but **smears small faces** into waxy doll-like artifacts while animating. A SeedVR2 restoration pass sharpens detail yet cannot repair the broken facial structure. Acceptable only when no face is closer than ~5 m. |
| **Kling o3 4K image-to-video for motion (RECOMMENDED)** | Accepts photoreal stills, preserves the frame's projection and POV at 2880×2880, natural human motion, and dramatically better face integrity (Kuaishou's 3D face model). $0.42/s → ~$4.2 per 10 s clip. Verified side-by-side on identical still+prompt. |

## Prompt template

### Camera height (bake it into the template!)

Embodied POV height is a property of the geometry template, not something you can fix
downstream. For a 170 cm humanoid (e.g. 1X NEO class), the template prompt must pin it
explicitly, otherwise models default to a low, chest-high viewpoint that reads as a
child's height in-headset:

> The camera is the eyes of a 170 cm tall standing adult-sized humanoid robot: eye level
> about 165 cm above the floor. The horizon and the eye lines of standing adults sit
> exactly on the vertical center of the frame; countertops are down at waist height in
> the lower third; the camera looks perfectly level, not tilted down.

Acceptance check in the lab: a standing adult's eyes must land on the pitch-0 grid line
of the calibration overlay.

### Block A — projection (used in the template hunt, Stage 1)

> Monoscopic VR180 immersive video in half-equirectangular projection, exactly 180-degree
> horizontal and 180-degree vertical field of view, as captured by a dual-fisheye VR180
> camera and stored as equirectangular. Straight architectural lines far from the image
> center bow outward; the extreme left and right frame edges show what is directly beside
> the camera at 90 degrees; the top edge shows the ceiling directly above and the bottom
> edge shows the floor directly below.

Settings: `aspect_ratio: "1:1"` (mandatory — 180°×180° is square), static camera, one
continuous shot.

### Block B — embodiment (robot POV)

> Strict first-person embodied domestic humanoid robot point of view at standing human eye
> height: two soft light-gray elastomer robot hands with five articulated human-proportioned
> fingers remain visible in the lower foreground, [DOING TASK]. Exactly two hands, five
> fingers per hand, physically plausible motion.

### Block C — scene

Place actors by *direction*: "on the left … on the right … directly ahead …". In a
half-equirect frame, left/right map to yaw ±45–90°, so this is how you compose for a
headset where the viewer chooses where to look.

### Block D — quality / negatives

> Photoreal, cinematic documentary realism, warm practical lighting, locked-off static
> camera, one continuous shot, no cuts, no camera motion, never reveal the robot's face or
> body, no extra arms, no deformed fingers, no text, no subtitles, no watermark, no logos.

### Block E — PRESERVE (Stage 2 edit prompt prefix)

> This photo is a VR180 half-equirectangular projection frame covering exactly 180 degrees
> horizontally and vertically, from the first-person point of view of a domestic humanoid
> robot. Repaint the scene while EXACTLY preserving the projection geometry, the camera
> position at standing eye height, the wrap-around distortion at the edges, and the two
> light-gray elastomer robot hands in the lower foreground. New scene: […]

Add when needed: *"Fill the entire square frame edge to edge with the scene; no black
corners, no vignette, no border, no mask."* (Nano Banana occasionally invents a rounded
vignette.)

### Block F — motion (Stage 3 i2v prompt prefix)

> Animate this VR180 half-equirectangular first-person robot point of view, strictly
> preserving the half-equirectangular projection geometry of the input frame for the entire
> clip. Locked-off static camera, no cuts, subtle idle proprioceptive micro-motion of the
> robot hands. [MOTION BEATS…] Native audio: [room tone, effects, one short spoken line].

## Validation (the part that makes this a workflow, not a vibe)

`lab.html` renders any still/clip through the *same* three.js code path as the viewer:

- **Synthetic calibration** (`?src=synthetic`): colored patches at known yaw/pitch are
  probed through an offscreen render target; CI fails if the angular mapping, the 15° grid,
  or SBS eye routing drifts. This validates the pipeline itself.
- **Footage assessment** (`?src=<clip>&grid=1`): `tools/contact-sheet.mjs` captures views
  at yaw 0/±60/±85 and pitch ±40. Accept a clip when known-vertical edges (door frames,
  cabinets) render straight and horizontal edges match the overlay grid's latitude
  curvature. Reject → regenerate the still (Stage 2), not the video.

Modes for diagnosing wrong-looking footage: `mode=hequirect | fisheye180 | flat:<hfov>`
(equidistant fisheye and gnomonic flat placement) — whichever mode straightens the
architecture tells you what the model actually produced.

## Costs (as of 2026-08)

| Stage | Model | Cost |
| --- | --- | --- |
| Template hunt | Seedance 2.5 t2v 480p/4s | ~$0.9 per attempt |
| Scene still | Nano Banana Pro edit 2K | $0.15 per image |
| Final clip | Kling o3 4K i2v 10s + audio | ~$4.20 per clip |
| (budget alternative) | MiniMax H3 i2v 4K 10s | ~$1.60 — only for face-free scenes |
| (upscale option) | fal-ai/seedvr/upscale/video | ~$0.001/MP |

## Known limitations / next steps

- **Stereo**: depth-based. Each clip ships as a 4K color file plus a frame-matched
  grayscale inverse-depth file (`fal-ai/depth-anything-video`, VDA-Large); the viewer
  plays them in lockstep (drift-corrected each frame) and shifts each eye's sampling
  by up to 1.1° proportional to inverse depth. Depth is a separate file because a
  side-by-side pack of two 4K frames would exceed the ~4096 px hardware video-decoder
  limit on standalone headsets.
- **Prompted projection ≈ approximation**: even lab-passing clips are "equirect-like",
  not metrically calibrated. Fine for perception studies and demos; don't use for
  photogrammetry.
- **H3 clip length** maxes out around 10 s per call; chain `end_image_url` keyframes for
  longer beats.
