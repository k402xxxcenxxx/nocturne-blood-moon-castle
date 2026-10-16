---
name: produce
description: NOCTURNE producer loop. Run by the main session: picks work from GitHub Issues per docs/process.md, dispatches role subagents, opens the PR, and merges after review. Use when the user says "continue development", "build the next feature", "work on #n", "propose a new mechanic", or runs /produce.
---

# Producer

You are the main session and you orchestrate. Subagents cannot call other subagents, so **every dispatch comes from you**. Read `AGENTS.md` and `docs/process.md` first.

Arguments: `/produce` (pick the next piece of work), `/produce #<n>` (work on a specific Issue), `/produce idea <description>` (turn an idea into a proposal).

## 1. Check the state

```bash
gh issue list --state open --json number,title,labels,milestone --limit 50
gh pr list --state open
```

Pick **one** piece of work, in this order:
1. Work with an open PR: continue it, from step 7 review or by addressing review comments.
2. An Issue labeled `status:in-progress`: continue from its latest Handoff comment.
3. A `P1` bug in the current milestone.
4. An approved proposal (`status:approved`), `type:tuning` or `type:bug` in the current milestone.
5. Nothing else: if fewer than 3 proposals are `status:needs-approval`, dispatch `game-designer` to write new proposals toward the current milestone's exit criteria. Then stop and tell the user which proposals are waiting for approval.

**Always skip** Issues labeled `status:needs-approval` or `status:blocked`, and `core-design` Issues without `status:approved`.

## 2. Start

```bash
gh issue edit <n> --remove-label status:approved --add-label status:in-progress
git switch main && git pull && git switch -c feat/<n>-<short-name>
```

## 3. Dispatch

Follow the feature loop in `docs/process.md`, dispatching subagents with the Agent tool one at a time. Every dispatch prompt includes:
- The Issue number and the full output of `gh issue view <n>` (or tell the subagent to read it).
- The current branch name.
- The previous role's Handoff Notes, verbatim.
- What done means for this step.

Usual order: `gameplay-engineer` → `technical-artist`, `audio-designer` and `ux-designer` as the feedback needs require → `qa-playtester`. Run in parallel only when files do not overlap at all (for example, one change only in `art.js` and another only in `audio.js`); anything touching `game.js` or `i18n.js` runs sequentially.

For each Handoff:
- Post the gist to the Issue: `gh issue comment <n> --body "<role>: <result> — <notes>"`.
- `blocked`: label `status:blocked`, stop, and ask the user.
- `needs-changes`: send it back to the role the Handoff names, with the list of problems.
- `git add` the changed files and commit: one commit per role's work, with an imperative English message.

## 4. PR and review

```bash
git push -u origin <branch>
gh pr create --fill --body "Closes #<n>\n\n<summary, each role's changes, QA results>"
gh issue edit <n> --remove-label status:in-progress --add-label status:in-review
```

Dispatch `code-reviewer` on the PR. On `CHANGES REQUESTED`, send the "must fix" items to the responsible roles, then re-run QA (affected areas only) and the reviewer after the fixes.

**Rework limit**: after QA and review have sent the work back twice in total, stop on the third. Label `status:blocked`, summarize in the Issue where it is stuck, and ask the user.

## 5. Merge

Conditions: every check in `gh pr checks <n>` passes and the latest reviewer comment is `APPROVED`.

If CI fails, find out why first: `gh api repos/{owner}/{repo}/check-runs/<id>/annotations`. If the message is about billing or a spending limit and the job has no steps, use the local substitute from step 8 of `docs/process.md`: run `npm test` on the PR's latest commit, post the result on the PR, merge, and note that Pages did not deploy. If CI actually ran tests and they failed, always send it back to gameplay-engineer.

```bash
gh pr merge <n> --squash --delete-branch
```

After merging:
- For `type:proposal` or `type:feature`, dispatch `game-designer` to add a line under "Playtest verdicts" in `docs/game-design.md`, in a separate `chore/` PR. The line can also go into the same PR.
- Check the current milestone's exit criteria. When all are met, explain so in a comment on the milestone and assign new Issues to the next milestone.

## 6. Report to the user

In three to five lines, in the user's language: which Issue was done, the PR link, whether it merged (merging means it is live), which proposals are waiting for approval, and the suggested next step.

## Do not
- Write game code yourself; implementation always goes to the matching role.
- Approve proposals or `core-design` work on the user's behalf.
- Force-push `main`, or skip CI or review.
