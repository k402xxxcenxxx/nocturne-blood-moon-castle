# NOCTURNE — City of the Blood Moon

A gothic pixel-art 2D side-scrolling action roguelike for mobile and desktop browsers. Plain HTML, CSS and vanilla JavaScript with Canvas 2D and Web Audio: **no backend, framework, package install or build step**. It runs straight from GitHub Pages and every asset uses a relative path.

The interface is available in English and Traditional Chinese (繁體中文). The game picks one from the browser language, and you can switch at any time in Settings.

## Features

- Five stages per run: The Forsaken Gate → The Forbidden Archive → The Timeless Belfry → The Crimson Cathedral → The Bloodmoon Throne.
- Each run randomizes enemy placement, room layouts (some rooms are mirrored), chests and relic offers; 18 stackable relics, including four attack forms (returning crescent, piercing beam, ground waves after a plunge, Eclipse vortex) and four elemental ones (burn, frost, shock, bleed) with Shatter, Blood Flame and Chain Lightning reactions, offered three at a time. Every run opens with a build pick, and relics that combine with ones you own show up more often. Dying resets the run.
- Three-hit combo, double jump, invulnerable dash and the Eclipse area spell; skeletons, bats, armored knights, shield bearers and spearmen (from stage two), mages, blood priests (who bless nearby enemies) and the Fallen King, the three-phase final boss. Heavy third combo hits and Eclipse wear down an enemy's poise; break it ("BREAK") to stun the enemy and cancel its attack.
- Stage hazards: spikes, grinding gears and blood pillars flash red for 0.7 s before they strike (a dash passes through them); wooden barricades block the way until you break them or jump over (enemies hop over too); in the Crimson Cathedral, breaking an altar shuts off its blood pillars.
- Enemy stats and attack rate rise each stage; the Fallen King fights with slashes, slams (ground waves from phase two), charges, five-bolt volleys and a blood-moon ritual; the raised ledges at the arena edges (double jump) escape most of it, but not the slam.
- Hit-stop, hit flashes, knockback, sword trails, particles, critical numbers, screen shake, layered synthesized sound effects and an original dark score.
- Original pixel art drawn in code. The style direction is in the original concept art in `docs/references/` (gothic castle, moonlit night, library, clock tower); the concept art is not deployed.
- Multi-touch controls, adaptive widescreen view and fullscreen; keyboard controls; auto-pause when the window loses focus.
- Settings (including language), deepest stage reached and completed runs are saved in the browser. The current run is not kept when the page closes.

## How to play

On a phone, hold it sideways, tap fullscreen in the top right, then **Enter the Night**, pick your opening relic (a build-defining attack form or element, no healing), then fight through the five rooms of each stage (take the floor, or climb the platforms for chests and shortcuts), defeat the two guards at the end, and walk into the Moon Gate on the far right. Optional enemies can be skipped. Chests open when you stand next to them: a relic chest offers a bonus relic pick, a heal chest restores health and mana. After each of the first four stages you pick one relic and recover 20 HP and all MP; clearing stage five wins the run.

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | A / D or ← / → | Hold the bottom-left pad |
| Jump / double jump | Space / W / ↑ | Tap Jump; tap again in the air |
| Three-hit combo | J / Z, hold to keep attacking | Hold Slash |
| Invulnerable dash | K / Shift / X | Tap Dash |
| Eclipse magic | L / C | Tap Eclipse |
| Pause | Esc / P | Top-right pause button |
| Pick a relic | Click or 1 / 2 / 3 | Tap a relic card |

Attacking in the air is a plunge: you hang for a moment, drop through enemies below and land with a shockwave. Attack right after a dash for a long-reaching dash thrust; dashing through an attack right as it lands (a perfect dodge) restores MP and extends the thrust window. Eclipse costs 35 MP and also destroys nearby enemy projectiles. Mana regenerates over time, and hits and kills restore extra mana. A `!` above an enemy means an attack is coming: jump away or dash through it. Shield bearers block sword hits from the front: strike from behind, dash through them, or break their guard with Eclipse. Spearmen keep their distance and thrust a long way; the red box shows the thrust's reach, so jump or dash through it.

**Browser differences:** audio starts after the first press of the start button. Vibration needs `navigator.vibrate`, which iPhone and iPad Safari do not have; sound, hit-stop and visual feedback still work. If the Fullscreen API is unavailable the game switches to an in-page fullscreen. Vibration and screen shake can each be turned off in Settings, and both follow the system reduced-motion preference by default.

## Run locally

From this directory:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`. Use HTTP: opening `index.html` directly from `file://` is blocked by the browser's ES module rules.

To test on a phone on the same network, open `http://<your computer's LAN IP>:8080`. The deployed GitHub Pages site uses HTTPS.

## Deploy to GitHub Pages

`.github/workflows/pages.yml` deploys on every push to `main` or `master`: it runs `npm test` first and only then publishes the root `*.html`, `*.css`, `*.js`, `.nojekyll` and the `assets/` folder.

One-time setup: Repository → **Settings → Pages → Build and deployment → Source** → **GitHub Actions**. Every later push updates the site. The URL is shown on the workflow's `github-pages` environment, and should be `https://k402xxxcenxxx.github.io/nocturne-blood-moon-castle/`.

If your plan does not allow Pages for private repositories, or GitHub Actions cannot run on the account, the deploy fails and GitHub reports why.

## Tests

With Node.js 22+:

```bash
npm test
```

Built-in `node:test` covers a full five-stage run, valid relic choices, rising difficulty, attack direction and reach, one hit per swing, dash invulnerability, double jump and platforms, mana cost and projectile clearing, death, pause, and translation completeness. No test framework is needed.

`tests/browser-smoke.mjs` drives the game in a real browser where Playwright and Chromium are installed; see the top of that file for setup. The game itself never needs Playwright. Adding `?test` to the URL exposes a test handle on `window.__nocturne`; the normal URL does not.

Real phone vibration and per-device volume still have to be checked on the target hardware: automated browsers can confirm the APIs run, not how they feel.

## Files

| File | Purpose |
| --- | --- |
| `index.html` / `style.css` | HUD, touch buttons, responsive layout |
| `i18n.js` | Interface text for every language, and language detection |
| `core.js` | Stages, physics, combat, enemy AI, relics and run logic |
| `game.js` | Input, animation, effects, UI, saving and the game loop |
| `art.js` | Original pixel-art scenes and characters, with static scene caching |
| `assets/` | Generated, normalized runtime art (see `docs/art-pipeline.md`) |
| `audio.js` | Original Web Audio sound effects, music and vibration |
| `tests/` | Core logic, translation and browser checks |

This stage focuses on a complete five-stage single-player loop; there are no accounts, payments or online features.

## Contributing

Development rules and architecture are in [`AGENTS.md`](AGENTS.md), the development process and roles in [`docs/process.md`](docs/process.md), and the current rules and numbers in [`docs/game-design.md`](docs/game-design.md). In Claude Code, run `/produce` to continue development.
