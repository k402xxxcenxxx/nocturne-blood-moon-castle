# Art log

One row per generated asset, newest first. See "Files" in `docs/art-pipeline.md`.

| Date | Asset | Anchors attached | Conversation | Prompt | Result |
| --- | --- | --- | --- | --- | --- |
| 2026-11-07 | `raw/hero-{heavy,twin,spear}-{combat,loco,fall}.mp4` | hero-{weapon}-first-frame | Merlin, Seedance 2.0 Mini, 480p, audio, 200 credits each, 9 clips | Skill template with weapon-specific moves | All accepted on the first try. Dust masked with `clear` |
| 2026-11-07 | `raw/hero-{heavy,twin,spear}-source.png` | hero-video-first-frame | Merlin, GPT Image 2, about 88 credits each | Same character, replace the weapon, keep size, position and background | Accepted, and shifted into first frames |
| 2026-11-07 | `raw/hero-cast-fall.mp4` | hero-video-first-frame | Merlin, Seedance 2.0 Mini, 480p, audio, 200 credits | Skill template; sword raised at 1 s and held, recoil at 2.5 s, knees at 3 to 4 s, collapse at 4 to 5 s | Accepted: cast, hurt, death, magic and hurt sounds |
| 2026-11-07 | `raw/hero-mobility.mp4` | hero-video-first-frame | Merlin, Seedance 2.0 Mini, 480p, audio, 200 credits | Skill template; leap, somersault, fall, crouch landing, low dash, plunge | Accepted: jump, flip, fall, dash, plunge and sounds. Dash has dust at the left, masked with `minX`; the plunge kept the sword raised, not point-down |
| 2026-11-07 | `raw/hero-combat.mp4` | hero-video-first-frame | Merlin, Seedance 2.0 Mini, 480p, audio, 200 credits | Skill template; horizontal slash, overhead slash, rising slash, thrust | Accepted: idle, slashes, thrust and sounds. Tip sparkles avoided by frame choice |
| 2026-11-07 | `raw/hero-locomotion.mp4` | Hero identity | Merlin, Seedance 2.0 Mini, 480p, user's earlier chat | In-place walk, run and jump | Run loop used |
