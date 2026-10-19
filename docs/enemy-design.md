# Enemy design style guide

How NOCTURNE enemies and bosses are designed. Every new enemy, move, elite or boss proposal follows this guide, and the engineer can check an implementation against it. It covers Castle Descent (`mode === 'castle'`), the direction approved in #43; the normal run and Endless Trial are the legacy prototype. Current numbers live in `docs/game-design.md`. Every number below is a design range: tune inside it, and change the guide only if the range itself is wrong.

**Status.** This guide is the target standard for new enemy work. Built so far (proposal #50, PR 1, `core.js`, castle mode only; numbers in `docs/game-design.md`): hyper armor on every minion attack from tell start, posture (×0.5 in an attack, ×2 in recovery, regeneration, a 1.5 s break stun and the riposte), the `steady` flinch budget, 2 attack tokens (at most 1 heavy, 0.3 s retake gap), range-band spacing for the melee enemies, facing lock at tell start and per-type re-face delays, the on-screen rule, the glint 0.4 s before every heavy, delayed variants (never on floors 1-4), and the skeleton and shield bearer kits (`stepcut`, `counter`). Still planned in #50: the spearman, bat, knight, priest and mage kits (they keep their old tells and recoveries but already use hyper armor, posture and tokens), rule-twist elites, the boss super armor gauge, the Gate Warden and the castle Fallen King; sections marked "(planned, #50)" describe that work. `docs/game-design.md` describes the code.

## Principles

1. **Same timescale, both sides commit.** Enemy attacks and the hero's swings use the same anticipation → contact → recovery structure. A whiffed enemy attack is the player's safest offense; a whiffed hero swing is the enemy's opening. Neither side can cancel freely.
2. **Difficulty comes from behavior, not numbers.** Make an enemy harder by giving it better choices (range bands, reads, follow-ups, tokens), never just more health, damage or defense.
3. **Every attack is fair.** A visible tell, a fixed hit area, no tracking after the lock, no attacks from off screen. A player who dies should know which move killed them and what the answer was.
4. **No mashing.** Holding attack must lose against every enemy. Hyper armor during attacks and posture outside attacks make sure of it.
5. **Ebb and flow.** Enemies pressure, back off, wait for an opening and pressure again. Pauses are part of the design; constant pressure from everything at once is not.
6. **Teach, combine, test.** One new idea at a time, then combinations, then a test of everything learned.
7. **Every fight feeds the blood decision.** Enemies are where blood comes from and where it goes (see "Blood and the pillars").

## Attack anatomy

Every attack has three phases. All three are part of the move's design, not side effects.

| Phase | What happens | Rules |
| --- | --- | --- |
| **Tell** (anticipation) | Wind-up pose, `!` (light) or red `!!` (heavy) overhead, a sound at tell start; the hit area `e.warn` is fixed and drawn | Hyper armor from the first frame (see "Hyper armor and posture"). Facing and hit area locked at tell start |
| **Contact** (active) | The hit check, a strike sound and a swing trail | Hits exactly `e.warn`. A travelling attack follows a path fixed at tell start. Each attack hurts at most once |
| **Recovery** | The enemy stands still with its facing locked, `punishable` is true | Hits flinch it and deal ×2 posture damage. This is the reward for a correct answer |

### Timing ranges (phone at 812×375 is the baseline)

Reaction on touch is about 0.25 s plus 0.05-0.1 s of input latency, and the dash lasts 0.18 s. At 245 px/s the hero walks about 60 px in 0.25 s.

| Move type | Tell | Release cue before contact | Recovery |
| --- | --- | --- | --- |
| Light (probe) | 0.45-0.65 s | none (the whole tell is the cue) | 0.4-0.6 s: at least one hero hit |
| Heavy | 0.85-1.1 s (Swift floor 0.7 s) | 0.4 s glint | 0.9-1.2 s: at least one full Greatsword combo (about 0.85 s) plus reaction |
| Delayed variant | 1.2-1.5 s total | 0.4 s glint, identical to the normal version | as the normal version + 0.2 s |
| Boss big move | 1.0-1.5 s | 0.4 s glint | 1.0-1.5 s |
| Follow-up in a string | at least 0.45 s from the previous contact | 0.4 s glint for heavy follow-ups | the string ends with the longest recovery of the string |

- **Never above 2 s** for a single tell: beyond that the player counts instead of reacting.
- **Never under 0.45 s** for anything that can hit (light probes included). Current violations: the 0.36 s bat tell and Swift light tells down to 0.3 s (the skeleton slash is 0.5 s since #50 PR 1).
- A projectile counts its tell until release; after release it must be visible for at least 0.3 s before it can reach the hero.

### The release cue (glint)

Every heavy, every delayed variant and every boss big move shows a **glint** (a white flash on the weapon plus a short metallic "shing") exactly **0.4 s before contact**. This is the one constant in the game: the player can always dodge on the glint, whatever happened before it. It is what keeps delays readable.

## Read rules

- **One move, one read.** Each move has its own pose, its own tell-start sound and, where it travels, its own path drawing. No two moves of the same enemy may share a pose or sound. If two moves look alike in a screenshot, redesign one.
- **Consistent signals across the cast.** `!` = light, red `!!` = heavy (one-shot range), glint = 0.4 s to contact, sustained "hold" sound = delayed variant, ring of light on the ground = area attack. These mean the same thing on every enemy and boss.
- **Reads use visible state only.** An enemy may react to what the player can see about themselves: a whiffed swing (`p.whiff`), a spent dash (dash cooldown running), being airborne, frenzy, a recent cast, walking in, blood level (the bar is on screen), standing on a ledge, the last few answers the player used. Never to raw input, a button press or a buffer.
- **Read at decision time, then commit.** A read picks the move when the tell starts. Nothing re-aims during the tell, except a boss re-aim that has its own cue and stops 0.4 s before contact.
- **No attack from off screen.** A tell may only start when the attacker is visible: inside the camera view. Mid-level that is within 320 px on the hero's left and 560 px on the right (the camera anchors the hero at 37% of a view at least 960 wide); near the start and end of a level the camera stops at the world edge (`game.js:548`), so check against the actual view there. Projectiles must also start on screen.
- **Readable in a crowd.** The tell sound of the enemy holding a token plays at full volume; others are quieter. At most one heavy tell is on screen at a time (see "Attack tokens").

## Hyper armor and posture

These replace "hit first and mash" in castle mode.

- **Hyper armor from tell start.** Once a tell starts (light or heavy), sword hits and projectiles deal damage but never flinch, knock back or cancel the attack. Only three things interrupt an attack in progress: a **posture break**, **Eclipse** (the weapon skill) and **freeze**. Killing the enemy also ends it.
- **Posture** (core field `poise` / `maxPoise`). Every hit deals posture damage (combo 17 / 17 / 62, thrust 35, plunge 45, Eclipse 55, shot 8).
  - During an enemy's tell or contact: posture damage ×0.5 (trading into an attack is possible, but slow).
  - During recovery: ×2.
  - Regeneration: after 1.5 s without posture damage, posture refills at 25% of max per second. Pressure breaks posture; poking every few seconds does not.
  - **Break**: cancels any attack, stuns for 1.5 s, and opens a **punish**: the first sword hit during the stun deals ×1.5 damage and +5 blood. Afterwards the existing post-stagger armor applies (no posture damage or flinch for 1.2 s).
- **Flinch budget outside attacks.** When an enemy is not attacking, a hit flinches it (0.24 s, heavy hit 0.42 s) only if its `steady` timer is 0; each flinch sets `steady` to the flinch time + 0.5 s. So the first hit of a string interrupts a walk, and the enemy can start a tell (with hyper armor) while the rest of the string lands. Hitting is safe once; a full combo must be earned (by a read, a recovery or a break).
- Bosses have no posture flinch at all; they use the super armor gauge from #44 (see "Bosses").

## Tracking (2D)

- Facing locks at tell start and stays locked until recovery ends. Crossing behind an enemy during its tell is always a valid answer unless the move is explicitly a two-sided move with its own pose (for example a spin).
- Outside attacks, a minion that finds the hero behind it turns after a **re-face delay**: 0.15 s (bat, skeleton) to 0.35 s (knight); the shield bearer keeps 0.25 s plus its 0.6 s post-bash turn delay. Slow turners are the ones you flank.
- Travelling attacks (rush, lunge, dive, charge) travel a fixed path. No steering, no homing projectiles; aimed projectiles aim once, at release.
- Tracking strength is a difficulty lever: elites and bosses may turn faster or re-aim once (with a cue), never mid-contact.

## Range bands and spacing

| Band | Distance (horizontal, centre to centre) | Typical moves |
| --- | --- | --- |
| Close | 0-110 px | light probes, cleaves, sweeps |
| Mid | 110-260 px | lunges, rushes, dives |
| Far | 260-460 px | projectiles, area attacks |
| Out | beyond the on-screen limit | no attacks; walk in |

- Each enemy has a **preferred band** and an attack pool per band. It picks from the pool of the band the hero is in, weighted by its reads. Being in the "wrong" band (inside a spearman's tip, close to a mage) is an answer the player can learn, and the enemy's response to it (a sweep, a blink) is its third move.
- **Without a token** (see below) a melee enemy waits at the edge of its band: about 30-50 px outside its probe range, stepping back if the hero walks in and stepping in when the hero backs off. Enemies never stand inside the hero or walk through it.
- **Retreat**: after a recovery, a ranged or support enemy backs off toward its band before acting again.

## Attack tokens

- The field has **2 attack tokens** (castle mode). A minion must hold one to start any tell (light, heavy, projectile, area). It keeps the token through contact and recovery and releases it when the recovery ends or the attack is cancelled, staggered or killed. A released token is free again after 0.3 s.
- **At most one of the two tokens may be a heavy** (generalizes the one-live-heavy cap from #47).
- **Priority** when more than one enemy can attack: the enemy whose attack range the hero is in; then the one the hero faces (on screen and readable); then the one that has waited longest (a starving enemy is never locked out). Ranged enemies take a token only while no melee enemy in close range wants it.
- Support moves (a priest's bless) need no token but only one support cast may run at a time.
- Bosses do not use tokens; adds in a boss fight share **one** token.
- The token count is a difficulty lever (theme, floor, frenzied variants), not a per-enemy number.

## Fakeouts (delayed and mixed variants)

Fakeouts are a Souls signature and the most criticized pattern when they are unfair. Rules:

- **Only heavies and boss big moves get delayed variants**; light probes never delay.
- **Allowed only on later floors, elites and bosses.** No variants on a theme's teaching floors (floors 1-4 of the Gate). Floors 5-7: a variant replaces the normal version 30% of the time; floors 8-9: 50%. Elites and bosses: any floor.
- **The variant must be learned first.** An enemy only uses the delayed version of a move the player has already faced as a normal move in this theme.
- **Readable**: a delayed variant has a distinct **hold pose** and a sustained **hold sound** for the whole delay, and always ends with the standard glint 0.4 s before contact. The player dodges on the glint either way.
- **One delay per string.** In a string, at most one hit is delayed, and a delayed hit is always a heavy (with `!!` and glint). Never mix delayed and non-delayed swings without a cue.
- **Has counterplay** beyond waiting: hitting a delaying enemy deals posture damage like any tell (×0.5), and Eclipse cancels it. Delays challenge reading, they do not trick.
- Fakeouts are capped at 1.5 s total tell (see the timing table).

## Group roles

Every theme's cast covers these roles; every combine and test floor mixes at least two.

| Role | Job in a group | NOCTURNE enemy |
| --- | --- | --- |
| Frontline / tank | Blocks the direct path, forces flanking | Shield bearer |
| Pressure | Close-range threat that punishes whiffs | Skeleton |
| Zoner | Owns the middle distance, punishes careless approach | Spearman |
| Flanker / glass cannon | Attacks from an unexpected angle, dies fast | Bat |
| Anchor / heavy | Slow, high posture, long strings; a mini-fight inside a room | Knight |
| Support | Makes others stronger; kill or interrupt first | Blood priest |
| Artillery | Punishes standing still at range | Mage |

Roles interact through tokens: a tank in front holding the token while a zoner waits forces the player to choose which to answer and where to stand.

## Teach → combine → test

Per 10-floor theme (from #43):

- **Teach (floors 1-4)**: one new enemy per floor, with the floor's other enemies already known. No variants. The new enemy appears first alone or with one known enemy.
- **Combine (floors 5-7)**: mixes of two or three roles; variants at 30%. One combine floor may preview the anchor enemy alone among known enemies, so the test floors do not introduce it.
- **Test (floors 8-9)**: the full cast, variants at 50%, one elite.
- **Floor 10**: a mini-boss that tests the theme's lessons (each of its moves echoes a minion lesson) and adds one signature mechanic.

## Elites: a rule twist, not stat inflation (planned, #50)

An elite is the same enemy with **one rule changed**, which the player must read anew. Health at most ×1.5, damage unchanged (heavies stay 100, so "above 100 blood survives a heavy" stays true). Examples of good twists: a probe becomes a two-hit string; it turns without a delay; it protects an ally; it re-aims once with a cue. Bad twists: more health, more damage, shorter tells, no tells. The elite banner names the twist. Today castle elites still deal ×1.3 damage (a heavy does 130, so 101 blood does not survive it) and the Swift affix shortens tells; #50 replaces both.

## Bosses

A boss is not a bigger minion. It needs all four:

1. **Intelligence**: move pools per range band; combo branching (at each glint the next hit depends on where the hero is); punishes habits from visible behavior (for example, the player's last two answers to a move); reads blood level and frenzy.
2. **Physicality**: size, reach, footfalls; a **super armor gauge** (planned, #44 step 3 and #50; the Fallen King uses poise 120 and stagger today: normal hits do nothing to it, the weapon skill chips it, frenzy hits break it) instead of flinching; knockback immunity; heavy recoveries that are real punish windows.
3. **A signature mechanic** that no minion has, tied to blood.
4. **Phases** that change the question (new move, new branch, signature escalates), each announced with a pause and a banner.

Every boss must be **beatable with every weapon** (#43): check each move against the Greatsword (slow, Numb to pain frenzy: knockback immunity, damage deferred as blood debt), Twin Blades (no dash during frenzy) and Spear (no i-frames during frenzy). Each move needs at least one answer that is not a dash. Boss fights must give blood from somewhere other than armored hits (blood pools, punish windows, break stuns).

## Blood and the pillars

Enemy design is what makes the blood decisions matter:

- **Pillar 1, blood is the only resource**: correct answers pay (recovery punish +2, posture break punish +5), mistakes cost (whiffs pay the swing cost, heavies take 100). An enemy must offer a blood-positive line for a player who reads it, and a blood-negative line for a masher.
- **Pillar 2, fullness is power and risk**: heavies deal 100, so the overfed half is visible insurance. Reads of `frenzy` and of high blood make a full bar a target; bosses may take blood above 100 specifically.
- **Pillar 3, the weapon defines the frenzy**: every enemy needs answers for all three weapons and all three frenzy downsides (Greatsword: damage deferred as blood debt, paid when the frenzy ends, #43 and #44; Twin Blades: no dash; Spear: no i-frames).

## Checklist for every new enemy or move

- [ ] Role and preferred range band named; it fills a gap in the theme's cast.
- [ ] Kit: a probe (light), a heavy and a third move (mixup, follow-up or band response). One pose, one sound, one path drawing per move.
- [ ] Every move: tell, glint (heavies), contact area `e.warn` fixed at tell start, recovery, all inside the timing ranges.
- [ ] Hyper armor from tell start; posture value and what a break gives; flinch budget applies.
- [ ] Facing locked at tell start; re-face delay set; travelling paths fixed.
- [ ] Uses an attack token; never attacks from off screen.
- [ ] Reads listed, each with the visible state it reads.
- [ ] Delayed variant (if any): hold pose, hold sound, glint, unlock floor.
- [ ] Counterplay per move, including one that is not a dash; checked against all three weapons and their frenzies.
- [ ] Blood: a blood-positive line for a good read, a blood-negative line for mashing.
- [ ] What it teaches, and which floor introduces it.
- [ ] Feedback needs: art (poses per move, code-drawn), audio (tell sound per move, glint, hold), UX (banners, text in en and zh-Hant).
- [ ] Core tests assert the rules (hyper armor, tokens, lock, recovery), not the numbers.

## References

- [Boss design: tips from a combat designer](https://www.gamedeveloper.com/design/opinion-boss-design---tips-from-a-combat-designer) (anticipation, contact, recovery; clean reads; tell length)
- [How Dark Souls changed combat](https://critpoints.net/2020/09/12/how-dark-souls-changed-combat/) (same timescale, whiff punishing)
- [The design lessons designers fail to learn from Dark Souls](https://www.gamedeveloper.com/design/the-design-lessons-designers-fail-to-learn-from-dark-souls) (behavior over stats, attack pools by distance, unfair patterns)
- [The art of the fakeout](https://www.wayline.io/blog/the-art-of-the-fakeout-combat-design) (delays with readable tells and counterplay)
- [Sekiro posture system](https://samurai-gamers.com/sekiro-shadows-die-twice/posture-system/) (a second meter against hit-lock)
- [Dark Souls II: Crown of the Sunken King review](https://www.gamebanshee.com/kpcuy) (enemy tracking: low-tracking Sanctum soldiers you can get to the side of)
- [Designing engaging enemy archetypes](https://www.wayline.io/blog/designing-engaging-enemy-archetypes) (group roles)
- [Enemy AI tech talk: attack tokens](https://serfofcinder.itch.io/archetype-portal-to-hell/devlog/738495/enemy-ai-tech-talk) (token pools as a difficulty lever)
- [Boss battle design and structure](https://www.gamedeveloper.com/design/boss-battle-design-and-structure) (bosses that test learned skills, phases)
