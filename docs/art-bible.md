# Art bible

The visual source of truth for every generated asset. Maintained by the Technical Artist; the process for using it is in [`docs/art-pipeline.md`](art-pipeline.md).

> **Status: not built yet.** Every section marked *TBD* is filled by the first art bible Issue. Until the anchor index below lists approved anchors, no game art may be generated (see "When to generate" in the pipeline).

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
| Hero frame | *TBD* (body is 28×58 world units) | *TBD* | Feet at the cell's bottom center |
| Regular enemy frame | *TBD* (27×58; bat 27×28) | *TBD* | |
| Boss frame | *TBD* (64×102) | *TBD* | |
| Stage background layer | *TBD* (view is 960–1500 × 540) | *TBD* | Floor line at y = 438 |
| UI element | *TBD* | *TBD* | No text inside |

## Animation list

From the current game; frame counts *TBD* against the timings in `core.js`.

| Subject | Animations |
| --- | --- |
| Hero | idle, run, jump, double jump, fall, attack 1 / 2 / 3, dash, cast Eclipse, hurt, death |
| Skeleton, knight | idle/walk, warning (`tell`), attack, hurt, death |
| Bat | fly, warning, swoop, hurt, death |
| Mage | idle/walk, warning, cast, hurt, death |
| Fallen King | walk, warning, heavy cleave, barrage cast, hurt, death |

## Anchor index

Every approved image that other assets must match. Attach the relevant anchors to every generation.

| Anchor | File | Use it for |
| --- | --- | --- |
| *none yet* | | |

## Layout guides

*TBD*: frame-grid and pixel-grid images in `docs/art-bible/guides/`, one per sheet layout used.

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
