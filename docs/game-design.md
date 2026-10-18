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
- The Moon Gate at the far right opens when every **required guard** is dead: 2 marked enemies (`required: true`, never bats) placed in the last room 230-380 px before the gate on stages I to IV, and the Fallen King alone on stage V. All other enemies can be skipped. `guardStatus()` returns `{ n, total }` (dead / required) and a `guards` event with the same fields fires on each required kill; the HUD counter reads "Guards n/total".
- Stages I to IV are a row of 5 authored rooms (see "Stage routes"); stage V is the unchanged arena.
- Before stage 1 the run opens with a build pick: 3 relics drawn only from the build pool (Returning Crescent, Starpierce Lance, Fallen Star Vow, Vortex Eclipse, Ember Edge, Moonfrost Sigil, Thunder Conduit, Blood Sigil). It restores no HP or MP. A run therefore has 5 picks.
- Relics list synergy partners (Eclipse Codex+Vortex/Ember/Moonfrost, Raven Shadow+Lance, Crescent+Thunder/Vortex/Blood Sigil, Lance+Vortex, Fallen Star+Moonfrost/Ember, Ember+Blood Sigil). When offers are rolled a relic's weight is 1 + 0.8 per distinct owned partner; offers are 3 distinct relics (weighted, without replacement). Synergies are text and weighting only.
- Each of stages I to IV also has two chests (see "Stage routes"). After each of the first four stages, 3 of the 21 relics are offered and the player picks 1; relics can be offered again and stack. Picking restores 20 HP and fills MP.
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

## Stage routes

Stages I to IV widths are 3000 / 3050 / 3100 / 3200 (boss stage 2800). Each is 5 rooms of width `width / 5` ± 30 by seed (the jitter is mean-centred, the last room takes the remainder, so every room is within ±60 of the base); `game.rooms` is `[{ x, w, mirror }]`. Rooms 2 and 4 (indices 1 and 3) are mirrored as a whole by seed: platforms, the optional chest, and enemy spawn positions in them. `room` {stage, index} is emitted when the hero enters a room (the first one on the first frame).

- **Low route**: the floor, continuous from spawn to gate in every room. Barricades and altars (<= 74 px) are within a single jump (apex ~107) and breakable; nothing solid ever blocks the floor.
- **High routes**: one-way platforms (land from above, jump up through; the hero has no drop input, walk off the edge). `game.platforms` entries are `{ x, y, w, h: 18, theme, kind, moving, move, x0, y0, t, dx, dy }`. Heights are 90 and 160 above the floor: a single jump reaches 90, and a 160 step always has a 90 step within 120 px sideways (or a double jump from the floor: rise <= 175). No platform's lowest point is below FLOOR-85, so the 80 px Cathedral pillar can never touch a hero on one.
- **Themes** (`platform.theme` / `kind`, for art): Gate (`gate`; `stone`, plus `bridge` segments in the Broken Bridge room), Archive (`archive`; `shelf`; the most high routes), Belfry (`belfry`; `gear`, plus two moving platforms: a horizontal one in room 2 and a vertical one in room 4), Cathedral (`cathedral`; `ledge`, the altar ledges). Boss stage ledges are `cathedral` / `ledge`.
- **Moving platforms** (Belfry only): sine motion with amplitude 60 and angular speed 1 rad/s (peak 60 px/s) on the x axis (centre `x0`) or y axis (centre `y0`, rise 150, so the lowest point is still 90 up). They carry the grounded hero and grounded enemies standing on them (`dx` / `dy` is the frame's movement).
- **Elites** (#3): on stages I to IV the optional chest's guard is that stage's single elite, standing within 40 px right of the chest on its platform so taking the chest means facing it (`elite: true`, never `required`, so it does not count toward the Moon Gate; none on the boss stage). Health x2.6 on stage I, x1.8 for shield-bearer elites, x2.2 otherwise; damage x1.3 on top of normal scaling, poise unchanged. One random `affix` (by seed; a shield-bearer elite never rolls `warded`, it rerolls between `swift` and `splitting`): `swift` (speed x1.5, warnings x0.8 but at least 0.3 s), `splitting` (on death two plain copies at 0.4x its max health appear on either side of its death point, clamped inside the platform, on the same surface, never inside obstacles or off the platform; copies are not elite and never split), `warded` (`ward`: absorbs 30 damage before HP, refreshed to 30 every 6 s, never stacking; DoT and reactions are absorbed too; poise damage and stagger still go through the ward, only HP is absorbed). `elite` {x, y, affix, bonus} (`bonus` true for Endless bonus elites, which grant no pick) is emitted once when the hero first comes within 600 px; `eliteKill` {x, y, affix} on death, followed by a 0.8 s frozen beat (no enemy, trap or DoT updates, so the kill burst and copies are visible) and then a 3-relic pick with `upgrade` `reason: 'elite'` (same weighting) that restores 20 HP and all MP and then resumes play in place (no stage load, no `stage` event). Splitting copies grant no pick. The elite's optional chest is sealed while it lives (see Chests). An elite left alive just goes with the stage.
- **Chests** (`game.chests`: `{ id, x, y, w: 34, h: 28, kind: 'relic' | 'heal', optional, opened, sealed }`): the optional chest starts `sealed` and contact does nothing until its elite (linked by chest id, `enemy.chest`) is dead or gone; it then unseals (`unseal` {x, y} emitted once; art draws a purple chain band while sealed) and behaves as below. Opened automatically when the hero stands grounded on the chest's surface within 46 px; `chest` {x, y, kind, optional} is emitted. A relic chest rolls a 3-relic pick exactly like a stage pick (same weighting, `upgrade` with `reason: 'chest'`), restores nothing, and play continues in place (not a stage load, no `stage` event). A heal chest restores max(25, 30% max HP) HP and fills MP (a `heal` event with that amount). Per stage I to IV: one relic chest on the floor in a random room 2 to 4, and one optional chest (relic or heal by seed) at the top static platform of a random room 2 to 4, guarded by a non-required enemy standing on that platform: a skeleton on stage I, a knight or shield bearer afterwards. None on the boss stage. The floor chest keeps at least 60 px horizontal clearance from every platform span (nudged toward the room centre if needed). Floor hazards keep 50 px clear of the floor chest.
- **Enemy navigation**: ground enemies (not bats, not the boss) have gravity and stand on platforms. A hero within 560 px sideways who is grounded at least 50 px above makes the enemy jump (vertical speed -575, 1.6 s cooldown) onto a platform 40-95 px above it and within 50 px sideways (a small sideways impulse toward it), only while not stunned, frozen or winding up. A hero at least 60 px below makes an enemy standing on a platform drop through it (platforms ignored for 0.4 s). An enemy directly under a 160 step with the hero on it simply waits (it can still reach it step by step from a 90 platform). A vault over a barricade only happens when the obstacle is in the facing direction, and does not move forward during a warning.

## Stage hazards

Hazards are placed after enemies on the floor of stages I to IV (never the boss stage), at least 250 from the hero spawn (x 150) and the Moon Gate, never overlapping (30 px minimum gap), preferably between enemy spawns and never within 50 px of the floor chest. They are not enemies: the Moon Gate ignores them, and they are excluded from wind-up limiting, auto-face, Chain Lightning targeting (Vortex pulls stop at their near face). All reset on stage load. They drop no HP or MP.

- **Traps** (`game.traps`): Forsaken Gate spikes (h 34), Timeless Belfry gears (h 44), Crimson Cathedral blood pillars (h 80, so a hero on a FLOOR-85 platform above is safe); none on the Archive. 2 to 3 per themed stage, width 60 to 90, period 3.4 to 4.5 s, active 1.1 to 2.15 s (blood pillars 1.8 to 2.15 s), seeded random start phase. Cycle: active for the first `active` seconds, idle, then a 0.7 s warning (`warn`, `progress` 0 to 1) before activating again. Contact while active hurts for 10 × 1.13^stage (armor applies; normal 0.8 s hurt invulnerability). Dash invulnerability ignores it and it is never a perfect dodge. They hurt only the hero. Hit area is exactly `x ± w/2`, `y - h` to `y`.
- **Barricades** (stages I to IV, 1 to 2 each): 40 × 62, health 38 + 12 × stage. Solid on the sides and stand-on-able; the single jump (apex ~107) clears them. Ground enemies that are blocked hop over (vault); bats ignore them; boss charges stop at them. Sword hits, player shots, plunge shockwaves and Eclipse damage them (no crits, statuses, poise, drops or MP gain).
- **Altars** (Crimson Cathedral only, 1 to 2): 46 × 74, health 64, solid and breakable like barricades; never placed under a platform. Each blood pillar is linked to one altar (each altar has 1 to 2 pillars); every pillar stands within 600 px (horizontal) of its linked altar; breaking an altar permanently disables its pillars for that stage.

## Relics

| id | Name | Effect |
| --- | --- | --- |
| edge | Bloodthirst Edge | Basic attack damage ×1.25 |
| haste | Gale Feather | Attack cooldown ×0.82 (`attackSpeed` floor 0.3; an attack cooldown is never shorter than the 0.24 s swing animation), movement speed ×1.08 |
| crit | Hunter's Gaze | Critical chance +18% (cap 80%) |
| vital | Undying Heart | Max HP +30 and restore 40 |
| leech | Crimson Pact | Restore 5 HP per kill |
| arcane | Eclipse Codex | Magic damage ×1.45, MP cost -5 (floor 15) |
| reach | Phantom Glaive | Attack reach +28, knockback +70 |
| mana | Starnight Crystal | Max MP +30, MP regeneration ×1.5 |
| dash | Raven Shadow | Dash cooldown ×0.7, dash invulnerability +0.1 s (`dashShield` capped at 0.3 on top of the base 0.23 s; dash i-frames also never exceed 80% of the dash cooldown, so chained dashes leave a gap), thrust damage +35% (multiplier capped at ×2.4), +8 MP on a perfect dodge (capped at 30) |
| armor | Darksilver Charm | Damage taken ×0.8 (`armor` floor 0.25) and restore 20 HP |
| fire | Ember Edge | Hits burn 4 s, 0.32 × base per tick per stack |
| frost | Moonfrost Sigil | Hits chill and build frost meter (+1 per stack); at 3 the enemy freezes; bonus hit 0.08 × base per stack |
| shock | Thunder Conduit | Hits shock 4 s; chain range +14 and +1 target per stack |
| wave | Returning Crescent | Attack form. Combo hit 3 launches a crescent (speed 540, flies 0.52 s) that then returns to the hero (speed 620) and disappears on reaching them; each pass hits an enemy once, but a throw lands at most one frost hit (meter, chill, frost damage) per enemy; the returning pass adds frost only if the outgoing pass did not hit that enemy (other statuses apply on both). Damage 0.85 × base, +0.45 × base per extra stack |
| pierce | Starpierce Lance | Attack form. Combo hit 3 and the dash thrust fire a piercing beam (speed 780, reach capped at 560 px, life = reach / speed), 0.55 × base per stack; thrust reach +20 per stack (cap +60) |
| plunge | Fallen Star Vow | Attack form. A plunge landing that makes a shockwave (fall ≥ 40 px) also sends two ground waves left and right (speed 420, reach capped at 340 px, 0.45 × base per stack); shockwave damage +50% per stack, radius +24 per stack (cap 190 for this relic; Phantom Glaive alone still caps at 150) |
| vortex | Vortex Eclipse | Attack form. Eclipse first pulls enemies in its radius 78% of the way to the hero (boss 10%; x only, clamped to the stage, y unchanged; a grounded enemy stops at the near face of a barricade or altar rather than crossing it), then hits. Eclipse radius +35 and damage +35% per stack (radius cap 320) |
| bleed | Blood Sigil | Hits add bleed stacks (+1 per relic stack, max 10 × Blood Sigils owned on an enemy) for 5 s; 0.08 × base per bleed stack per tick |

Player projectiles (`game.shots`, separate from enemy `projectiles`): they pass through enemies, hit each enemy once per pass, are not cleared by Eclipse, deal 8 poise damage, are not heavy (no Shatter or Blood Flame) and never trigger Chain Lightning, but apply elemental statuses like a sword hit. A shield bearer blocks them (×0.15, no shove) when the projectile is on the side it faces; a returning crescent can hit its back. Cleared by loadStage. Events: `shot` {kind: 'wave' | 'beam' | 'ground', x, y, dir, speed, life}; hits use `hit`.

## Cursed relics

**Cursed relics** (#1; `cursed: true`, type "Cursed", deep red card frame with a cost line; never in the opening pick; at most one per offer of three; no synergies). Each has a `max` copy count, after which it is no longer offered:

| id | Name | max | Effect | Cost |
| --- | --- | --- | --- | --- |
| bloodOath | Blood Oath Blade | 2 | Sword hit damage ×1.6 per copy (`swordMul`: combo, thrust, plunge fall and shockwave; not wave, beam, ground-wave or Eclipse damage) | Damage taken ×1.25 per copy (`takenMul`), applied after `armor` |
| lunaticMoon | Lunatic Moon | 1 | Eclipse costs no MP and the `noMana` event never fires | Eclipse cooldown 6 s (instead of 0.65 s); `mpRegen` becomes 0 (hit, kill and perfect-dodge MP, chests and stage restores still apply) |
| nightwalk | Endless Nightwalk | 2 | Movement speed ×1.2, dash cooldown ×0.6 (floor 0.35 s) | Max HP -25 (floor 40, unreachable with the 2-copy cap); current HP drops to the new max if above |

## Elemental statuses and reactions

"Hits" are sword hits (combo, thrust, plunge fall and shockwave) and Eclipse. "Base" is the hero's `damage`. "Stacks" are copies of the relic owned; every per-stack value uses the stack count directly. Blocked shield-bearer hits apply nothing. Damage over time ticks every 0.5 s. Damage-over-time, bonus-hit and reaction damage cause no hit-stop, stun, flinch or poise damage, apply no statuses, emit `statusTick` {source, x, y, amount} and give kill credit (souls, `leech`, MP, drops) like any kill, but only while the run is `playing` (no kills, souls or leech after the hero dies; enemies still die). The damage-number overlay shows at most 12 `statusTick` numbers at once. Statuses live on the enemy (`burn`, `bleed`, `bleedStacks`, `chill`, `frozen`, `frostMeter`, `shock`) and reset on stage load. Reactions read the enemy's state before the hit, then the hit applies its own statuses. Heavy = combo hit 3, thrust, plunge, Eclipse.

| Status | Effect |
| --- | --- |
| Burn (fire) | 4 s, refreshed (never stacked) by each hit; 0.32 × base × fire stacks per tick |
| Chill (frost) | 2.5 s, enemy speed ×0.68 (boss ×0.85) |
| Frozen (frost) | Frost meter +stacks per hit (+1 more from Eclipse); at 3 the meter resets and the enemy freezes for min(1.5, 0.75 + 0.12 × stacks) s. Frozen enemies cannot move or act and their warnings are cancelled (not paused). Boss: frozen 0.28 s, then immune to freezing until 1.8 s later; the meter still resets. After any thaw (timeout or Shatter) a normal enemy is immune to freezing for max(1.2, 2 - 0.2 × (frost stacks - 1)) s and gains no frost meter meanwhile (the boss keeps its 1.8 s). The frost meter decays to 0 after 3 s without a frost hit |
| Shock (shock) | 4 s, refreshed by each hit |
| Bleed (bleed) | 5 s, refreshed; stacks reset when it expires |

| Reaction | Condition | Effect | Event |
| --- | --- | --- | --- |
| Shatter | frost owned, heavy hit on a frozen enemy | Unfreezes; base × (1 + 0.35 × frost) to every enemy within 130 + 10 × frost, target included | `reaction` {name:'shatter', x, y, radius} |
| Blood Flame | fire owned, heavy hit on a bleeding enemy; at most once per attack (a plunge's fall and shockwave count as one) or Eclipse cast, on the first bleeding enemy processed, other targets keep their bleed | Consumes all its bleed stacks; (0.7 + 0.3 × stacks) × base × (1 + 0.3 × fire) to the target and 0.5× that to every other enemy within 115 | `reaction` {name:'bloodFlame', x, y, radius} |
| Chain Lightning | shock owned, any sword hit (not Eclipse; Eclipse still applies shock) on an already shocked enemy; at most one chain per attack or sword swing (a plunge's fall and shockwave count as one) | Arcs to the (2 + shock) nearest other living enemies within 180 + 14 × shock; (0.35 × base + 0.12 × that hit's damage) × shock each; shocks them (no further chaining). With no other enemy in range the shocked target itself takes 50% of that damage and this counts as the attack's chain | `reaction` {name:'chain', x, y, targets:[{x,y}], solo?:true} (solo zap: targets is empty, solo true) |

Attack-form projectiles do not exist yet; `damageEnemy` ends with the single `elements()` hook they should call.

## Endless Trial

Approved in #22; explicitly **not balanced**: it exists for combination testing and long-tail replay. Title-screen option, unlocked after the first completed normal run (`records.wins >= 1`). The normal five-stage run is unchanged except for the stacking floors listed under Relics.

- `Game(onEvent, seed, 'endless')` has `mode` (`'normal'` | `'endless'`) and a 1-based `floor`. `stage` stays the 0-4 theme index, `(floor - 1) % 5`, so rooms, art and text are reused. Every 5th floor is the Fallen King's arena; clearing it opens the usual relic pick and continues to the next floor (no `won` state, no `win` event). The opening build pick happens as in a normal run.
- Scaling: floor multipliers are `1.22^(floor-1)` for enemy health and `1.13^(floor-1)` for damage (x1.0 on floor 1), capped at 1e9 so they stay finite. They multiply the existing per-stage value: health = (base + 12 x stage) x floor multiplier, damage = (8 + 2.5 x stage) x floor multiplier (boss: 900 and 22). The elite multipliers apply on top. Traps and obstacles do not scale.
- From floor 6, each regular (non-required, non-boss) enemy has a 20% chance (`this.rand()`) of being elite: elite health, damage and a random affix like the chest guard. These bonus elites (`bonus: true`) emit `eliteKill` but grant **no reward pick**; only the chest guard's elite does. Every landed hit deals at least 1 damage after armor and `takenMul`, so stacked armor never makes the hero invulnerable.
- After each floor: the three-choice relic pick (+20 HP, full MP). Relics stack with no run-length cap; existing caps (crit 0.8, magic cost 15, cursed `max`, plunge radius and so on) stay. After every pick, any player stat that is NaN or beyond 1e12 is clamped, so deep stacks never produce `Infinity` or `NaN`.
- Death ends the trial and leaves `best`, `wins` and `runs` alone. `bestFloor` is saved with the other records.
- HUD shows "Floor N"; the result screen shows the floor reached and the best floor.

## Playtest verdicts

After each proposal is playtested, add one line here: `#<issue> <name> — keep / adjust / drop: <one-line reason>`.

#2 Shield bearer — keep (automated playtest; pending the user's hands-on feel check): head-on costs 22–64 HP while all three answers work at 0 damage (jump behind 2.5–3.3 s, dash through the wind-up 0.7–1.5 s, Eclipse 0.4–0.7 s for 35 MP), so it forces the intended choice; open: P3 turn delay during stun, `!` contrast and turn-cue taste notes, real-device check, generated sprite.

#19 Wind-up limit — keep (automated playtest; pending the user's hands-on feel check): at most 2 (stages 1–3) / 3 simultaneous warnings keeps crowds attack-dense (16 attacks per 6 s) but readable.

#16 Spearman — keep (automated playtest; pending the user's hands-on feel check): jump, dash-through and bait-and-punish all take 0 damage, standing at mid-range gets hit, and the warning box matches the hit box.

#17 Blood priest — keep (automated playtest; pending the user's hands-on feel check): interrupting the bless works (2.5 s cooldown on cancel) and blessed hits go 13→16; also found and fixed a shared bug where far warnings froze.

#12 Poise and stagger — adjust (automated playtest; pending the user's hands-on feel check): post-stagger armor (1.2 s, boss 0.6 s) was needed to stop tap-rhythm stun-lock, and knights break on combo cycle 2; open: knight pressure on a stationary tapper.

#11 Dash thrust and perfect dodge — keep (automated playtest; pending the user's hands-on feel check): ~150 ms perfect window on skeleton and knight with no MP loop (≤4 MP/s); open: bat perfects stay tight even after reach 55.

#10 Air plunge — keep (automated playtest; pending the user's hands-on feel check): works as a crowd tool (each enemy hit once) with a committed fall and no i-frames; the shockwave needs a 40 px minimum fall.

#18 Fallen King three phases — adjust (automated playtest; pending the user's hands-on feel check): HP 640→900 after a skilled bot killed it in ~20 s, and every move has an answer; open: phase 3 is still short (~4–7 s for a perfect bot) and dash i-frames answer most warnings.

#13 Elemental relics — adjust (automated playtest; pending the user's hands-on feel check): fixed the freeze lock, Eclipse chain wipes and per-enemy Blood Flames; balance follow-up in #30.

#14 Attack-form relics — keep (automated playtest; pending the user's hands-on feel check): each form changes how you play, and beam and ground-wave reach is capped to the visible screen; tuning in #30.

#15 Opening pick and synergy offers — keep (automated playtest, still in review; pending the user's hands-on feel check): one owned partner raises its offer share from ~17% to ~27% without forcing any relic, and the opening pick appears exactly once per run.

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

Ground enemy climbing: while the hero stands grounded clearly above, an enemy on a platform with a one-jump step up in reach holds at its platform edge (does not walk off) while its jump cooldown runs, then jumps. With no reachable step it walks or drops as before.
