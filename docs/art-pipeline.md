# Art pipeline

How NOCTURNE produces its art: images are generated in ChatGPT through the `/chatgpt-image-gen` skill, kept consistent by always feeding approved reference images back in, then normalized into game-ready assets. The Technical Artist runs this pipeline; other roles request art through the Issue's feedback needs.

The visual rules (style, palette, sizes, the anchor set) live in [`docs/art-bible.md`](art-bible.md). This document is the process.

## When to generate

- **Default for new art**: any new character, enemy, animation, scene, UI element or icon is generated with `/chatgpt-image-gen`, unless the art bible says that kind of asset stays code-drawn.
- **Code-drawn on purpose**: particles, sword trails, hit flashes, screen effects, health bars and anything that must react every frame stay in Canvas code.
- **Replacing existing code-drawn art** happens only through approved art conversion proposals, one scope at a time (scenes, then UI, then characters), so old and new styles do not mix for long.
- **Nothing generates before the art bible exists.** Until `docs/art-bible.md` lists approved anchors, the only allowed generation is the work that builds the art bible.

## Requirements and limits

- `/chatgpt-image-gen` drives ChatGPT in the user's own Chrome through Claude in Chrome. It works only in a local Claude Code session on the user's computer, with Claude in Chrome connected and ChatGPT signed in. Cloud sessions, Codex and other agents cannot use it.
- If it is unavailable, do not substitute another image source. Either keep the existing code-drawn art or draw a code placeholder, say so under Notes in the Handoff, and leave the Issue's art item open.
- **Downloads are pre-approved** for this pipeline: the user has given standing consent to download images generated for NOCTURNE. Follow the skill's rules: click Download **once** per image, never click share links (they publish the image), and stop if ChatGPT asks for a sign-in or refuses.
- Uploading reference images uses Claude in Chrome's `file_upload` tool on ChatGPT's attachment input. Upload from the repo's files; never upload anything outside this repo.
- Generated images must be original. Never ask for, name or upload commercial game art, characters, logos or screenshots.

## Consistency rules

1. **Always attach anchors.** Every generation uploads the relevant anchor images from the art bible. Never rely on what the ChatGPT conversation "remembers".
2. **Name each image's role** at the top of the prompt: `Image 1 role: identity anchor — preserve …`, `Image 2 role: layout guide only — do not copy its content`. State what to preserve (identity, outfit, proportions, palette, light direction, scale) and what to ignore.
3. **One character, one direction.** NOCTURNE is a side-scroller: generate characters facing **right**; facing left is a horizontal flip in code.
4. **Chroma background.** Ask for a solid `#FF00FF` background outside the subject (use `#00FF00` if the subject contains magenta). No scenery, borders, text, labels, grid lines or watermarks.
5. **Fixed light and palette.** Light from the top left, palette restricted to the art bible's swatches.
6. **Neutral anchors.** Anchors carry no effects, glows or motion. Effects only appear in the animation frames that need them.
7. **Stage continuity.** A new stage's scene attaches the previous stage's approved background as a reference and states what carries over (horizon height, floor material, light color) and what changes.
8. **Retry, don't argue.** If a result swaps limbs, drifts in style or ignores a pose, rerun the same prompt 2–3 times before rewriting it. Asking ChatGPT to "fix" an image usually makes it worse.
9. **Anything approved becomes an anchor.** Add every accepted asset that others should match to the art bible's anchor index.

## Animation frames

Tested on the hero's run cycle. A whole sheet in one image keeps the character consistent but ignores the poses (legs never alternate, "down" frames turn into squats). Generating frame by frame follows the poses, but ChatGPT cannot reliably choose which leg is the near one: asking for the opposite leg forward failed twice and also drifted the costume. So:

1. Generate or reuse the character's **identity anchor**: a neutral, right-facing idle frame at the art bible's size.
2. **Generate every animation frame by frame.** Each request attaches the identity anchor (Image 1) and a single-frame **mannequin pose guide** (Image 2): a stick figure drawn in code at the frame's exact joint angles, with the near limbs in bright colors, the far limbs darker, and the ground line dashed. Once the first frames are accepted, also attach them as references for the next frames. Ask for the far-side limbs to be shaded one step darker so the legs stay readable.
3. **Loops generate only half a cycle.** A side-view run is 3 frames (contact, down, passing with the swinging knee raised) played as a loop: both legs look alike from the side, so the passing leg reads as the next front leg. Never ask ChatGPT for the opposite-leg half.
4. **Actions that truly need the opposite leg** (for example a future attack that steps with the other foot) reuse an accepted frame and swap the near and far legs' shading during normalization, instead of generating it.
5. **Normalize** (below). Image generation is roughly 20% of the work; normalization is the rest.

Frame counts and timings come from the game, not from the image: check `docs/game-design.md` and `core.js` (for example the attack lasts 0.24 s and the dash 0.18 s) and list the frames the animation needs before generating.

## Normalization

Raw generated images are not game assets. Before an image enters `assets/`:

1. **Recover frames** using each subject's alpha bounding box, not the nominal grid.
2. **Remove the chroma background** into real transparency.
3. **Measure** each frame: visible width and height, foot baseline (lowest opaque row), and the body's center x measured on the torso band **without** cloak or hair pixels (they change shape every frame, so including them makes the body wobble sideways).
4. **Correct scale** to the character's approved height in the art bible.
5. **Re-pad** every frame onto a fixed cell with the same center x and foot baseline.
   For a frame that needs the opposite leg forward (step 4 of "Animation frames"), start from an accepted frame and swap the near and far legs' shading here.
6. **Downscale to the logical size** with nearest-neighbor so pixels stay crisp, and snap colors to the palette.
7. **Pack** the frames into the runtime sheet (one row per animation, frame order left to right).
8. **Verify** with a contact sheet and an animated preview at real size: no drift, no scale jump between animations.

Normalization must not add dependencies or a build step. The tool for it is a dependency-free browser page, `tools/sprite-normalizer.html` (Canvas only; not deployed). The mannequin pose guides come from a second page, `tools/pose-guide.html`, which draws a frame's stick figure from joint angles. Until they exist, building both is part of the first art bible Issue.

## Files

| Path | Contents | Deployed |
| --- | --- | --- |
| `docs/art-bible.md` | Style rules, palette, sizes, anchor index | No |
| `docs/art-bible/anchors/` | Approved anchor images | No |
| `docs/art-bible/guides/` | Mannequin pose guides per animation frame, pixel grids | No |
| `docs/art-bible/raw/` | Raw generations kept for re-normalization | No |
| `docs/art-log.md` | One row per generated asset: prompt, anchors attached, ChatGPT conversation title, result | No |
| `assets/` | Normalized runtime images only | Yes |

Downloaded files land in Chrome's download folder named after the ChatGPT conversation title (see the skill). Move them into the repo with a clear kebab-case name, and log the generation in `docs/art-log.md` with the full prompt so it can be reproduced.

## Prompt templates

Fill the `{PLACEHOLDERS}` from the art bible. Keep the role lines and constraints even when they seem redundant.

### Identity anchor (character or enemy)

```text
Intended use: the canonical right-facing idle frame for {NAME} in a 2D side-scrolling gothic action game. It must read as one {LOGICAL_SIZE} in-game sprite, delivered at {OUTPUT_SIZE} so each sprite pixel is a clean block.

Image 1 role: style anchor. Match its pixel-art style, palette and lighting only. Do not copy its character or pose.
Image 2 role: pixel grid. Use it only to keep chunky, even pixel blocks. Do not copy its content.

Subject: {NAME}, {ARCHETYPE}. Side view facing right, full body, calm neutral idle pose, feet planted at the bottom center. {SILHOUETTE_NOTES}. {COSTUME_DETAILS}. {WEAPON_DETAILS}.

Style: 16-bit era gothic pixel art, crisp edges, limited shading with small highlight pixels, light from the top left, palette limited to {PALETTE}.
Background: solid #FF00FF outside the silhouette.
Avoid: effects or glows, extra characters, scenery, text, logos, watermarks, painterly blending, anti-aliased halos, photorealism.
```

### Animation frame (one request per frame)

This wording produced correct, consistent run frames in testing. Send it once per frame, with that frame's pose guide.

```text
Please generate an image. This is frame {N} of {FRAME_COUNT} of {NAME}'s side-view {ANIMATION}; I will ask for each frame separately. Output one sprite frame, {OUTPUT_SIZE}.

Image 1 role: identity anchor. Preserve the exact identity, {KEY_FEATURES}, proportions, pixel-art style, palette, right-facing direction and the same character size as Image 1.
Image 2 role: pose guide. Copy the mannequin's pose exactly: leg and arm angles, knee bends, which foot touches the dashed line, and torso lean. BLUE = the character's right leg, nearer to the viewer, in front of the body. DARK BROWN = the left leg, farther away, behind the body. CYAN = right arm. DARK YELLOW = left arm.
(Image 3 and later, once accepted: earlier frames of this animation, for consistency only.)

Pose for this frame: {POSE_IN_WORDS}.
Shade the far-side left leg and left arm one step darker than the near-side ones so the legs are easy to tell apart. Feet on the dashed line, character horizontally centered. Do not draw the mannequin, its colors or the dashed line. {WEAPON_RULE}. Solid flat #FF00FF background. Avoid effects, dust, shadows, scenery, text, watermarks.
```

Describe the pose in words as well as in the guide, naming which leg is forward and which foot is planted. For the passing frame, say explicitly that the legs cross under the body with the swinging knee raised, "not a wide stride".

### Stage scene

```text
Intended use: the {LAYER} layer of stage {N}, "{STAGE_NAME}", for a 2D side-scrolling gothic action game, {OUTPUT_SIZE}, horizontally tileable.

Image 1 role: the previous stage's approved background. Keep its pixel-art style, horizon height, light direction and overall palette so the stages feel continuous.
Image 2 role: style anchor. Match its rendering style only.

Scene: {DESCRIPTION}. Carry over from the previous stage: {CONTINUITY}. New in this stage: {CHANGES}.
Composition: side view, the walkable floor line at {FLOOR_HEIGHT} from the bottom, no characters, nothing important in the area the HUD covers ({HUD_AREAS}).
Avoid: characters, text, logos, watermarks, perspective other than side view, seams at the left and right edges.
```

### UI element

```text
Intended use: {ELEMENT} for the game's HUD/menus, delivered at {OUTPUT_SIZE}, used at {LOGICAL_SIZE}.

Image 1 role: UI anchor. Match its frame style, ornament, materials and palette exactly.

Element: {DESCRIPTION}. Leave {TEXT_AREA} empty: the game renders all text itself, in English and Traditional Chinese.
Background: solid #FF00FF outside the element.
Avoid: any letters, numbers or symbols that look like text, drop shadows outside the element, perspective.
```

UI art never contains text: every word on screen stays in `i18n.js`.

## Self-review and escalation

Before accepting an asset, check it against the art bible's checklist: silhouette readable at real size, palette, light direction, scale against anchors, baseline, no drift, and enemy attack warnings still readable on top of the scene. Accept it yourself when every item passes.

Ask the user only when:

- you cannot decide (for example two good variations, or a style question the art bible does not answer); or
- **10 accepted assets** have built up since the user's last art review, or a whole new character, enemy or stage look is finished.

To ask, commit the images to the working branch and post an Issue comment that embeds them (`![name](https://github.com/<owner>/<repo>/blob/<branch>/<path>?raw=true)`) with a numbered question per image. Proposals may embed concept images the same way so the user reviews the idea and the look together. Keep working on other items while waiting; do not merge art the user was asked about until they answer.
