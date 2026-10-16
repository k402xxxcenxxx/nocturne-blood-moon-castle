#!/usr/bin/env bash
# Creates the labels and milestones from docs/process.md. Safe to re-run.
set -euo pipefail
repo="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"

label() { gh label create "$1" --repo "$repo" --color "$2" --description "$3" --force >/dev/null; }
label type:proposal 5319e7 "Gameplay proposal; needs user approval"
label type:feature 1d76db "Agreed feature work"
label type:bug d73a4a "Behaves differently than expected"
label type:tuning fbca04 "Number tuning; no proposal needed"
label type:chore cfd3d7 "Docs, tooling, refactoring"
label status:needs-approval b60205 "Waiting for user approval"
label status:approved 0e8a16 "Approved by the user; ready to start"
label status:in-progress 0052cc "In progress"
label status:in-review 5319e7 "PR under review"
label status:blocked 000000 "Stuck; needs a user decision"
for r in design engineering art audio ux qa; do label "role:$r" c5def5 "Needs the $r role"; done
label core-design e99695 "Touches the core design; needs user approval"
label P1 b60205 "Crash, soft-lock or data loss"
label P2 d93f0b "Clearly wrong but has a workaround"
label P3 fef2c0 "Polish"

existing=$(gh api "repos/$repo/milestones?state=all&per_page=100" -q '.[].title')
milestone() { grep -qxF "$1" <<<"$existing" || gh api "repos/$repo/milestones" -f title="$1" -f description="$2" >/dev/null; }
milestone "M0 Prototype" "Find the most fun core: try 3+ proposals and write the core fun and pillars"
milestone "M1 Vertical Slice" "Core locked, one stage at ship quality, full run on mobile and desktop"
milestone "M2 Alpha" "All planned systems implemented; a full run never soft-locks"
milestone "M3 Beta" "Feature freeze: balance, fixes, polish and real-device testing only"
milestone "M4 Release" "No P1/P2, docs match the game, release tagged"
echo "labels and milestones ready on $repo"
