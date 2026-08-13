# Conflict Compiler: home photo + wants → the two claims that collide → VR180 prompts

The personalization stage of the pipeline. Input: (1) a photo of the participant's own
home, (2) the list of things they want the robot to do (collected by the survey — the
"first-order effects"). Output: the pair of wants that conflict the most **in that
environment**, staged as a generation-ready VR180 scenario using the validated prompt
blocks from [PROMPT-WORKFLOW.md](PROMPT-WORKFLOW.md).

```
home photo ─┐
            ├─► LLM (meta-prompt below) ─► conflict-analysis JSON ─► f-spec (still) ─► v-spec (clip)
wants list ─┘                                                        └─ lab validation as usual
```

Run it:

```bash
node scripts/vr180/compile-conflict.mjs \
  --photo /path/to/livingroom.jpg \
  --wants "make breakfast for the kids; keep grandma company; answer the door; tidy the toys" \
  --out research/vr180-custom/
```

The script feeds the meta-prompt to `claude -p` (any vision-capable LLM works), validates
the returned JSON, and writes `f-custom.json` / `v-custom.json` specs that plug directly
into `scripts/vr180/generate.mjs`. The participant's photo enters the image pipeline as a
*second* reference in the nano-banana edit call: image 1 contributes the validated VR180
projection and 170 cm viewpoint, image 2 contributes their actual room.

## The meta-prompt template

Placeholders: `{{WANTS}}` — semicolon-separated list; the photo is attached as an image.

```text
You are the scenario compiler for the Inattentive Robots study. A household robot has one
body, two hands, one presence: it cannot attend to everyone at once. Your job is to find
where the occupants' desires for the robot will collide in THIS home, and to stage that
collision as a filmable first-person scene.

INPUT
- Attached: a photograph of the participant's home.
- The participant wants the robot to: {{WANTS}}

STEP 1 — READ THE ENVIRONMENT (from the photo only; do not invent rooms you cannot see)
- List the visible zones (kitchen, sofa area, doorway, stairs, balcony…), their spatial
  relations, and the sight lines between them: from where can the robot see or hear whom?
- List affordances and hazards each zone offers: stove, fragile objects, floor clutter,
  steps, a front door, things a child or elder could reach or trip on.
- Note who plausibly occupies each zone (infer household members from the wants list).

STEP 2 — ENUMERATE CONFLICT CANDIDATES
For every pair of wants, ask: can these two claims demand the robot's body at the same
moment, in or between the visible zones? Score each pair 0–10 on:
- temporal collision: how naturally do both become urgent at once?
- spatial tension: does serving one turn the robot's back on, or move it away from, the
  other? Use real distances/sight lines from the photo.
- stakes asymmetry: convenience vs urgency, authority vs distress, private vs public
  duty, protection vs autonomy, one body vs many roles (the six archetypes; name the
  closest one).
- legibility: could a viewer standing in the robot's eyes at 170 cm understand both
  claims without narration? (Both parties should be visible or audible from one spot.)

STEP 3 — SELECT AND STAGE
Pick the highest-scoring pair. Choose the single camera standpoint in the photographed
home from which both claims are legible: name what is on the LEFT, AHEAD, and on the
RIGHT of the robot (VR180 covers 180°; the viewer chooses where to look, so put one
claimant around ±45–90° and the hazard or task near center). Give the robot's hands a
mid-task pose that belongs to one of the two wants.

STEP 4 — EMIT (JSON only, no commentary)
{
  "environment": { "zones": [...], "hazards": [...], "sight_lines": [...] },
  "candidates": [ { "pair": ["want A", "want B"], "archetype": "...", "scores": {"temporal": n, "spatial": n, "stakes": n, "legibility": n}, "total": n, "rationale": "..." } ],
  "selected": { "pair": [...], "archetype": "...", "standpoint": "...", "left": "...", "ahead": "...", "right": "...", "hands": "..." },
  "still_scene": "One paragraph for the image edit: 'New scene: …' describing the photographed room re-staged with the two claimants placed left/ahead/right as chosen, the robot's hands mid-task in the lower foreground, lighting matched to the photo. Follow the composition rules: claimants at ±45–90°, task near center, nothing important behind the camera.",
  "motion_beats": "One paragraph for image-to-video: what moves during the 10-second clip — the task escalating slightly, each claimant making their claim (one short spoken line each at most), the hands hesitating between them. End unresolved: the robot has not chosen.",
  "audio_line": "Native audio: room tone, task sounds, and the one or two short spoken lines."
}

RULES
- Ground everything in the photo: name real furniture, real distances, the real door.
- The conflict must end UNRESOLVED — the clip shows the dilemma, never the robot's choice.
- Safe and non-graphic: distress yes, injury never; no falls shown completing.
- Never reveal the robot's face or body; only two light-gray elastomer hands.
```

## How the output plugs into the pipeline

| Compiler output | Consumed by |
| --- | --- |
| `still_scene` | Stage 2 edit prompt: `PRESERVE block + still_scene + KEEP block`, `image_urls: [geometry-template, participant-photo]` |
| `motion_beats` + `audio_line` | Stage 3 i2v prompt: `MOTION_PREFIX + motion_beats + audio_line` |
| `selected.archetype` | Labels the clip in the scenario library and links the survey response |
| `candidates` table | Research artifact: the full ranking is logged with the manifest for auditability |

## Notes

- **Why the LLM picks two wants, not one**: a single want produces a task demo; the study
  object is the *collision* — whose temporal claim wins. The scoring rubric forces the
  selection to be about embodied simultaneity, not topic similarity.
- **Why staging is directional (left/ahead/right)**: VR180 composition is yaw allocation.
  The compiler decides the yaw layout so the generation prompt can say "on the left … on
  the right …", which the video models follow reliably.
- **Validation is unchanged**: compiled stills go through the same projection lab and
  contact-sheet acceptance as the six library scenarios.
