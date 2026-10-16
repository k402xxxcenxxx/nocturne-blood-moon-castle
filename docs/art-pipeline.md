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

ChatGPT keeps a character consistent across a multi-panel sheet better than across separate requests, but it still drifts. The approach that works:

1. Generate or reuse the character's **identity anchor**: a neutral, right-facing idle frame at the art bible's size.
2. Generate the **animation sheet** in one image, attaching the identity anchor (Image 1) and the matching layout guide from `docs/art-bible/guides/` (Image 2). Describe every frame by number.
3. **Refine bad frames individually**: attach the anchor plus the good neighboring frames and regenerate only the broken frame. For hard poses, attach a pose reference (a mannequin-style drawing of the pose) as Image 1 and the character as Image 2 and ask for a pose transfer.
4. If frames vary too much, attach the assembled sheet and ask: `Normalize the style, character consistency and size for this sprite sheet, keeping all the poses intact.`
5. **Normalize** (below). Image generation is roughly 20% of the work; normalization is the rest.

Frame counts and timings come from the game, not from the image: check `docs/game-design.md` and `core.js` (for example the attack lasts 0.24 s and the dash 0.18 s) and list the frames the animation needs before generating.

## Normalization

Raw generated images are not game assets. Before an image enters `assets/`:

1. **Recover frames** using each subject's alpha bounding box, not the nominal grid.
2. **Remove the chroma background** into real transparency.
3. **Measure** each frame: visible width and height, center x, and foot baseline (lowest opaque row).
4. **Correct scale** to the character's approved height in the art bible.
5. **Re-pad** every frame onto a fixed cell with the same center x and foot baseline.
6. **Downscale to the logical size** with nearest-neighbor so pixels stay crisp, and snap colors to the palette.
7. **Pack** the frames into the runtime sheet (one row per animation, frame order left to right).
8. **Verify** with a contact sheet and an animated preview at real size: no drift, no scale jump between animations.

Normalization must not add dependencies or a build step. The tool for it is a dependency-free browser page, `tools/sprite-normalizer.html` (Canvas only; not deployed). Until it exists, building it is part of the first art bible Issue.

## Files

| Path | Contents | Deployed |
| --- | --- | --- |
| `docs/art-bible.md` | Style rules, palette, sizes, anchor index | No |
| `docs/art-bible/anchors/` | Approved anchor images | No |
| `docs/art-bible/guides/` | Layout guides (frame grids, pixel grids) | No |
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

### Animation sheet

```text
Intended use: a {FRAME_COUNT}-frame {ANIMATION} animation for {NAME} in a 2D side-scrolling game, as a {COLUMNS}x{ROWS} sprite sheet of equal {CELL_SIZE} cells.

Image 1 role: identity anchor for {NAME}. Preserve the exact identity, outfit, proportions, weapon placement, silhouette, palette and right-facing direction in every frame.
Image 2 role: layout guide for {COLUMNS}x{ROWS} equal cells. Use it only for the grid; do not draw its lines.

Frame order: left to right across each row, then the next row.
Frame 1: {POSE}.
Frame 2: {POSE}.
… (one line per frame)

Rules: same scale, camera and foot baseline in every cell; full body visible in each cell; character faces right in every frame; effects only where listed; solid #FF00FF background.
Avoid: direction changes, camera changes, merged cells, comic panels, recentering per frame, cropped feet or weapons, scenery, text, grid lines, watermarks.
```

### Single-frame repair or pose transfer

```text
Image 1 role: target pose. Copy only the body pose and limb positions.
Image 2 role: identity anchor for {NAME}. Preserve identity, outfit, palette, proportions and scale exactly.

Draw {NAME} in the pose from Image 1, facing right, same pixel-art style and size as Image 2, feet on the same baseline, solid #FF00FF background, no effects, no text.
```

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
