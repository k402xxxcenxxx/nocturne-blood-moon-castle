# NOCTURNE Game Design Document (GDD)

Maintained by the Game Designer. This document records the rules and numbers **as they are now**; anything only planned lives in Issues. `core.js` is the source of truth for numbers: when the two disagree, fix this document. Display names come from `i18n.js` (English shown here).

## Core fun and design pillars

> Locking this section is one of the M0 Prototype exit criteria. Below is the current draft.

- **Core fun (draft)**: read the gaps between enemy warnings, chain combos, dashes and Eclipse into a clean run, then pick a relic that changes how the next stage plays.
- **Pillars (draft)**
  1. **Read and react**: every enemy attack has a visible warning (`tell`); dodging takes skill, not luck.
  2. **Impact feedback**: every hit gets hit-stop, a flash, knockback, sound and a number.
  3. **Every run differs**: relic combinations and random placement change the decisions in each run.

## Run structure

- Five stages in order: The Forsaken Gate, The Forbidden Archive, The Timeless Belfry, The Crimson Cathedral, The Bloodmoon Throne.
- The Moon Gate at the far right opens only after every enemy in the stage is defeated.
- After each of the first four stages, 3 of the 10 relics are offered and the player picks 1; relics can be offered again and stack. Picking restores 20 HP and fills MP.
- Clearing stage five wins. Dying resets the run's relics and progress. Only records persist between runs: deepest stage reached, completed runs, runs started.
- `souls` accumulate but currently have no use.

## Player

| Stat | Value |
| --- | --- |
| HP / MP | 100 / 100; MP regenerates 8 per second, +2 per hit, +6 per kill |
| Movement | Speed 245, 65% while attacking; gravity 1550 |
| Jump | Double jump: first jump velocity -575, second -520; no jumping while dashing |
| Three-hit combo | Base damage 24; combo multipliers 1 / 1.15 / 1.6; third hit +24 reach; attack cooldown 0.29 s, 0.39 s on the third hit; 0.8 s combo window |
| Critical | 12% chance, double damage, capped at 80% |
| Dash | Lasts 0.18 s at speed 730; 0.85 s cooldown; 0.23 s invulnerability; passes through enemy projectiles unharmed |
| Eclipse magic | Costs 35 MP; 58 damage; radius 210; clears projectiles within 230; 0.65 s cooldown; 0.28 s invulnerability on cast |
| Taking damage | 0.8 s invulnerability afterwards; 0.06 s hit-stop |

## Enemies

Regular enemies scale with `stage` (0 to 4): health +12×stage, damage 8 + 2.5×stage. The boss is fixed at 640 HP and 22 damage.

| Type | Base health | Speed | Behavior | Warning time |
| --- | --- | --- | --- | --- |
| Skeleton `skeleton` | 43 | 72 | Closes in for a melee attack, range 82 | 0.43 s |
| Bat `bat` | 27 | 115 | Tracks the player in the air, then swoops | 0.3 s |
| Armored knight `knight` | 65 | 57 | Melee; appears from stage 2 | 0.6 s |
| Shield bearer `shield` | 55 | 50 | Faces the player; starts a shield bash within 70 that hits only its front (range 70); facing is locked during the warning; after the bash, a 0.6 s turn delay where it keeps its old facing and stands still; replaces some knights from stage 2 | 0.55 s |
| Spearman `spear` | 53 | 77 | Keeps 80-145 from the hero (walks in beyond 145, backs off at ×0.8 speed inside 80). Thrusts when within 193 horizontally and 64 vertically: hit box from 10 to 194 in front, 54 tall up from the feet (`thrustBox`, set at warning start); facing locked during the warning; 0.72 s standing recovery after the thrust; normal flinch; the hit test uses the hero's full width, so the real safe distance is about 208 px centre-to-centre (same body check as other enemies); replaces ~28% of knights from stage 2 | 0.64 s |
| Mage `mage` | 43 | 72 (×0.6 while moving) | Keeps its distance and fires projectiles; appears from stage 3 | 0.65 s |
| The Fallen King `boss` | 640 | 75 | Heavy cleave (range 155), or a three-way barrage every 3rd action; 1.5× speed below half health | 0.72 s, 0.48 s below half health |

Shield bearer guard: sword hits from the side it faces deal ×0.15 damage (minimum 1), push the player back 40 and cause no stun, knockback or bash interruption. On each blocked hit the bearer shoves forward with the player: it steps up to 40 in its facing direction (also during the bash warning), never closer than 30 to the player's centre, so blocking never opens distance and holding attack from the front walks you into its bash. Sword hits from behind and Eclipse deal full damage; like any unblocked hit they stun it and cancel a bash warning. An Eclipse hit breaks the guard for 1.5 s, during which frontal sword hits also deal full damage. Dashes pass through it like any enemy (no body collision; dash invulnerability covers the bash).

Shield bearer facing: it keeps its facing locked for the whole 0.55 s bash warning, and the bash only hits the side it faces, so dashing through during the wind-up makes it whiff and leaves its back open. Outside the warning and the 0.6 s post-bash turn delay, when the player crosses to its back it waits 0.25 s (re-face delay, standing still) before turning around; jumping over it therefore always buys a short opening. The re-face delay does not stack with or extend the post-bash turn delay; when that delay ends it faces the player immediately.

Wind-up limit: an enemy may start a warning only if fewer than N other living enemies within 620 of the hero are already winding up, with N = 2 in stages 1 to 3 and N = 3 in stages 4 and 5 (the boss counts and obeys it). A refused enemy keeps moving and retries next frame without spending its cooldown. Enemies farther than 560 from the hero (boss: 620) never start a warning.

Kills have a 25% chance to drop a heal that restores 14 HP.

## Relics

| id | Name | Effect |
| --- | --- | --- |
| edge | Bloodthirst Edge | Basic attack damage ×1.25 |
| haste | Gale Feather | Attack cooldown ×0.82, movement speed ×1.08 |
| crit | Hunter's Gaze | Critical chance +18% (cap 80%) |
| vital | Undying Heart | Max HP +30 and restore 40 |
| leech | Crimson Pact | Restore 5 HP per kill |
| arcane | Eclipse Codex | Magic damage ×1.45, MP cost -5 (floor 15) |
| reach | Phantom Glaive | Attack reach +28, knockback +70 |
| mana | Starnight Crystal | Max MP +30, MP regeneration ×1.5 |
| dash | Raven Shadow | Dash cooldown ×0.7, dash invulnerability +0.1 s |
| armor | Darksilver Charm | Damage taken ×0.8 and restore 20 HP |

## Playtest verdicts

After each proposal is playtested, add one line here: `#<issue> <name> — keep / adjust / drop: <one-line reason>`.

#2 Shield bearer — keep (automated playtest; pending the user's hands-on feel check): head-on costs 22–64 HP while all three answers work at 0 damage (jump behind 2.5–3.3 s, dash through the wind-up 0.7–1.5 s, Eclipse 0.4–0.7 s for 35 MP), so it forces the intended choice; open: P3 turn delay during stun, `!` contrast and turn-cue taste notes, real-device check, generated sprite.
