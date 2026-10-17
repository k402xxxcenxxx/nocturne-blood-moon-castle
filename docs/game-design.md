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
- After each of the first four stages, 3 of the 14 relics are offered and the player picks 1; relics can be offered again and stack. Picking restores 20 HP and fills MP.
- Clearing stage five wins. Dying resets the run's relics and progress. Only records persist between runs: deepest stage reached, completed runs, runs started.
- `souls` accumulate but currently have no use.

## Player

| Stat | Value |
| --- | --- |
| HP / MP | 100 / 100; MP regenerates 8 per second, +2 per hit, +6 per kill |
| Movement | Speed 245, 65% while attacking; gravity 1550 |
| Jump | Double jump: first jump velocity -575, second -520; no jumping while dashing |
| Three-hit combo | Base damage 24; combo multipliers 1 / 1.15 / 1.8 (heavy finisher); third hit +24 reach; poise damage 17 / 17 / 62; attack cooldown 0.29 s, 0.39 s on the third hit; 0.8 s combo window |
| Critical | 12% chance, double damage, capped at 80% |
| Dash | Lasts 0.18 s at speed 730; 0.85 s cooldown (floor 0.35 s however many Raven Shadow stacks); 0.23 s invulnerability, which never shortens longer immunity already running (max, not assignment); a projectile that meets the dashing (or dash-shielded) hero is consumed without hurting |
| Dash thrust | An attack pressed within 0.65 s after a dash ends (the window runs from the end of the dash) becomes a thrust: lunges forward at 420 during its active frames, reach 155, height 30 around the chest, damage ×1.35, auto-faces a living enemy within 200 horizontally (prefers the current facing side, else the nearest) when no direction is held at thrust start, heavy knockback, 35 poise damage; does not advance or reset the ground combo; blocked by a shield bearer's front like any sword hit. Swing event has `move: 'thrust'` |
| Air plunge | Attack pressed while not grounded (wins over a thrust) starts a plunge, `move: 'plunge'`: 0.07 s wind-up hang, then downward speed at least 800. The hero hits enemies it falls through (×1.25, heavy). On landing (floor or platform) after a fall of at least 40 px (measured from the y where the attack was pressed to the landing y) a shockwave of radius 90 (+12 per Phantom Glaive stack, cap 150) with vertical reach 100 hits others (×1.0, heavy, knockback ×1.4) and `plunge` {x, y, radius} is emitted. A shorter fall still deals its fall hits but no shockwave: `plunge` is emitted with `radius: 0` (art skips the dust ring). Poise damage 45 for both. One hit per enemy per plunge; never blocked by a shield bearer. 0.09 s recovery; no jump or dash during the plunge (dash and attack inputs are buffered; the 0.16 s buffers do not count down while the plunge is active, so they fire after recovery), Eclipse allowed. Does not advance or reset the combo; cleared by loadStage and death |
| Perfect dodge | The first 0.15 s of a dash. An enemy hit or projectile that would have hurt, and was stopped only by the dash's own invulnerability (not by earlier hit/Eclipse immunity), gives +10 MP and refreshes the thrust window to 0.9 s counted from the perfect-dodge moment; once per dash; emits `perfectDash` |
| Input buffer | An attack pressed during attack recovery or a dash is buffered for 0.16 s (held through the dash) and fires as soon as allowed. A dash pressed while not allowed (cooldown, or before 74% of an attack) is likewise buffered for 0.16 s |
| Dash cancel | A dash can cancel an attack only after 74% of its 0.24 s has played; earlier dash input is buffered (see Input buffer) |
| Eclipse magic | Costs 35 MP; 58 damage; radius 210; clears projectiles within 230; 0.65 s cooldown; 0.28 s invulnerability on cast |
| Taking damage | 0.8 s invulnerability afterwards; 0.06 s hit-stop |

## Enemies

Regular enemies scale with `stage` (0 to 4): health +12×stage, damage 8 + 2.5×stage. The boss is fixed at 900 HP and 22 damage.

| Type | Base health | Speed | Behavior | Warning time |
| --- | --- | --- | --- | --- |
| Skeleton `skeleton` | 43 | 72 | Closes in for a melee attack, range 82 | 0.43 s |
| Bat `bat` | 27 | 115 | Tracks the player in the air, then swoops (range 55) | 0.36 s |
| Armored knight `knight` | 65 | 57 | Melee; appears from stage 2 | 0.6 s |
| Shield bearer `shield` | 55 | 50 | Faces the player; starts a shield bash within 70 that hits only its front (range 70); facing is locked during the warning; after the bash, a 0.6 s turn delay where it keeps its old facing and stands still; replaces some knights from stage 2 | 0.55 s |
| Spearman `spear` | 53 | 77 | Keeps 80-145 from the hero (walks in beyond 145, backs off at ×0.8 speed inside 80). Thrusts when within 193 horizontally and 64 vertically: hit box from 10 to 194 in front, 54 tall up from the feet (`thrustBox`, set at warning start); facing locked during the warning; 0.72 s standing recovery after the thrust; normal flinch; the hit test uses the hero's full width, so the real safe distance is about 208 px centre-to-centre (the other melee enemies use a centre-distance check and ignore the hero's width; only the spear thrust uses the hero's full width); replaces ~28% of knights from stage 2 | 0.64 s |
| Blood priest `priest` | 54 | 67 | Keeps 185-335 from the hero (walks in beyond 335, backs off inside 185). If another living non-boss enemy is within 250 and its 7 s bless cooldown is ready: 0.9 s `bless` warning (`blessRadius` = 250 while up), then every living non-boss ally within 250 gets `blessed` = 5 s (damage ×1.25, speed ×1.15). Otherwise fires one mage-style bolt. Any hit on the priest cancels a bless in progress and sets its bless cooldown to 2.5 s; replaces ~30% of mage rolls from stage 3 | 0.9 s |
| Mage `mage` | 43 | 72 (×0.6 while moving) | Keeps its distance and fires projectiles; appears from stage 3 | 0.65 s |
| The Fallen King `boss` | 900 | 75 | Three phases, see "The Fallen King" below | see below |

Poise and stagger: every enemy has `poise` / `maxPoise` (skeleton 40, bat 22, mage 34, shield bearer 60, knight 110, spearman 48, priest 42, boss 120). Poise damage: combo hits 1-2 = 17, hit 3 = 62, dash thrust = 35, Eclipse = 55, plunge = 45. Poise never regenerates; at 0 the enemy staggers: stunned 1.0 s (boss 0.85 s), its warning and any attack in progress are cancelled (a cancelled bless sets the 2.5 s bless cooldown), poise refills to max, and `stagger` is emitted. A staggered shield bearer has its guard down for the stun. Hits never shorten an existing stun. For 1.2 s (boss 0.6 s) after a stagger stun ends (`armor` field, counts down from stun + 1.2 s; the boss gets 0.6 s instead) the enemy takes damage but no poise damage, and hits do not cancel its warning, stun it or knock it back. Knights and the boss are not interrupted by light hits during a warning unless the hit breaks poise (other enemies flinch as before; the boss still takes its 0.08 s hit stun); a knight that keeps its warning takes 40% of the normal knockback. Eclipse always cancels a non-boss warning with the usual flinch, overriding both the knight rule and post-stagger armor. During the boss slam and ritual warnings `punishable` is true and poise damage is ×2. Blocked shield bearer hits deal 25% poise damage (a frontal combo is about 24 of its 60, so a purely frontal approach needs roughly three combos; Eclipse or hits from behind break it much faster). The boss refills poise on every phase change.

Shield bearer guard: sword hits from the side it faces deal ×0.15 damage (minimum 1), push the player back 40 and cause no stun, knockback or bash interruption. On each blocked hit the bearer shoves forward with the player: it steps up to 40 in its facing direction (also during the bash warning), never closer than 30 to the player's centre, so blocking never opens distance and holding attack from the front walks you into its bash. Sword hits from behind and Eclipse deal full damage; like any unblocked hit they stun it and cancel a bash warning. An Eclipse hit breaks the guard for 1.5 s, during which frontal sword hits also deal full damage. Dashes pass through it like any enemy (no body collision; dash invulnerability covers the bash).

Shield bearer facing: it keeps its facing locked for the whole 0.55 s bash warning, and the bash only hits the side it faces, so dashing through during the wind-up makes it whiff and leaves its back open. Outside the warning and the 0.6 s post-bash turn delay, when the player crosses to its back it waits 0.25 s (re-face delay, standing still) before turning around; jumping over it therefore always buys a short opening. The re-face delay does not stack with or extend the post-bash turn delay; when that delay ends it faces the player immediately.

Wind-up limit: an enemy may start a warning only if fewer than N other living enemies within 620 of the hero are already winding up, with N = 2 in stages 1 to 3 and N = 3 in stages 4 and 5 (the boss counts and obeys it). A refused enemy keeps moving and retries next frame without spending its cooldown. Enemies farther than 560 from the hero (boss: 620) never start a warning. A warning that has started always finishes and attacks, however far away the hero is.

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
| dash | Raven Shadow | Dash cooldown ×0.7, dash invulnerability +0.1 s, thrust damage +35% (multiplier capped at ×2.4), +8 MP on a perfect dodge (capped at 30) |
| armor | Darksilver Charm | Damage taken ×0.8 and restore 20 HP |
| fire | Ember Edge | Hits burn 4 s, 0.14 × base per tick per stack |
| frost | Moonfrost Sigil | Hits chill and build frost meter (+1 per stack); at 3 the enemy freezes; bonus hit 0.08 × base per stack |
| shock | Thunder Conduit | Hits shock 4 s; chain range +14 and +1 target per stack |
| bleed | Blood Sigil | Hits add bleed stacks (+1 per relic stack, max 10 × Blood Sigils owned on an enemy) for 5 s; 0.1 × base per bleed stack per tick |

## Elemental statuses and reactions

"Hits" are sword hits (combo, thrust, plunge fall and shockwave) and Eclipse. "Base" is the hero's `damage`. "Stacks" are copies of the relic owned; every per-stack value uses the stack count directly. Blocked shield-bearer hits apply nothing. Damage over time ticks every 0.5 s. Damage-over-time, bonus-hit and reaction damage cause no hit-stop, stun, flinch or poise damage, apply no statuses, emit `statusTick` {source, x, y, amount} and give kill credit (souls, `leech`, MP, drops) like any kill, but only while the run is `playing` (no kills, souls or leech after the hero dies; enemies still die). The damage-number overlay shows at most 12 `statusTick` numbers at once. Statuses live on the enemy (`burn`, `bleed`, `bleedStacks`, `chill`, `frozen`, `frostMeter`, `shock`) and reset on stage load. Reactions read the enemy's state before the hit, then the hit applies its own statuses. Heavy = combo hit 3, thrust, plunge, Eclipse.

| Status | Effect |
| --- | --- |
| Burn (fire) | 4 s, refreshed (never stacked) by each hit; 0.14 × base × fire stacks per tick |
| Chill (frost) | 2.5 s, enemy speed ×0.68 (boss ×0.85) |
| Frozen (frost) | Frost meter +stacks per hit (+1 more from Eclipse); at 3 the meter resets and the enemy freezes for min(1.5, 0.75 + 0.12 × stacks) s. Frozen enemies cannot move or act and their warnings are cancelled (not paused). Boss: frozen 0.28 s, then immune to freezing until 1.8 s later; the meter still resets. After any thaw (timeout or Shatter) a normal enemy is immune to freezing for 2 s and gains no frost meter meanwhile (the boss keeps its 1.8 s). The frost meter decays to 0 after 3 s without a frost hit |
| Shock (shock) | 4 s, refreshed by each hit |
| Bleed (bleed) | 5 s, refreshed; stacks reset when it expires |

| Reaction | Condition | Effect | Event |
| --- | --- | --- | --- |
| Shatter | frost owned, heavy hit on a frozen enemy | Unfreezes; base × (1 + 0.65 × frost) to every enemy within 130 + 10 × frost, target included | `reaction` {name:'shatter', x, y, radius} |
| Blood Flame | fire owned, heavy hit on a bleeding enemy; at most once per attack (a plunge's fall and shockwave count as one) or Eclipse cast, on the first bleeding enemy processed, other targets keep their bleed | Consumes all its bleed stacks; (0.7 + 0.3 × stacks) × base × (1 + 0.3 × fire) to every enemy within 115, target included | `reaction` {name:'bloodFlame', x, y, radius} |
| Chain Lightning | shock owned, any sword hit (not Eclipse; Eclipse still applies shock) on an already shocked enemy | Arcs to the (2 + shock) nearest other living enemies within 180 + 14 × shock; (0.35 × base + 0.12 × that hit's damage) × shock each; shocks them (no further chaining) | `reaction` {name:'chain', x, y, targets:[{x,y}]} |

Attack-form projectiles do not exist yet; `damageEnemy` ends with the single `elements()` hook they should call.

## Playtest verdicts

After each proposal is playtested, add one line here: `#<issue> <name> — keep / adjust / drop: <one-line reason>`.

#2 Shield bearer — keep (automated playtest; pending the user's hands-on feel check): head-on costs 22–64 HP while all three answers work at 0 damage (jump behind 2.5–3.3 s, dash through the wind-up 0.7–1.5 s, Eclipse 0.4–0.7 s for 35 MP), so it forces the intended choice; open: P3 turn delay during stun, `!` contrast and turn-cue taste notes, real-device check, generated sprite.

## The Fallen King (stage 5 boss)

900 HP, 22 damage, poise 120, speed 75 (no speed-up in later phases). Phase by health: 1 above 67%, 2 at 67% or below, 3 at 34% or below. Entering a phase cancels the current move and warning, refills poise, starts a 1.1 s pause (`pause`: no attacks, still hittable) and emits `bossPhase` {phase, x, y}.

Every warning stores its exact hit area in `e.warn` (`kind` plus the fields below); the attack hits exactly that area. The boss faces a fixed direction from the warning start until the move ends. `e.move` is the active move. The same move is never chosen twice in a row, and every warning respects `canWindUp`.

| Move | Used | Warning | Hit area (`e.warn`) | Damage |
| --- | --- | --- | --- | --- |
| `slash` | hero within 145 | 0.62 s (follow-up 0.46 s) | `box` 146 wide in front, boss height | ×1 |
| `slam` | hero within 145 | 0.88 s, `punishable` (poise ×2), recovery 1.0 s standing still | `box` 112 × 123 in front; phase 2+ adds `wave` (floor line, 760 long) and spawns a ground projectile (`ground: true`, speed 240, jump it; a dash does not pass through it: like any projectile it is consumed on contact with the dashing hero, who takes no damage) at ×0.7 | ×1.3 |
| `charge` | hero farther than 145 (phase 1 beyond 145 has no other legal move, so it may repeat the charge) | 0.82 s, then travels 305 in 0.48 s | `line` to the end point and `box` (swept body); contact hurts once | ×1.1 |
| `volley` | phase 2+, hero farther than 170 | 0.92 s | `lines` (five aim lines, `angle` each, spread -0.5..0.5 rad) then five bolts at speed 265 toward the hero position at warning start, each travelling only the drawn line length (420 px, shared constant `VOLLEY_RANGE`); Eclipse clears them | ×1 |
| `ritual` | phase 3, every third action | 1.28 s, `punishable` (poise ×2) | `circles` three discs r 56 on the floor at hero x at warning start -200, 0, +200 (88-wide safe gaps); they do not follow the hero | ×1.35 |

Phase 2+: every second `charge` is followed by a quick `slash` if the hero is within 190. Stage 5 has two raised ledges near the arena edges (x 60 and width-250, 190 wide, 110 px above the floor) as escape routes; the centre is flat. A single jump rises about 107 px and cannot reach a ledge; a double jump can. Slam and charge on the floor are answered by a dash or a double jump. A hero on a ledge is outside slash (102 px tall), charge, ritual circles and the slam ground wave, but not the slam box (123 px tall).
