# Development process

NOCTURNE is built by a producer (the main session running `/produce`) leading 7 role subagents. This document defines the milestones, the per-feature loop, the handoff format and the GitHub conventions. Each role's details are in `.claude/agents/<role>.md`.

## Roles and file ownership

| Role | Definition | Model | Owns |
| --- | --- | --- | --- |
| Producer | `.claude/skills/produce/SKILL.md` (main session) | main session | Issues, branches, PRs, merging, `docs/process.md` |
| Game Designer | `game-designer` | Opus | Proposal Issues, `docs/game-design.md`, the `STAGES` / `RELICS` numbers in `core.js` |
| Gameplay Engineer | `gameplay-engineer` | Sonnet | `core.js`, `tests/core.test.js`; input, game loop and `handleEvent` wiring in `game.js` |
| Technical Artist | `technical-artist` | Sonnet | `art.js`, `assets/`, `docs/art-bible.md` and `docs/art-bible/`, `docs/art-log.md`, `tools/`; `render`, particles, sword trails and screen effects in `game.js`; all image generation |
| Audio Designer | `audio-designer` | Sonnet | `audio.js` (sound effects, music, vibration patterns) |
| UX Designer | `ux-designer` | Sonnet | `index.html`, `style.css`, `i18n.js`; HUD, modals, touch and accessibility in `game.js` |
| QA Playtester | `qa-playtester` | Haiku | `tests/` (regression tests, `browser-smoke.mjs`), playtest reports |
| Code Reviewer | `code-reviewer` | Opus | Edits nothing; posts review verdicts on PRs |

`game.js` is shared by three roles, so work on one branch is dispatched **sequentially**, never in parallel. Parallel work is only allowed when the files do not overlap at all, such as `art.js` and `audio.js`.

Any role that adds player-visible text adds the key to every language in `i18n.js`. The UX Designer owns key naming, tone and the final wording.

The Technical Artist is the only role that generates images, so every asset passes through the same anchors and checklist. Other roles describe what they need (for example the UX Designer specifies a button's size and states) in the Issue's feedback needs. Image generation follows `docs/art-pipeline.md` and needs a local session with Claude in Chrome; see "Requirements and limits" there.

## Milestones

| Milestone | Purpose | Exit criteria |
| --- | --- | --- |
| **M0 Prototype** (current) | Find the most fun core | At least 3 gameplay proposals tried; each has a playtest verdict (keep / adjust / drop); a one-line core fun statement and 3 design pillars written into `docs/game-design.md` |
| M1 Vertical Slice | One complete slice at ship quality | Core mechanics locked; one stage's art, audio and UX at final quality; a full run plays on mobile and desktop; no known P1 bugs |
| M2 Alpha | Feature complete | Every planned system implemented, not necessarily polished; content may be placeholder; a full run never soft-locks or crashes |
| M3 Beta | Content complete, polishing | No new features; only balance, bug fixes, performance and feel; playtested on real devices |
| M4 Release | Public release | No known P1 / P2 bugs; README and `docs/game-design.md` match the game; release tag created |

The producer decides milestone changes from the exit criteria without user approval, but explains the reason in a comment on the GitHub milestone. If a change touches the core design, follow "Approval gates" below.

## Feature loop (one round per Issue)

```
1 Propose ─► 2 Approve ─► 3 Start ─► 4 Build ─► 5 Present ─► 6 Verify ─► 7 Review ─► 8 Merge
 designer     user         producer   engineer   artist/      qa          reviewer    producer
                                                 audio/ux
```

1. **Propose**: the Game Designer opens a `type:proposal` Issue from the proposal template, labeled `status:needs-approval`. Proposals that touch the core design also get `core-design` (defined below).
2. **Approve (user)**: work starts only after the user changes the label to `status:approved`. If the user comments asking for changes, the Designer revises the proposal and resubmits it. The producer reads labels with `gh`; **nothing starts without `status:approved`**.
3. **Start**: the producer changes the label to `status:in-progress` and branches from `main` as `feat/<issue number>-<short name>` (`fix/` for bugs, `tune/` for tuning, `chore/` for chores).
4. **Build**: the Gameplay Engineer writes the rules, emits events and adds core tests; `npm test` must pass.
5. **Present**: following the proposal's feedback needs, dispatch the Technical Artist, Audio Designer and UX Designer in order. Skip roles with nothing to do.
6. **Verify**: the QA Playtester runs `npm test`, plays the proposal's playtest scenario in the browser in both languages, and reports bugs and feel issues. Problems go back to step 4 or 5.
7. **Review**: the producer opens a PR (body includes `Closes #<n>`), changes the label to `status:in-review` and dispatches the Code Reviewer. The verdict is `APPROVED` or `CHANGES REQUESTED`, posted as a PR comment.
8. **Merge**: once CI is green and the latest verdict is `APPROVED`, the producer squash-merges and deletes the branch. Merging to `main` deploys.

**When GitHub Actions cannot run**: if the CI job fails without starting (for example GitHub reports a billing or spending-limit problem and the job has no steps), local tests may substitute. The producer runs `npm test` on the PR's latest commit, posts the result as a PR comment (`Local CI substitute: <commit SHA> npm test N/N passed`), and may then merge. Pages does not deploy in this case, so note "not deployed" in a PR comment after merging. If CI actually ran tests and they failed, this substitute does not apply.

**Rework limit**: after an Issue has been sent back twice in total across steps 6 and 7, there is no third self-correction. The producer labels it `status:blocked`, writes in the Issue where it is stuck, and asks the user to decide.

**Art conversion**: replacing existing code-drawn art with generated art is a `type:proposal` labeled `role:art`, one scope per proposal (scenes, then UI, then characters). The first one builds the art bible. Proposals may embed concept images so the user reviews the idea and the look together.

**Art review**: the Technical Artist accepts generated assets by the art bible's checklist without waiting for the user, and asks the user on the Issue only when unsure or after 10 accepted assets since the last review (see "Self-review and escalation" in `docs/art-pipeline.md`).

**Tuning and bugs**: `type:tuning` and `type:bug` skip the proposal and approval and start at step 3, but still go through steps 6 to 8 — unless the change touches the core design.

## Approval gates

Work stops and waits for the user in only two cases:

- Before any `type:proposal` starts.
- Any work labeled `core-design`, whatever its type.

`core-design` means changing death resets, cross-run progression, the number of stages per run, controls or key bindings, win and loss conditions, target platforms, or adding an external dependency or build step.

## Handoff format

Every subagent ends its report with this block; the producer uses it to decide the next step:

```
## Handoff
- Role: <role name>
- Issue: #<n>
- Result: done | needs-changes | blocked
- Files changed: <paths, or "none">
- Verification: <what ran and the result, e.g. "npm test 14/14 passed">
- Next: <next role or producer>
- Notes: <what the next role must know, e.g. new event names, new player fields, numbers to tune>
```

The producer posts the gist of each Handoff as an Issue comment so progress lives on GitHub and survives a new session.

## Definition of Ready

- The Issue clearly describes the player-facing behavior and a playtest scenario.
- The proposal is labeled `status:approved`, or it is `type:tuning` / `type:bug`, which need no proposal.
- A milestone and role labels are assigned.

## Definition of Done

- `npm test` and CI pass (when Actions cannot run, use the local substitute from step 8); new rules have core tests.
- The QA playtest report has no open P1 issues.
- The Code Reviewer's latest verdict is `APPROVED`.
- Player-visible changes are reflected in `README.md`; rule or number changes in `docs/game-design.md`.
- Every new player-visible string exists in all languages in `i18n.js`.
- The change follows the hard rules in `AGENTS.md`.

## GitHub conventions

Created by `scripts/setup-github.sh`, which is safe to re-run.

| Kind | Labels |
| --- | --- |
| Type | `type:proposal` `type:feature` `type:bug` `type:tuning` `type:chore` |
| Status | `status:needs-approval` `status:approved` `status:in-progress` `status:in-review` `status:blocked` |
| Role | `role:design` `role:engineering` `role:art` `role:audio` `role:ux` `role:qa` |
| Other | `core-design` `P1` `P2` `P3` |

- Milestones: `M0 Prototype`, `M1 Vertical Slice`, `M2 Alpha`, `M3 Beta`, `M4 Release`.
- Severity: P1 = crash, soft-lock, data loss or the core is unplayable; P2 = clearly wrong but has a workaround; P3 = polish.
- Commits, PRs, Issue titles and comments are written in English. Commit and PR titles are imperative, e.g. `Add shield knight enemy`. Issue bodies follow "Bilingual Issues" below.

## Bilingual Issues

English is the shared development language; the user reads and approves in Traditional Chinese. So every Issue body has both:

```
<English sections>

---

## 中文版

<the same sections, in Traditional Chinese>
```

- Whoever creates or edits an Issue body (Game Designer, Producer, any role filing a bug) writes both versions in the same edit.
- The Chinese version is a full translation with the same headings, numbers, identifiers and checkboxes, not a summary. Code identifiers, ids and file names stay as they are.
- English is the source of truth. If the two disagree, fix the Chinese to match the English.
- When the user comments in Chinese asking for changes, update the English first, then the Chinese.
- Titles stay English only, so branch names and PR links stay consistent.
- Issues opened from the templates get the Chinese version from the last form field, which renders as a `### 中文版 (Traditional Chinese version)` heading; that counts as the same format.
