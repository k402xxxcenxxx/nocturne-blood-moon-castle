# AGENTS.md — NOCTURNE

For agents taking over development. Goal: **keep adding fun, good-feeling gameplay** without breaking the existing five-stage loop. Player-facing docs live in `README.md`; this file only covers what development needs.

## Hard rules

- Static site only: native ES modules, Canvas 2D, Web Audio. **No frameworks, packages or build step.** `npm test` uses only Node 22's built-in `node:test`.
- Every asset uses a relative path (GitHub Pages serves the game under `/nocturne-blood-moon-castle/`).
- `core.js` never touches the DOM, Canvas, Audio or `localStorage`, so it can run in Node tests.
- Game-logic randomness always goes through `game.rand()` (seeded and reproducible), never `Math.random()`. Purely visual effects may use `Math.random()`.
- **Art is generated with `/chatgpt-image-gen`** following [`docs/art-pipeline.md`](docs/art-pipeline.md) and [`docs/art-bible.md`](docs/art-bible.md): attach the approved anchors to every generation so assets stay consistent, normalize the results, and ship them from `assets/`. Particles, trails, flashes and other per-frame effects stay in Canvas code, and existing code-drawn art is replaced only through approved art conversion proposals. Audio stays synthesized in code. Never use external or commercial game assets.
- `docs/references/` holds original AI-generated concept art used only to align mood and palette. It never goes into the game and is not deployed. The concept art is far more detailed than the in-game pixel art: take the atmosphere and colors, not the resolution.
  - `library-mobile-ui.jpg`: layering of the library scene (warm wooden platforms over a cold green background) and the mobile layout (d-pad, round skill buttons on the right).
  - `castle-rooftop-night.jpg`: castle roof, night rain, violet-blue sky and moon, cold rim light on stone plus warm torchlight.
  - `clock-tower-hud.jpg`: giant clock face and gargoyles, and the top-left HUD (portrait, HP and MP bars).
- **All interface text goes through `i18n.js`.** Never hard-code player-visible strings in `game.js` or `index.html`; add a key to every language in `STRINGS` and use `t(key, vars)` in code or `data-i18n`, `data-i18n-html`, `data-i18n-aria`, `data-i18n-title` in markup. Supported languages: `en` and `zh-Hant`. Keys starting with `decor.` are decorative English captions shared by all languages and only need an `en` entry. Stage and relic text is keyed by stage index (`stage.<i>.name`) and relic id (`relic.<id>.name`).
- Code, comments, docs, commits, PRs and Issue comments are written in English. **Issue bodies are bilingual**: English first as the working language, then a Traditional Chinese version below it for the user to read and approve. See "Bilingual Issues" in `docs/process.md`.
- `npm test` must pass for every change. A failing CI test blocks deployment.

## Architecture (one path)

```
input (game.js) → Game.update(dt, input) (core.js) → emit(event) → game.js handleEvent: sound / particles / UI
                                                     ↘ game.js render() calls art.js draw*
```

| File | Owns | Change it for |
| --- | --- | --- |
| `core.js` | State machine `title/playing/paused/upgrade/dead/won`, physics, combat, enemy AI, `STAGES`, `RELICS` | Any rule or number |
| `game.js` | Keyboard and touch input, turning events into feedback (`handleEvent`'s `switch`), modal UI, saving, game loop, camera | Feedback for new events, new UI |
| `i18n.js` | `STRINGS` per language, `t()`, language detection | Any player-visible text |
| `art.js` | `drawScene/drawHero/drawEnemy/drawPortal`, with static scene caching; draws generated images from `assets/` as they replace code-drawn art | New enemy or scene visuals |
| `assets/` | Normalized runtime images generated through the art pipeline | New art |
| `audio.js` | `AudioSystem.play(name, intensity)`: synthesized sounds plus vibration patterns | New sounds |
| `index.html` / `style.css` | HUD, touch buttons, SVG icons (`#i-<name>`) | New buttons, new icons |

Logic and presentation talk only through events: core calls `this.emit('type', data)` and game.js decides how to present it. Follow this pattern for new mechanics.

## Common changes

- **New relic**: add `{ id, icon, apply }` to `RELICS`, then `relic.<id>.name`, `.type` and `.text` to every language in `i18n.js`. `icon` must be an existing `#i-<icon>` symbol in `index.html`. `apply` changes `player` stats directly; for a new kind of effect, add a field to `player` and read it in core. Relics can be offered again and stack, so cap the numbers (see the `crit` cap of 0.8 and the `magicCost` floor of 15).
- **New enemy**: `spawnEnemy` (health, damage, speed) → a branch in `updateEnemy` (movement, and setting the `tell` warning) → `enemyAttack` (hit check) → a visual in `art.js`'s `drawEnemy` dispatch → the type roll in `loadStage` decides which stages it appears in. Every attack must have a `tell` warning (the `!` overhead) so the player can react.
- **Feedback for a new event**: core `emit` → a `case` in game.js `handleEvent` → an `audio.play` sound name if needed.
- **Adding or removing stages**: the stage count of five is hard-coded in several places: `index === 4` and `stage === 4` in `core.js`, the `roman` array and `/ V` strings in `game.js`, the stage-based scene themes in `art.js`, `STAGES.length === 5` in `tests/core.test.js`, and the `stage.<i>.*` keys in `i18n.js`. Change them together.
- **New art**: follow `docs/art-pipeline.md`; runtime images go in `assets/` and are drawn from `art.js`. Load images with relative paths and keep the game playable if one fails to load.
- **New root-level files**: the Pages workflow only deploys root `*.html *.css *.js`, `.nojekyll` and the `assets/` folder. Add any other file type or folder to `.github/workflows/pages.yml`.

## Tests

- `npm test` runs `tests/core.test.js` and `tests/i18n.test.js`. In core tests, `arena()` clears the scene, `enemy()` places a target and `advance()` steps time at 1/120 s. Add a test in that style for each new mechanic and assert **rules** (hits, cooldowns, state transitions), not feel-tuning numbers. The i18n test fails if a language is missing a key.
- Browser test (optional): run `python3 -m http.server 8080`, then `node tests/browser-smoke.mjs`. Needs Playwright; `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` and `BASE_URL` override the paths.
- Adding `?test` to the URL exposes `window.__nocturne` (`game`, `settings`, `startRun`, `clearInput`) for changing state from the browser console, for example `__nocturne.game.loadStage(4)` to jump to the boss stage.
- Vibration, volume and feel must be checked on real devices; automated tests only verify rules.

## Team and process

Development follows `docs/process.md`: milestones M0 Prototype (current) → M1 Vertical Slice → M2 Alpha → M3 Beta → M4 Release, and each GitHub Issue goes through proposal → approval → implementation → presentation → QA → review → merge.

- The main session runs `/produce` as the producer and dispatches the 7 roles in `.claude/agents/`: `game-designer`, `gameplay-engineer`, `technical-artist`, `audio-designer`, `ux-designer`, `qa-playtester`, `code-reviewer`.
- Gameplay proposals (`type:proposal`) and `core-design` work wait until the user labels the Issue `status:approved`.
- Current rules and numbers are documented in `docs/game-design.md`; update it whenever rules or numbers change.
- Agents other than Claude Code (for example Codex) follow the same process: split work by the responsibilities in the role files and end with the same Handoff format.
