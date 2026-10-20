# NOCTURNE Game Design Document (GDD)

Maintained by the Game Designer. This document records the rules and numbers **as they are now**; anything only planned lives in Issues. `core.js` is the source of truth for numbers: when the two disagree, fix this document. Display names come from `i18n.js` (English shown here).

## Core fun and design pillars

### Approved direction (#43)

Approved by the user in #43. This is the direction new proposals must serve. Its vertical slice (#44, approved) is being built in steps: step 1, the blood loop, is the Castle Descent mode below; the Gate Warden, blood pools and the second rest point (#50 PR 4) are built; the weapon frenzy effects and debt (step 2, #61) are built; save and castle records (step 3) are still planned. The normal run and Endless Trial described in the rest of this document are unchanged.

- **Core fun**: blood is your only resource: the fuller you are, the stronger you get, and the closer you are to losing control.
- **Pillars**
  1. **Blood is the only resource**: blood is gained by attacking, spent on weapon skills, and is also your life; there is no free healing, so offense keeps you alive.
  2. **Fullness is power and risk**: the meter above 50% is both extra life and a countdown, and a full meter forces a Blood Frenzy that is strongest exactly when you are closest to losing control.
  3. **The weapon defines the frenzy**: each weapon has its own frenzy with a built-in downside, and weapons change only at rest points, so choosing a weapon chooses which loss of control you carry.

The input-level qualities of the prototype stay requirements under every pillar: every enemy attack has a visible warning (`tell`), and every hit gets hit-stop, a flash, knockback, sound and a number.

### Previous draft (current five-stage prototype)

- **Core fun**: read the gaps between enemy warnings, chain combos, dashes and Eclipse into a clean run, then pick a relic that changes how the next stage plays.
- **Pillars**
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

Enemy and boss design follows the style guide in [`enemy-design.md`](enemy-design.md).

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

## Castle Descent (slice step 1)

Third title-screen mode, `Game(onEvent, seed, 'castle')` (#44, step 1 in #45; the Gate Warden from #50 PR 4). Constants are exported from `core.js`. Not balanced: every number is a playtest starting point.

- **The Vigil** (state `rest`, `rest` {weapons} event): the run starts here. It resets the player to base stats, blood to 100, no relics, no frenzy. Pick a weapon with `setWeapon(id)`, then `descend()` loads floor 1. No opening build pick.
- **Weapons** (`WEAPONS`; frenzy effects in the next section): they replace `damage`, `attackSpeed` (attack cooldown multiplier) and `reach`.

| id | Damage | Cooldown | Reach |
| --- | --- | --- | --- |
| `heavy` | 30 | ×1.25 | 112 |
| `twin` | 17 | ×0.75 | 88 |
| `spear` | 22 | ×1.0 | 128 |

- **Blood** (`player.blood`, 0 to `BLOOD_MAX` 200, life half `BLOOD_HALF` 100) replaces HP and MP. Gains (only while `playing`): sword hit (combo 1-2, thrust, plunge fall or shockwave) +3 per enemy, combo hit 3 +5, blocked shield-bearer hit +1, player projectile hit +1, kill +8, perfect dodge +5. Barricades, altars, Eclipse hits and kills, and damage-over-time, bonus-hit and reaction damage (including kills they cause) give 0. Damage taken comes off blood (armor, `takenMul`, the 0.8 s invulnerability as usual); at 0 the hero dies. No free healing: no heal drops, no chests, picks restore nothing.
- **Weapon skill**: Eclipse with its normal effect, costs `SKILL_COST` 18 blood and needs at least `SKILL_MIN` 40 (below that it emits `noMana`, shown as a blood toast). Allowed during frenzy.
- **Blood Frenzy**: starts when blood reaches 200 (`frenzy` {weapon, x, y}). Blood burns `FRENZY_BURN` 12/s (about 8.3 s with no gains); gains are halved (rounded down, minimum 1). It ends when blood is at 100 or less, from burn, damage or the skill (`frenzyEnd` {weapon, debt}, debt 0 except the Greatsword's paid debt); the burn never takes blood below 100. Burn stops during pause, picks and hit-stop. Frenzy carries across floors; death and the Vigil end it.
- **Weapon frenzies** (#61, castle only; `frenzyOf(weapon)`): each weapon's frenzy is strong and risky. The Vigil cards show `weapon.<id>.frenzy`; the HUD shows live debt (`hud.debt`) in the blood bar's text.
  - **Greatsword, Numb to pain**: no knockback while frenzied (the 0.8 s post-hit invulnerability stays). Damage taken (after armor and `takenMul`) goes to `player.debt` instead of blood; `hurt` carries `debt` (the running total). When the frenzy ends by burn, skill or dash cost, the whole debt is subtracted at once (`debt` {amount, x, y}, after `frenzyEnd` {weapon, debt}); blood at 0 or less dies (`death` cause `debt`), so a debt of 100 or more always kills when the burn ends the frenzy. Eclipse also ends the frenzy and pays the debt from the blood left, so `debtLethal()` (debt >= min(blood - `SKILL_COST`, 100) while blood >= `SKILL_MIN`, else min(blood, 100)) drives every lethal cue (band, text, overhead number, tone, `hint.debt`) and can only warn early. After a Warden or King kill the burn is frozen and no debt is paid during the 1.6 s window; the Vigil or slice-end then clears it unpaid (winning forgives the debt). Dash and Eclipse invulnerability still stop the hit, so no debt. The Gate/King Toll becomes debt (`toll` carries `debt: true`, no 120 px throw) but the boss gauge still gains the amount. Death, either Vigil and `enterRest` clear debt unpaid; a floor change keeps it.
  - **Twin Blades, Unstoppable combo**: on the ground a combo swing starts by itself whenever the cooldown allows (no input; none in the air, where attack still plunges). Swing length and cooldown are both x`TWIN_FRENZY_CD` 0.6 (on top of the weapon's x0.75; the 0.24 s swing floor would otherwise swallow the cooldown). Full move speed while swinging; the facing holds during a swing (walk backwards while attacking) and at each swing start turns to the nearest living enemy within `TWIN_SEEK` 260 px, else it stays. Dash is ignored and not buffered for the whole frenzy (so no thrust); jump, double jump and plunge work. The `dash` event is simply not emitted.
  - **Spear, Assault dash**: dash cooldown 0 (one dash at a time: a press during a dash is buffered 0.16 s and fires when it ends). Each dash resets `assaulted`; every enemy the hero overlaps (+8 px) takes one hit per dash: 1.0 x damage (crit allowed), heavy hit (knockback x1.6, 0.42 s stun), 35 poise, +3 blood (halved, +1 blocked), +2 MP; it goes through `damageEnemy` so statuses and the Warden/King gauge rules apply (a frenzy hit: break in phase 1, chip 34 later). A shield bearer's front blocks it (15% damage, +1 blood, shove) and ends the dash; the back lands. No i-frames, no perfect dodge, projectiles and attacks hit the dashing hero. Each dash burns `ASSAULT_BURN` 6 extra blood at once (never below 100; it can end the frenzy but not kill). The thrust follow-up works. `dash` carries `assault`; each hit emits `assaultHit` {x, y, dir, blocked}. Barricades and altars are not hit.
  - Shared #50 interactions: hyper armor, posture, tokens and provoked enemies see an assault as a sword hit; the swing cost stays free in frenzy.
  - **Bot** (#61): heavy frenzy trades through light hits while debt plus the hit stays under 30 (`HEAVY_DEBT_CAP`) and still dodges heavies, with dash dodges on the King's charge; twin frenzy never presses attack or dash and does not apply the swing slow; spear frenzy chains assault dashes at a known target 35-125 px away (not a shield front) and never counts a dash as a dodge (jump, walk or Eclipse instead). Clear % over 100 one-life runs (`--run`), 40 seeds for the Warden (floor 10) and the King (floor 50), before -> after:

    | cell | heavy exp | twin exp | spear exp | heavy avg | twin avg | spear avg |
    | --- | --- | --- | --- | --- | --- | --- |
    | runs 1-10 | 85 -> 77 | 87 -> 87 | 73 -> 79 | 50 -> 36 | 42 -> 33 | 56 -> 52 |
    | Warden | 100 -> 100 | 100 -> 100 | 100 -> 98 | 45 -> 50 | 40 -> 48 | 53 -> 30 |
    | King | 100 -> 75 | 100 -> 100 | 100 -> 100 | 18 -> 3 | 3 -> 38 | 15 -> 3 |
    | King clear s | 84 -> 70 | 108 -> 40 | 68 -> 124 | - | - | - |

    Heavy pays with debt deaths (about 10 of 100 runs, 9 of 40 King fights for the expert); spear's average and Warden numbers fall because the dash no longer dodges charges; the twin frenzy is the strongest by far (King clear 108 s -> 40 s), a tuning candidate for a separate Issue.
- **Swing cost** (`SWING_COST` 2, #47 PR A): every sword swing (combo hits 1-3, dash thrust, air plunge at its press) pays 2 blood as it starts; a buffered press pays only when it fires. Clamped so blood never drops below 1 (cost paid = `min(2, blood - 1)`); free during Blood Frenzy and outside castle mode. The `swing` event carries `cost` (amount actually paid). Net per swing on one target: hit +1, combo hit 3 +3, blocked shield hit -1, whiff -2.
- **Light attack damage** (`CASTLE_LIGHT`, #47 PR A): castle enemies deal skeleton 10, bat 8, shield bearer 12, spearman 12, knight 14, plus 2 per scaling tier (replaces 8 + 2.5 per tier). Heavy attacks follow.
- **Heavy attacks** (`HEAVY_DAMAGE` 100, #47 PR B, castle only): every regular enemy has one heavy besides its light attack: skeleton `cleave`, bat `dive`, shield bearer `rush`, spearman `lunge`, knight `greatswing`. Damage is a flat 100 on every floor (elites x1.3 = 130; `armor` and `takenMul` apply), so 100 blood or less dies to one and 101 survives. Tell 0.85 / 0.9 / 0.9 / 0.9 / 1.0 s (+0.4 s when delayed; Swift floor 0.7 s), set as `e.tell` plus `e.heavy` and a fixed hit area `e.warn` (box or line). Hyper armor and the posture rules below apply from the wind-up on; Eclipse (and freeze) cancels. After the strike the enemy recovers 0.9-1.1 s (skeleton 1.0; `recover`, `punishable`): poise damage x2 and +2 blood on a sword hit. Per-enemy heavy cooldown 3 s; heavies share the attack tokens below (the old 2 wind-up limit, the one-live-heavy cap within 620 px and the 0.3 s heavy gap are gone in castle mode). A ready enemy in heavy range rolls `game.rand()` once per second against its base chance (skeleton 10%, bat 15%, shield 15%, spearman 20%, knight 25%) or the highest chance of a visible hero state: `whiff` (`p.whiff` 0.4 s from a swing start, cleared by its first hit; skeleton 80%), `dashSpent`, `airborne`, `frenzy`, `cast`, `approach` (see `HEAVY` in `core.js`). Events: `enemyHeavy` {x, y, kind, area, delayed}; `enemySwing` and `hurt` carry `heavy`; `death` carries `heavy` (death screen shows `castle.deadHeavy`).
- **Combat systems** (#50 PR 1, castle mode only, `core.js`; the normal run and Endless Trial are untouched; every number is a playtest starting point):
  - **Hyper armor**: every minion attack (light, heavy, projectile, the skeleton's backstep and lunge) cannot be flinched, knocked back or cancelled by sword hits or shots from the first tell frame to the end of contact. Only a posture break, Eclipse and freeze interrupt it; killing the enemy ends it. A priest's `bless` is not an attack: any hit still cancels it.
  - **Posture** (`poise` / `maxPoise`, castle max: skeleton 60, bat 30, shield bearer 70, spearman 55, knight 140, priest 45, mage 40): unchanged damage per hit (combo 17 / 17 / 62, thrust 35, plunge 45, Eclipse 55, shot 8; blocked x0.25), x0.5 during a tell or strike, x2 during recovery (`punishable`). After 1.5 s without posture damage it refills 25% of max per second (not during a stun). A break cancels the attack, frees the token, stuns `STAGGER_STUN` 1.5 s and arms a riposte: the first sword hit (combo, thrust, plunge) in that stun deals x1.5 damage and +5 blood (halved in frenzy like all gains) and emits `riposte` {x, y}. The 1.2 s post-stun armor is unchanged. `stagger` carries `enemy` (type) and `cancelled` (an attack was interrupted).
  - **Flinch budget** (`steady`): a hit on an enemy that is not attacking flinches it (stun 0.24 s, heavy hit 0.42 s) only while `steady` is 0; each flinch sets `steady` = stun + 0.5 s. Hits during `steady` and hits during a recovery deal damage and posture damage but no stun or knockback. Eclipse still flinches.
  - **Light recovery**: a skeleton `slash` ends in a 0.45 s recovery and a shield bearer `bash` in 0.6 s, both standing still and `punishable` (posture x2, +2 blood on a sword hit). Other types keep their old light attacks until their kits land.
  - **Attack tokens** (`ATTACK_TOKENS` 2; `game.tokens` lists holders): a minion must hold a token to start a tell. It holds it through contact and recovery and releases it when the recovery ends or the attack is cancelled, staggered, frozen or killed; a released token is free again after `TOKEN_GAP` 0.3 s. At most one holder is a heavy. When several enemies are ready in range, the ranking is: starved (denied for `STARVED` 2 s), in front of the hero, longest waiting; mages and priests yield to a ready melee enemy within 110 px. A priest's `bless` takes no token (one at a time). Floor load clears tokens. `enemyTell` {x, y, enemy, kind, dir} fires when a non-heavy tell starts.
  - **Provoked** (`provoked()`, skeleton and shield bearer): posture damage on the enemy arms one answer (`provoke` = 1.5 s, set with `poiseHit`, any hit that deals posture damage, including hits during its own tell, strike or recovery). While armed and not in a recovery, the enemy ignores its light-attack cooldown and may start its light tell (`slash` / `bash`) with the hero up to `PROVOKED_REACH` 150 px away (normally 80 / 70). The hit box does not grow (slash 82, bash 70), so a hero who pokes from range sees a full tell that whiffs, then a punishable recovery. **One answer per poke**: taking an attack token (any tell or the stepcut backstep, light or heavy) clears `provoke`, so after the answer the enemy goes back to its normal cooldown, trigger range and hold ring until it takes posture damage again; a whiff teaches spacing instead of starting a loop. The recovery itself is never shortened: a hit during it arms the next answer, which starts as soon as the recovery ends (a full 0.5 / 0.55 s tell, above the 0.45 s follow-up minimum); this is intended, including after a punish of a heavy recovery. **Provoked does not suppress heavies**: the normal heavy roll (cooldown, range, chance) still runs first, so the answer to a poke may be a fully telegraphed cleave (0.85 s tell, glint 0.4 s before contact, 100 damage, box 10-125 px). A provoked enemy never hits without its tell: every answer is a light tell (box unchanged) or a heavy with tell and glint. This stops a spawn or attack cooldown from parking an enemy inside the hero's reach, where a held attack killed it without a tell.
  - **Spacing and facing**: a skeleton or shield bearer without a free token (or on cooldown and not provoked) waits 100-140 px away: it backs off at x0.6 speed when the hero comes closer and steps in when the hero backs off. Facing locks at tell start. Outside attacks a minion turns to a hero behind it after its re-face delay: bat and skeleton 0.15 s, spearman, priest and mage 0.2 s, shield bearer 0.25 s (plus its post-bash 0.6 s), knight 0.35 s.
  - **On-screen rule**: no tell starts when the attacker is more than 320 px left or 560 px right of the hero (`SCREEN_LEFT`, `SCREEN_RIGHT`).
  - **Glint and delayed heavies**: every heavy sets `e.glint` (0.1 s flash timer) and emits `enemyGlint` {x, y, kind, enemy, delayed} exactly 0.4 s before contact. A delayed heavy has tell + 0.4 s (`e.delayed`, `enemyHeavy.delayed`), rolled with `game.rand()` at tell start: never on floors 1-4, 30% on floors 5-7, 50% on 8-9, and only for a heavy first met on an earlier floor (cleave 1, rush 2, dive 4, lunge 5, greatswing 7). Elites and bosses join with their kits.
  - **Skeleton kit** (castle HP 55, was 43; asks for a token within 80 px, was 60; slash cooldown 1.0 s, was 1.7): `slash` tell 0.5 s, box 10-82; `cleave` (heavy) may start with the hero up to 260 px away (was 100; the box stays 10-125), so a hero who swings at air while closing in (`whiff`, 80%) walks into it, recovery 1.0 s; `stepcut` when the hero walks in within 100 px (was 110; 50% roll, `game.rand()`): a 0.25 s backstep of 70 px, a 0.5 s tell with the lunge path and box fixed at tell start, a 0.15 s lunge of 80 px, hit box 10-100 x 70 at the end, 0.6 s recovery.
  - **Shield bearer kit** (castle HP 60, was 55, so one Eclipse (55) no longer kills it): `bash` tell 0.55 s; `rush` (heavy); `counter` after 2 blocked sword hits within 1.0 s (armed for 1.0 s): if a token is free and the hero is in front within 100 px, a 0.45 s tell, box 10-60 x 58, light damage and a 120 px push, 0.5 s recovery.
- **Weapon matchups** (#50 PR 1 tuning). A weapon may counter an enemy, but no weapon counters every enemy of a theme, and a countered matchup is hard but beatable by a reader. Measured with the test bot on floor 1 filled with 5 of one enemy (20 seeds; clear rate, blood gained / lost):

  | Enemy | Greatsword | Twin Blades | Spear |
  | --- | --- | --- | --- |
  | Skeleton | favored (100%, +57 / -15) | countered (90%, +70 / -49) | neutral (95%, +64 / -32) |
  | Shield bearer | countered (65%, +40 / -41) | favored (85%, +47 / -23) | countered (60%, +40 / -49) |

  A hold-attack masher dies in 16-19 of 20 runs against 5 skeletons and in 20 of 20 against 5 shield bearers with every weapon. Normal floors 1-3 (reader bot, clear %): Spear 100 / 95 / 100, Greatsword and Twin Blades 100 / 100 / 100.

  Why, by behavior. Skeleton: the Greatsword (30) kills it in 2 hits, so one punish of the 0.45 s slash or 1.0 s cleave recovery plus one more hit ends it, and its 125 px reach stays outside the 82 px slash and the 80 px trigger; the Spear (141 px) also stays outside the slash but needs 3 hits, so it spends longer in the cleave box (139 px); the Twin Blades (101 px reach) must stand inside the trigger, where the 1.0 s slash cooldown keeps the tells coming and 4 hits are needed. Provoked tells reward spacing: from 83-150 px a poke draws a slash that whiffs into a punishable recovery, which the Greatsword and Spear can reach and the Twin Blades cannot. Shield bearer: the guard only opens for short windows (0.25 s re-face, 0.6 s post-bash turn, 1.0 s rush recovery, a broken guard after Eclipse) and at 60 HP Eclipse no longer kills, so the fastest weapon wins: the Twin Blades (0.75 s swings) fit the most hits into each window, while the Spear (1.0 s) and Greatsword (1.25 s) land about one, so the fight runs longer and more rushes come. Floors 1-2: no weapon is favored against both enemies (Greatsword skeleton, Twin Blades shield bearer, Spear neither). Mashing (hold attack, no reads) on floor 1 must die in most runs: the Spear survives 15-20% (other weapons 0-18%), accepted because the Spear pays for its reach with the most swings per kill; budget: Spear mash survival on floor 1 at most 20% and on floor 2 at most 10%, re-measured after the one-answer rule with `node tools/bot-run.mjs --seeds 20 --floors 1-2`, and a `type:tuning` Issue if it is exceeded. Floor 3 adds the spearman in PR 2; its kit should favor the Spear or Greatsword.
- **Floors** (`castlePlan()`, `loadFloor(n)`): floors 1-9 reuse the Forsaken Gate rooms and art (stage 0) with no chests and 2 required guards (a rolled bat becomes a skeleton). Enemy scaling tier = min(4, floor((floor - 1) / 2)): floors 1-2: 0, 3-4: 1, 5-6: 2, 7-8: 3, 9: 4. HUD reads "Floor N / 10".

| Floor | Enemies |
| --- | --- |
| 1 | 5 skeletons |
| 2 | 2 shield bearers, 3 skeletons (shuffled) |
| 3 | 2 spearmen, 3 skeletons (shuffled) |
| 4-7 | 6, slot 1 a bat, others rolled from skeleton, shield bearer, spearman |
| 8-9 | 7, same pattern, knight added to the roll; plus one bonus elite knight (`bonus: true`, no pick) at the optional-chest spot |

- **Relic picks** after floors 3, 6 and 9 (`CASTLE_PICKS`), drawn from `SLICE_POOL`: every relic except `vital`, `leech`, `mana`, `arcane`, `lunaticMoon` and `nightwalk`. Their HP and MP side effects do nothing here. Relics are lost on death.
- **Death**: the `dead` screen's button returns to the Vigil (100 blood, no relics, weapon picked again, floor 1).
- **Floor 10, the Gate Warden** (#50 section 5, `loadFloor(10)`): floor 9's pick leads to floor 10, the Warden alone in the boss arena layout (width 2800, two ledges, Gate art, HUD "Floor 10 / 10"). `loadFloor(50)` is the Fallen King (castle only; returns false in the normal and endless modes). See "The Gate Warden" and "The Fallen King, castle version" below.
- **Second Vigil**: the Warden's kill (`kill` {boss, warden}, then `fightStats`, then 1.6 s later) opens a second `rest` (`vigil: 2`). Blood 100, frenzy ends, debt cleared, relics kept; the weapon may change (`setWeapon` rebuilds the player from base + weapon + owned relics). `descend()` then sets state `sliceEnd` and emits `sliceEnd` (the slice-end screen offers "Face the Fallen King", see below). Death on floor 10 returns to the first Vigil like any death. Castle runs write no records and no save yet.

### The Gate Warden (floor 10)

A `boss`-type enemy flagged `warden: true` (the King's body and art, none of its moves). 520 HP, speed 75, body 72 x 112 (blocks walking; a dash passes, a double jump clears it), super armor gauge `superArmor` / `superArmorMax` 100. It never flinches, takes poise damage or loses a tell to a hit; its engagement range is 900 px, and it only starts a tell with the hero within 320 px left / 560 px right of it (nothing attacks from off screen). Lights deal 16, heavies a flat `HEAVY_DAMAGE` 100.

| Move | Kind | Tell | Hit area | Recovery |
| --- | --- | --- | --- | --- |
| `sweep` | light | 0.6 | 146 in front, body height | 0.6 |
| `backhand` | light, follow-up | 0.5 | 10-120 behind | 0.6 |
| `slam` | heavy | 0.95 | 112 x 123 in front, plus a 100-damage floor wave (240 px/s, 3 s; jump it; phase 2 also sends one behind it); two blood pools | 1.2 (phase 2: 0.9) |
| `charge` | heavy | 0.9 | 305 px path, body height, 0.5 s travel (dash through or double jump; a single jump peaks at 107 px, under the 112 px body) | 1.0 (phase 2: 0.9) |
| `seize` | heavy, the Gate Toll | 1.1 | 10-95 in front, 80 tall: the Toll takes a hero inside the box, so a jump must be above 80 px at contact (a late, low jump is caught) | 1.3 (phase 2: 1.0) |

Every heavy glints `GLINT_LEAD` (0.4 s) before contact; a delayed heavy (phase 2: any opening heavy 50%, the seize included; or a habit read) adds 0.4 s of hold before the glint. Heavies keep `heavy` through their recovery. Phase 2 cuts every heavy recovery by `PHASE2_RECOVER_CUT` 0.3 s, never below 0.9 s (the guide's floor: one full Greatsword combo).

- **Strings** (`wardenFollow`, difficulty passes): when a `sweep`, `charge`, `slam` or `seize` ends, a follow-up starts instead of the recovery whenever the rules below name one (both phases; the old phase 1 coin flip is gone), picked from where the hero stands at that moment (visible state only, never input). It turns to face the hero as its tell starts (the backhand keeps its facing), then locks; it is never delayed (one delay per string), heavy follow-ups still glint 0.4 s before contact, and a pick draws at most `MAX_FOLLOWS` follow-ups (phase 1: 2, phase 2: 3), so a string ends with the recovery of its last move. A backhand ends the string. Tells (`FOLLOW_TELL`): charge 0.5, seize 0.75, backhand 0.5, slam 0.7. A `crossed` habit read always ends in the backhand. No follow-up if the hero is off screen.
  - After a `charge`: the hero behind it within 330 px (dashed or jumped through) draws the **return charge**, back along a new 305 px path, and a return may draw another (up to the cap). A dash through one charge leaves the dash on cooldown (0.85 s) when the next arrives, so the answers alternate: double jump one and dash the next, or stay out of the first path.
  - After a `sweep` (and a `seize` the hero dodged on the ground): hero behind within 140 -> `backhand`; behind farther -> `charge`; in front within 130 and grounded -> `seize` (after a sweep only); in front within 330 -> `charge`. Walking out of the sweep therefore meets the charge, and standing in close meets the Toll.
  - After a `slam`: the hero within 330 px on either side -> `charge`. The floor wave pins the hero to a jump; the charge meets the landing.
  - After a `seize` the hero jumped (airborne at contact) within 200 px -> `slam` (0.7 s): the gauntlet answered by a jump is answered by the slam on the landing. A landed Toll ends the string (its recovery is the hero's way back).

- **Gauge**: normal hits and projectiles change nothing; an Eclipse hit takes `ECLIPSE_CHIP` 25 (`armorChip` {x, y, value, left}). A damaging hit while the hero is in Blood Frenzy breaks it at once in phase 1; in phase 2 it chips `FRENZY_CHIP` 34 instead (also an `armorChip`), so three frenzy hits break it (user decision in the Warden difficulty pass: a frenzy should not delete phase 2). Break (`armorBreak` {x, y}): cancels the move and tell, slides it 140 px away from the hero, stuns 1.8 s with x1.5 damage, then `armorRestore` refills the gauge to 100 and locks it for 2.5 s (no chip, no break), so one frenzy gives about two breaks in phase 1. Damage over time does not count as a hit.
- **Blood from hitting it**: none while armored, except hits during a heavy's recovery; the break stun pays normally. Kill gives +8 as usual.
- **Gate Toll** (`seize` contact on a hero inside its box, without invulnerability): the hero loses all blood above 100, or 30 at 100 or less (never more than they have), the Warden's gauge gains the same amount (cap 100), frenzy ends when blood lands at 100, the hero is thrown 120 px back and gets 0.8 s of invulnerability. `toll` {x, y, amount}. A death by toll emits `death` {cause: 'toll'}. A dash's invulnerability avoids it (and is a perfect dodge). In the Greatsword frenzy the Toll becomes debt (see Weapon frenzies).
- **Blood pools**: a slam spawns two pools at Warden x +-200 (+-260 in phase 2, clamped), +14 blood each, 4 s life, at most 2 on the field (the newest). `bloodPool` {x, y, life} on spawn, `poolTaken` {x, y, amount} on pickup (touch while grounded on the floor; frenzy does not halve it). `game.pools` holds {x, y, life, max}.
- **Habit memory**: for each heavy, the hero's answer at contact is stored (`jumped` airborne, `crossed` behind it, `stood` in the area, `retreated` out of range; for a charge, at the moment it passes the hero). When two of the last three match the next pick follows the read and the memory clears: `crossed` -> sweep (close) or charge, ending with a `backhand`; `jumped` -> slam (close) or a delayed charge; `retreated` -> charge.
- **Move pool**: close (< 150 px): sweep, slam, seize (phase 2 adds charge); mid (150-330): charge and slam (its floor wave covers the middle), plus seize if the hero walks toward it; far: charge; never the same move twice in a row. Mid-range camping no longer sees only charges, and a dash through a charge is answered by the return charge. Hero in frenzy or above 150 blood within 160 px: seize (in phase 2 a frenzied hero is seized even right after a seize, the one exception to the no-repeat rule: the Toll ends the frenzy and pays the gauge).
- **Phase 2** at 50% HP: `wardenPhase` {phase: 2, x, y}, a 1.1 s pause (the roar: it ends a break stun, refills the gauge to 100 and locks it through the pause, so a frenzy cannot chip a standing target); every opening heavy (slam, charge, seize) is delayed half the time; strings may run to 3 follow-ups; frenzy hits chip instead of breaking; the slam sends a second floor wave behind it (`warn.wave2`), so standing behind it is no longer safe; charge joins the close pool; heavy recoveries are 0.3 s shorter (floor 0.9 s); pools at +-260.
- **Fight stats**: `game.fightStats` {gained, taken, time, breaks, frenzies} resets when floor 10 loads (time counts from when the Warden wakes) and goes out once as `fightStats` {won, ...} on the kill or the hero's death.
- **Bot** (`node tools/bot-run.mjs --seeds 40 --floors 10 --weapon <w> --skill expert|average`; floors starting at 10 begin straight on floor 10 with no relics and 100 blood): it dashes or double jumps charges, jumps seizes and the slam waves, walks out of boxes, takes pools, hits recoveries and the break stun, and closes in to hit in a frenzy. It reads exact hit boxes, so this is a ceiling, not a human estimate. Floor 10 after the reaction-clock fix (a follow-up tell restarts the bot's reaction clock; before it, 172 of 271 follow-ups were answered within one frame), 40 seeds per cell (clear %, deaths by cause, fight blood gained / taken, frenzies per fight); earlier passes were measured with a bot that skipped the reaction time on follow-ups and are superseded:

  | Bot | Greatsword | Twin Blades | Spear |
  | --- | --- | --- | --- |
  | expert | 100%, +128 / -3, 0.9 | 100%, +142 / -9, 1.0 | 100%, +134 / -4, 1.0 |
  | average | 45%, charge 22, +176 / -204, 0.3 | 40%, charge 24, +219 / -216, 0.6 | 53%, charge 17 toll 1 slam 1, +189 / -177, 0.6 |

  Almost every average death is a charge follow-up (the return charge, or the charge after a slam or sweep) arriving while its dash is spent: with 0.3 s of reaction a 0.5 s follow-up leaves too little time to double jump. The expert reacts in 0.18 s and double jumps it, so it does not die, and its phase 1 frenzy breaks decide most fights.
  In one-life runs from floor 1 (`--run`, 100 seeds): the expert clears 73 of 100, dying only on floors 2-9 (0 Warden deaths in 73 arrivals); the average clears 56 of 100, with 13 Warden deaths in 69 arrivals (all charge follow-ups). #58 run target: average full-run clear at most 5%; it is about 56% now, a gap expected to close with #50 PRs 2-3 (floors 1-9) plus Warden tuning.

Differences from #44: the Warden has the #50 moveset instead of the King's slash, slam and charge, two phases, and the Toll; weapon frenzies exist since #61 (an assault dash counts as a frenzy hit); "frenzy hits break the armor" (only breaks at once in phase 1, see the gauge); frenzy burn also stops during hit-stop; the floor 8-9 bonus elite is always a knight; kills by damage over time give no blood.

### The Fallen King, castle version (floor 50)

#50 section 6. A `boss`-type enemy flagged `king: true, armored: true` (the Warden also has `armored: true`; `armored` marks the super armor gauge, `warden` / `king` the fight). It is the castle's floor-50 big boss in the boss arena layout (stage 4 art, two ledges, `loadFloor(50)` on `?test`). The normal run's King (`mode === 'normal'`, 900 HP, poise) is untouched: a state-hash comparison against the previous `core.js` is identical for normal and endless play on every stage, and for castle floors 1-10 up to the new additive fields.

- **Access**: the slice-end screen (after the Warden and the second Vigil) has a "Face the Fallen King" button (`castle.throne`) that calls `challengeKing()`: floor 50 at 100 blood, frenzy ended, debt cleared, the weapon chosen at the second Vigil and the block's relics. A win (`kill` {king: true}, `fightStats`, then 1.6 s) or a death comes back to the slice-end screen (`leaveKing(won)`: `floor` returns to 10 and `sliceEnd` {king: 'won' | 'dead'} is emitted). No records, no save. The slice-end screen offers another try.
- **Body**: 1200 HP, 80 x 128, speed 75, super armor gauge 150, lights 24 (the old King hit for 22, the Warden for 16), heavies a flat 100. Same gauge rules as the Warden: normal hits do nothing, Eclipse -25, a phase 1 frenzy hit breaks it, **phases 2 and 3 chip `FRENZY_CHIP` 34** (the user's Warden decision applied to both later phases; phase 3 is no different, so five frenzy hits break it); break = cancel + 140 px + 1.8 s stun at x1.5 + refill to 150 + 2.5 s lock. Knockback immune while armored (Vortex does not pull it), cannot be frozen, never flinches. Its body blocks walking when the hero is at or above its feet (a hero on the floor under a ledge landing is not pushed). Engagement 900 px; tells only on screen (-320 / +560).
- **Phases** at 67% and 34% (`kingPhase` {phase, x, y}; a big hit may skip to 3): cancels the move, 1.1 s pause, the gauge refilled and locked through the pause, banner `boss.castlePhase2` / `boss.castlePhase3`.
- **Moves** (`KING_MOVES`; every heavy glints `GLINT_LEAD` 0.4 s before contact; phase 2 and 3 heavy recoveries are 0.3 s shorter, floor 0.9 s):

| Move | Kind | Tell | Hit area | Recovery |
| --- | --- | --- | --- | --- |
| `slash` | light, opens the string | 0.6 | 146 in front, body height | 0.6, but a string follows |
| `string` then `slash` / `turnslash` / `charge` | the second hit | 0.85 total, neutral until the glint | **chosen at the second glint, 0.4 s before contact**: hero in front within 200 -> `slash`; behind within 220 -> `turnslash`; far in front -> `charge`; behind farther -> the string ends (recovery 0.8). The area is drawn at the glint (`enemyGlint` {branch: true}, then `enemyTell` / `enemyHeavy` {branch: true}) | the branch's own |
| `turnslash` | light, own pose | 0.5 | 10-120 behind it | 0.6 |
| `slam` | heavy | 0.95 | 112 x 123 in front plus a 100-damage floor wave (jump it); two pools at +-200 (phase 2: +-260), none in phase 3 | 1.2 |
| `charge` | heavy | 0.9 | 305 px path, body height (double jump or dash) | 1.0 |
| `volley` (phase 2+) | light | 0.92 | five drawn lines (-0.5..0.5 rad, 420 px, orbs at 265 px/s, aimed once at tell start); walk into a gap or dash | 0.9 |
| `descent` (phase 2+) | heavy | 1.1 | lands on the ledge the hero has stood on for `LEDGE_TIME` 2 s; shadow ring r `DESCENT_RADIUS` 120 drawn on the landing spot (`warn.landing`, `warn.circles`); hits a hero within 120 px who is up to 70 px above that surface (a hero who left the ledge, jumped high or is on the floor beneath is safe) | 1.3, then he drops back to the floor |
| `ritual` (phase 3, every third pick) | light | 1.28 | three ground discs r 56 at hero x -200, 0, +200 (x1.35) | 1.0 |

  Delayed variants: `slam` and `charge` in phases 2 and 3 at 50% (+0.4 s hold, glint unchanged), or a `jumped` habit read. Follow-ups reuse the Warden's string rules: after a `slam` within 330 px a `charge` (tell 0.5); after a `charge` with the hero behind within 330 px a return `charge`; at most `MAX_FOLLOWS` + 1 per pick (3 in phase 1, 4 later). A slash always opens the 2-hit string. No follow-up once the hero is dead or off screen.
- **Tithe** (signature): a pool the King made (`tithe: true`) that is not taken within `TITHE_DELAY` 3 s is drawn into him along a visible blood stream for its last second; each pool that completes restores `TITHE_RESTORE` 25 armor (not during a break stun; capped at 150). Taking the pool while it drains interrupts it (blood +14, nothing restored). `tithe` {state: 'start' | 'end' | 'broken', x, y, toX, toY, duration | amount, left}. Pools (+14, 4 s, at most 2: the newest; an older one pushed out while draining emits `broken`) are taken only from the surface they lie on (a ledge pool needs the ledge).
- **Blood Moon** (phase 3): slams stop making pools; every heavy that misses the hero sheds a pool at its contact point: a slam 100 px ahead, a charge where it ends, a descent 60 px beside the landing. A heavy that hits sheds nothing; light moves never shed. Dodging is income; `bloodPool` {x, y, life, tithe}.
- **Intelligence**: the Warden's habit memory on `slam` and `charge` answers (`jumped` x2 -> slam close / delayed charge far; `crossed` x2 -> a slash whose second hit is forced to `turnslash`, or a charge that ends in one; `retreated` x2 -> charge); the ledge timer (`trackLedge`: 2 s on one ledge, a 0.35 s hop off keeps it) draws the descent first; **above 150 blood his first move is a charge**; **while the hero is in frenzy** a phase 2+ pick is a volley 75% of the time and he **backsteps** away at 1.3x speed within 320 px unless cornered; otherwise the band pool: close slash / slam (phase 2+ adds charge), mid charge / slam (+ volley beyond 200 in phase 2+), far charge (+ volley). Never the same move twice in a row, except the frenzy volley. Nothing reads input.
- **Answers without a dash**: slash walk back; turnslash walk away; the string's charge branch double jump; slam walk out and jump the wave; charge double jump; volley walk into a gap; descent walk off the ledge; ritual walk into a gap between the discs. Twin Blades and Spear frenzies use the same.
- **Events** (new): `kingPhase`, `tithe`, `descent` {x, y, r, hit}, `sliceEnd` {king}; `kill` gains `king`; `enemyHeavy` / `enemyTell` / `enemyGlint` / `enemySwing` carry `enemy: 'king'`.
- **Bot** (`node tools/bot-run.mjs --seeds 40 --floors 50 --weapon <w> --skill expert|average`; floor 50 starts straight on the King with 100 blood): the Warden's policy plus the volley (walk into a gap, then dodge orbs in flight), the ritual discs, leaving a ledge before a descent, and floor pools before the Tithe. Clear % over 40 seeds (almost every average death is a charge string):

  | Bot | Greatsword | Twin Blades | Spear |
  | --- | --- | --- | --- |
  | expert | 100% | 100% | 100% |
  | average | 18% | 3% | 15% |

  Targets for this challenge: expert at least 50%, average at most 20%. The expert is a ceiling (it reads exact boxes and reacts in 0.18 s), so a human expert is expected well below it. Over 200 seeds: expert 98-100%, average 17% / 4% / 9%.

## Playtest verdicts

After each proposal is playtested, add one line here: `#<issue> <name> — keep / adjust / drop: <one-line reason>`.

#2 Shield bearer — keep (automated playtest; pending the user's hands-on feel check): head-on costs 22–64 HP while all three answers work at 0 damage (jump behind 2.5–3.3 s, dash through the wind-up 0.7–1.5 s, Eclipse 0.4–0.7 s for 35 MP), so it forces the intended choice; open: P3 turn delay during stun, `!` contrast and turn-cue taste notes, real-device check, generated sprite.

#19 Wind-up limit — keep (automated playtest; pending the user's hands-on feel check): at most 2 (stages 1–3) / 3 simultaneous warnings keeps crowds attack-dense (16 attacks per 6 s) but readable.

#16 Spearman — keep (automated playtest; pending the user's hands-on feel check): jump, dash-through and bait-and-punish all take 0 damage, standing at mid-range gets hit, and the warning box matches the hit box.

#17 Blood priest — keep (automated playtest; pending the user's hands-on feel check): interrupting the bless works (2.5 s cooldown on cancel) and blessed hits go 13→16; also found and fixed a shared bug where far warnings froze.

#12 Poise and stagger — adjust (automated playtest; pending the user's hands-on feel check): post-stagger armor (1.2 s, boss 0.6 s) was needed to stop tap-rhythm stun-lock, and knights break on combo cycle 2; open: knight pressure on a stationary tapper.

#11 Dash thrust and perfect dodge — keep (automated playtest; pending the user's hands-on feel check): ~150 ms perfect window on skeleton and knight with no MP loop (≤4 MP/s); open: bat perfects stay tight even after reach 55.

#50 PR 1 mash tuning — adjust (automated playtest; pending the user's hands-on feel check): a bot that holds attack and walks in died on floor 1 in 0 of 20 runs per weapon (69-97 blood left); after the far-read cleave and the skeleton numbers above it dies in 16-19 of 20 per weapon, while the reader bot clears floors 1-3 at 89-100% per weapon; the stepcut became rare (a failed cleave roll blocks it for 1 s).

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
