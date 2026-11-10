# Art bible

The visual source of truth for every generated asset. Maintained by the Technical Artist; the process for using it is in [`docs/art-pipeline.md`](art-pipeline.md).

> **Status: started with the hero.** Sections still marked *TBD* are filled as their subjects are converted. Enemies and scenes are still code-drawn.

## Direction

- 16-bit era gothic pixel art; moonlit castle, blood moon, candlelight.
- Mood references: `docs/references/` (original concept art; atmosphere and color only).
- Light from the top left. Warm light sources (candles, torches) against cold stone and night.
- Readability first: the player, enemies and attack warnings must stand out from every background.

## Palette

*TBD*: 16–32 named swatches with hex values, grouped as stone, night sky, warm light, blood/red accents, magic/violet, UI gold. Generated art is snapped to these colors during normalization.

## Sizes

*TBD*, decided from the current game so collisions do not change:

| Asset | Logical size | Generated at | Notes |
| --- | --- | --- | --- |
| Hero frame | 68 px head to toe (body is 28×58 world units) | 480p video | One sheet per weapon, 32 shared colors each. Cell and origin are in `assets/hero*-sheet.js` |
| Regular enemy frame | *TBD* (27×58; bat 27×28) | *TBD* | |
| Boss frame | *TBD* (64×102) | *TBD* | |
| Stage background layer | *TBD* (view is 960–1500 × 540) | *TBD* | Floor line at y = 438 |
| UI element | *TBD* | *TBD* | No text inside |

## Animation list

From the current game; frame counts *TBD* against the timings in `core.js`.

| Subject | Animations |
| --- | --- |
| Hero | idle 4, run 6, jump 2, double-jump flip 6, fall 1, dash 3, plunge 2, slash 1 / 2 / 3 at 5 / 5 / 6, thrust 4, cast 5, hurt 3, death 8 (frames) |
| Skeleton, knight | idle/walk, warning (`tell`), attack, hurt, death |
| Bat | fly, warning, swoop, hurt, death |
| Mage | idle/walk, warning, cast, hurt, death |
| Fallen King | walk, warning, heavy cleave, barrage cast, hurt, death |

## Anchor index

Every approved image that other assets must match. Attach the relevant anchors to every generation.

| Anchor | File | Use it for |
| --- | --- | --- |
| Hero identity | `docs/art-bible/raw/hero-merlin-source.png` | Design reference for the hero |
| Hero video first frame | `docs/art-bible/anchors/hero-video-first-frame.png` | First frame of every rapier clip |
| Gate Warden first frame | `docs/art-bible/anchors/warden-first-frame.png` | First frame of every Warden clip (#81). Three-quarter side view facing right, body about 42% of the frame |
| Fallen King first frame | `docs/art-bible/anchors/king-first-frame.png` | First frame of every King clip (#81). Three-quarter side view facing right, greatsword low and forward |
| Weapon first frames | `docs/art-bible/anchors/hero-heavy-first-frame.png`, `hero-twin-first-frame.png`, `hero-spear-first-frame.png` | First frame of every clip of that weapon. Heavy and spear are shifted left so the weapon stays in frame |

## Pose guides

*TBD*: one mannequin pose guide per animation frame in `docs/art-bible/guides/`, drawn by `tools/pose-guide.html` from joint angles (near limbs bright, far limbs dark, dashed ground line). Loops list only half a cycle, for example the run as contact, down, passing.

## Review checklist

An asset is accepted only if all of these pass:

- [ ] Silhouette reads clearly at real in-game size.
- [ ] Colors are from the palette after normalization.
- [ ] Light comes from the top left.
- [ ] Scale matches the anchors; feet sit on the shared baseline.
- [ ] No drift between frames in the animated preview.
- [ ] Enemy attack warnings stay readable on top of every stage background.
- [ ] No text, logos or watermarks; nothing resembling a commercial game's characters.
- [ ] The prompt and anchors used are logged in `docs/art-log.md`.
