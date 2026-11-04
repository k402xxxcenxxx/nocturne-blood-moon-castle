# NOCTURNE balance log

Bot measurements (arms races, gate results, re-measures) moved out of `game-design.md` to keep it short. The rules and numbers stay in `game-design.md`; this file is the evidence behind them, by section, in the order they were measured.

## The apex skeleton (#66, user-directed)
**Arms race** (`node tools/bot-run.mjs --duel N`, expert bot, 200 seeds per cell, win %, Greatsword / Twin Blades / Spear; fairness audit 0 unanswerable hits in every step):

| Step | 1v1 | 1v3 | Full run expert | Full run average | What changed |
| --- | --- | --- | --- | --- | --- |
| Round 0 baseline | 100 / 100 / 100 | 100 / 100 / 100 | 63 / 70 / 66 | 26 / 25 / 30 | the #50 skeleton |
| R1 skeleton (5f6920f) | 100 / 100 / 100 | 100 / 100 / 100 | 59 / 68 / 69 | 28 / 26 / 26 | brain, snapshot, new moves; the hero still out-reaches (125 vs 82 px) and out-trades it |
| R2 skeleton (450296a) | 0 / 100 / 0 | 0 / 30.5 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | behavior levers alone did nothing; walk-in lunge kept; HP ×8, damage ×6, posture ×6, speed ×2, reach 200 |
| R2 bot (8d6aaa9) | 100 / 100 / 100 | 100 / 99 / 100 | 67 / 79 / 75 | 5 / 5 / 6 | bot perception fixes (the lunge was invisible to it, box padding, a reserved dash press, dash-trap landings, no re-entry) |
| R3 re-baseline | 91 / 88.5 / 100 | 71 / 31 / 13.5 | - | - | harness: hero at x 700 after `setWeapon`, hazards out of the audit, "left room" |
| R3 skeleton (08dd308) | 86 / 94.5 / 99.5 | 0 / 1 / 0 | 24 / 30 / 37 | 0 / 0 / 0 | HP ×12, damage ×8, posture ×12, speed ×2.5, reach 280, 3 tokens, the chain as a dash-covering lunge |
| R3 bot (fd38276) | 100 / 94.5 / 99.5 | 49.5 / 41.5 / 29.5 | 26 / 22 / 42 | 0 / 0 / 0 | the bot releases a turn the press cap refused, scored dash landings, room fence |
| R4 skeleton (f85dc03) | 100 / 60 / 92 | 20 / 9 / 22 | 1 / 4 / 7 | 0 / 0 / 0 | chain depth 2, lunge recovery 0.5 s and no attack cooldown after it |
| R4 bot (e99b44e) | 100 / 60 / 92 | 20 / 9 / 22 | 1 / 4 / 7 | 0 / 0 / 0 | six levers tried (later jump window, Eclipse on converging lunges, fences, platform box check, staggered approach), none beat noise; the two-lunge chain answers any dash or jump, so the race ends here |
| Playtest cut (2026-10-30) | 100 / 60.5 / 100 | 34 / 9.5 / 23 | 2 / 10 / 13 | 0 / 0 / 0 | the user: moves right, too tanky; HP ×12 → ×9.6 |

The ship gate's proof that it can be beaten: the expert bot wins Greatsword 1v1 at tier 0 in 100% of 200 seeds (Round 4 skeleton step).

## Brains: the shield bearer and the spearman (#62 PR 1, user-directed)
**Arms race** (expert bot, 200 seeds per cell, floor 5, tier 2, win % Greatsword / Twin Blades / Spear; every audit 0 unanswerable):

| Step | 1v1 shield | 1v1 spear | 1v2 shield | 1v2 spear | frenzy 1v1 shield / spear | mix shield+spear | average 1v1 shield / spear | average mix | Full run expert | Full run average |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Round 0, brain off (#50) | 100 / 100 / 100 | 100 / 100 / 100 | 99.5 / 100 / 100 | 100 / 100 / 100 | 100 / 100 | 100 / 99.5 / 100 | 100 / 100 / 100 and 100 / 98.5 / 100 | 97.5 / 99 / 100 | 1 / 7 / 15 | 0 / 0 / 0 |
| Round 1 enemy (brains v1) | 100 | 100 | 100 / 100 / 100 | 100 | 100 | 100 | 95 and 100 | 97 / 92.5 / 96.5 | 1 / 8 / 14 | 0 / 0 / 0 |
| Round 1 bot (cues) | 100 | 100 | 100 | 100 | 100 | 100 | 95 and 100 | 97 / 91 / 97 | | |
| Round 2 enemy (lunge, melee lunge, #50 spawn cooldown) + current bot | 100 | 100 | 100 / 100 / 100 | 99.5 / 99.5 / 100 | 100 | 100 / 98 / 100 | 100 and 98.5 / 100 / 100 | 94 / 82 / 89.5 | 2 / 7 / 9 | 0 / 0 / 0 |
| Round 3 enemy (trait levers incl. stats, shove, jab, chains, brace vs Eclipse), earlier bot | 100 | 100 | 100 / 100 / 100 shield, 0 / 100 / 100 spear | | 100 | 100 | 100 and 56 / 29 / 30 | 6 / 8 / 2 | 1 / 3 / 5 | 0 / 0 / 0 |
| Round 3 bot (jump a thrust box, dash the gap, column lift) | 100 | 100 | 100 / 100 / 100 and 99.5 / 100 / 100 | | 100 | 100 | 100 and 80.5 / 71.5 / 76 | 14.5 / 54.5 / 28.5 | 1 / 3 / 5 | 0 / 0 / 0 |
| Round 4: stat levers removed (HP, posture, damage); pair aimed at the dodge landing; push x1.5 | 100 | 100 | 100 / 100 / 100 and 100 / 100 / 100 | 100 | 100 | 100 | 100 and 100 | 100 / 99.5 / 99.5 | 2 / 10 / 12 | 0 / 0 / 0 |
| Round 6: moves (haft that hit 3 cannot break, vault, spin, pin), spawn cooldown cap 1.0 s, no stat lever | 100 | 100 | 100 / 100 / 100 and 100 / 100 / 100 | 100 | 100 | 100 | 100 and 92 | 100 | 1 / 6 / 10 | 0 / 0 / 0 |

Notes: with the stat multipliers gone the cells fall back to the #50 level (the expert never takes a hit from a single shield bearer or spearman, and the pair is dodged: the expert answers the bash with a dash and the thrust with a jump or walk). **G1 holds** (100% in every 1v1 cell; seed 1 wins each: `node tools/bot-run.mjs --duel 1 --type shield --floor 5 --tier 2 --weapon heavy --seeds 1`). **Fairness audit 0 in every cell.** **Mash bot** (after round 6): 0% on castle floors 1-3, in rooms of five shield bearers and 3 shield + 3 spear; five spearmen 2 / 0 / 2% (Greatsword / Twin / Spear), floors 4-5 0-3% (round 6 added the vault, spin and pin; see above). Inside-tip answers that remain for the hero: a hit from behind the haft, a plunge, Eclipse, or stepping out of the spin and pin boxes. The brace against Eclipse is a new trait defense the user allowed on 2026-10-30; it halves Eclipse damage and keeps the guard while up. Floors 4-5 show a 0-3% masher clear because those rooms hold bats and apex skeletons the brains do not touch (brains off: 0-8%). G3 full runs (round 6): expert 1 / 6 / 10%, average 0 / 0 / 0%, no timeouts. Round 3 (with the stat multipliers) measured expert 1 / 3 / 5% and mash 0% everywhere; those rows are kept for the record.

## Brains: the bat and the knight (#62 PR 2)
**Arms race** (expert bot, 200 seeds, floor 8, tier 3; win % Greatsword / Twin / Spear; audit 0 in every cell):

| Step | 1v1 bat, knight | 1v2 bat, knight | frenzy 1v1 | mix bat+knight, knight+spear, spear+bat, shield+bat | average 1v1 bat, knight | average mix knight+spear | Full run expert | Full run average |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Round 0, brain off (#50) | 100 | 100 | 100 | 100 (shield+bat 96.5-99) | 100 | 100 | 2 / 8 / 8 (shield, spear, bat, knight off) | 0 / 0 / 0 |
| Round 1 (brains) | 100 | 100 | 100 | 100 | 100 | 99.5-95.5 / 91 / 96 | | |
| Round 2 (no bat spawn cooldown, chain, stand-and-swing heavies, approach greatswing, dive from 380 px) | 100 | 100 | 100 | 100 | 100 | 100 | 1 / 10 / 14 | 0 / 0 / 0 |

Notes: a single bat or knight is dodged by the expert (0 hits), as with the PR 1 types, so **G1 holds** (100% 1v1 for both with every weapon; seed 1 wins each: `node tools/bot-run.mjs --duel 1 --type bat --floor 8 --tier 3 --weapon heavy --seeds 1`). **Mash bot (floor 8, tier 3, Greatsword / Twin / Spear)**: rooms of five bats 0 / 0 / 0%, five knights 0 / 0 / 0%, 3 knight + 3 bat 2 / 0 / 0%, 2 knight + 2 spear + 2 bat 1 / 0 / 0% (was 100% for the first three with the #50 types). Diagnosis of the big room: the heavies were being killed inside their own tells (a Greatsword mash kills a 101 HP knight in about 1.1 s, a bat in 0.8 s, against 0.9-1.0 s tells) and only one heavy runs at a time; the knight `charge` fixes that by starting from outside the hero's reach, the bats no longer dive at the hero that is hitting them. The last round added a rule for cooperation between different types: a light does not start if its hit would land in the 0.8 s of i-frames just before another enemy's heavy contact, and a heavy (of a different type than a pending light) waits out a light's i-frames (`canStrike`; the heavy has priority). The traced failures were a knight charge wasted inside the i-frames of a spearman's thrust. With the bats' finisher swoop, five bats fall to 0%. The remaining 2% is the Greatsword in 3 knight + 3 bat, and 1% in the large mixed room (a dive leaves a few blood and the kills refill it); the PR 1 rooms stay at 0-2%, castle floors 1-5 at 0%. These move in cliffs with the seed, so G2's 0% is not yet met in the large mixed room. G3 full runs (round 4): expert 3 / 6 / 11%, average 0 / 0 / 0%, no timeouts; average 1v1 knight 92%, average mix knight+spear 88-89%, average mix bat+knight 100%. Round 3 (knight charge, bat targeting): average 1v1 knight 92%, average mix knight+spear 88-89%.

## Brains: the priest, the mage and the seven elite rows (#62 PR 3)
**Arms race** (expert bot, 200 seeds, floor 9, tier 3; win % Greatsword / Twin / Spear; audit 0 in every cell):

| Step | 1v1 priest, mage | 1v2 priest, mage | frenzy 1v1 | mixes (priest+mage, knight+priest, spear+mage, shield+mage) | each elite 1v1 | average 1v1 priest, mage | average mixes | Full run expert | Full run average |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Round 0, brains off (#50) | 100 | 100 | 100 | 100 (spear+mage 98.5-100) | 99-100 | 100 | 98-100 | 1 / 4 / 15 (shield, spear, bat, knight off; priest and mage on) | 0 / 0 / 0 |
| Round 1 (brains) | 100 | 100 (hits 0.6-1.0 per fight) | 100 | priest+mage Twin 28% (bolts flew 4 s, the bot dodged forever) | 100 | 100 | 84-97 / 91-92 | | |
| Round 2 (bolt range, targeted heavies, shadow rules) | 100 | 100 | 100 | 100 | 100 (average 92% vs spear and knight elites) | 100 | 89-100 / 90-91 | 1 / 8 / 12 | 0 / 0 / 0 |

Notes: G1 holds (100% 1v1 for priest and mage, and for each of the seven elites, with every weapon; seed 1 wins each: `node tools/bot-run.mjs --duel 1 --type priest|mage|elite:<type> --floor 9 --tier 3 --weapon heavy|twin|spear --seeds 1`; the elite bar is 30%). **Mash bot (floor 9, tier 3, Greatsword / Twin / Spear)**: five priests 0 / 0 / 0% (was 100 / 100 / 100%), five mages 0 / 0 / 0% (was 96 / 95 / 97%), 3 priest + 3 mage 0 / 0 / 0%, knight+spear+shield+priest+mage+bat 10 / 0 / 0%, 2 priest + 2 mage + 2 knight 1 / 0 / 0%; the PR 1 and PR 2 rooms and castle floors 1-5 stay at 0-2%. The Greatsword's 13% in the caster rooms was the rite or ray landing and kills refilling the few blood left; the blood curse closed it. G3 full runs: expert 1 / 7 / 12%, average 0 / 0 / 0%, no timeouts. The cover rite circle is placed on the floor (or platform) under the predicted landing and the crossfire ray aims at the landing height, never at an airborne snapshot's height.

## Brains: the priest, the mage and the seven elite rows (#62 PR 3)
**Caster stall (bot side)**: with 482 HP casters the first re-measure showed 1v2 mage with the Twin Blades at 0% (all 60 s timeouts) and priest+mage, shield+mage and mage+spear mixes with up to 136 timeouts. Two causes, both on the harness and bot side: the duel foes were not `required`, so the bot walked to the Moon Gate once no foe was within 700 px (now they are required, like a real room's, and the gate is out of reach), and when casters were its only threat it backed away along each bolt instead of closing. The expert (and average) bot now chases a caster that is its only threat: it dashes through the bolt toward it (i-frames), hops a flat bolt or ray while moving in, and otherwise keeps walking toward it; it does not do this while a non-caster foe is within 400 px, in a rite circle, or under a high ray. Human limits are unchanged (0.18 s reaction, 8 presses/s, on-screen info). No duel cell times out any more, and no enemy number changed.

The mash and full-run numbers above replace the earlier tables; the audit stays 0.

## Brains: the Gate Warden (#62 PR 4)
**Arms race (3 rounds, scratchpad `62pr4`)**, `node tools/bot-run.mjs --duel 1 --type warden`, floor 10, 100 blood, 200 seeds, heavy / twin / spear:

| Step | Expert | Average | Notes |
| --- | --- | --- | --- |
| Round 0: #50 Warden (`--brain off`) | 100 / 99.5 / 100 | 42 / 46 / 27.5 | mash at 200 blood 58 / 13 / 37%, at 100 blood 0% |
| Round 1: enemy step (brain, gates, guards, bell, toll) with the old bot | 33 / 7 / 27 (30 seeds) | - | the bot walked into rings and lost to guards (it ignored them) |
| Round 2: bot step (bell plan, ring dash or jump, guards through the field policy, the Warden's own tell outranks a guard's) | 100 / 99.5 / 99.5 | 24 / 15 / 25 | audit 0 of 50 / 29 / 37 (expert), 0 of 406 / 438 / 432 (average); mash at 100 blood 0%, at 200 blood 63 / 0 / 35% |
| Round 3: enemy levers tried on the expert (520 HP) | | | follow-up tells 0.45 s: 91 / 100 / 93; up to 3 / 5 follow-ups: 98 / 95 / 93; gate pick 50%: 100; guards from the start: 100; Warden HP 800 / 1100: 90 / 100 / 83 and 91 / 100 / 87 |

Full runs (floors 1-10, one life, 100 seeds): expert clear 48 / 48 / 51% (heavy / twin / spear; no expert death on floor 10, so every expert that reached the Warden beat it), average 0 / 0 / 0%.

## Brains: the Gate Warden (#62 PR 4)
**After the HP change** (100 seeds, heavy / twin / spear): expert Warden duel 99 / 100 / 98% (audit 0 of 19 / 9 / 40; seed 1 wins each: `node tools/bot-run.mjs --duel 1 --type warden --seeds 1 --weapon heavy|twin|spear`), average Warden duel **6 / 14 / 8%** (audit 0 of 235 / 212 / 231). Mash bot (hold attack, walk in): 0% with every weapon at both 100 and 200 blood (was 63 / 0 / 35% at 200 blood with 520 HP). Full runs, floors 1-10, 100 seeds: expert clear 48 / 48 / 51% (no expert death on floor 10), average 0 / 0 / 0% (unchanged).

## Brains: the Gate Warden (#62 PR 4)
**D2 on the average bot** (win % heavy / twin / spear, 100 seeds, floors 5 and 8 cells as in the earlier PRs; every audit is 0): Warden duel **6 / 14 / 8**. The next lowest cells: `mix bat,knight` 94 / 97 / **39** (Spear), `elite skeleton` **65** / 93 / 73, `mix shield,bat` Twin **65**, `mix spear,mage` Twin 67, `1v2 spear` 74 / 77 / 59, `mix knight,priest` 75 / 73 / 65, `mix spear,bat` 76 / 77 / 82, `mix knight,spear` 79 / 82 / 71, `skeleton 1v3` 87 / 77 / 70, `1v1 knight` 80 / 91 / 81, `1v2 knight` 78 / 80 / 81, `1v1 spear` 88 / 89 / 90, `elite spear` 88 / 83 / 90, `elite knight` 86 / 91 / 90, `mix shield,mage` 93 / 82 / 89; the other cells (skeleton 1v1, shield, bat, priest, mage, their frenzy cells and elites) are 93-100. D2 holds: the Warden is the lowest cell for the average bot with every weapon, by 31+ points. Expert lowest cell for reference: `mix shield,mage` Twin 86%; the Warden expert cell is 98-100%, which G1 allows.

## Brains: the Fallen King (#62 PR 5)
**Measured** (100 seeds, heavy / twin / spear, 100 blood, floor 50): expert 86 / 100 / 93% (audit 0 of 55 / 116 / 208; seed 1 wins heavy and twin, seed 2 spear: `node tools/bot-run.mjs --duel 1 --type king --seeds 1 --weapon heavy|twin|spear`), average 12 / 40 / 3%; mash bot 0% with every weapon at 100 and 200 blood. Before this PR the expert was 100 / 100 / 70%. The King is not part of the floor 1-10 runs, so the full-run numbers are the PR 4 ones (expert 48 / 48 / 51%, average 0 / 0 / 0%).
