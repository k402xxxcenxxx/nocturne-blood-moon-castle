#!/usr/bin/env bash
# Creates the labels and milestones from docs/process.md. Safe to re-run.
set -euo pipefail
repo="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"

label() { gh label create "$1" --repo "$repo" --color "$2" --description "$3" --force >/dev/null; }
label type:proposal 5319e7 "玩法提案，需使用者核准"
label type:feature 1d76db "已定案的功能工作"
label type:bug d73a4a "行為與預期不符"
label type:tuning fbca04 "數值調整，不需提案"
label type:chore cfd3d7 "文件、工具、重構"
label status:needs-approval b60205 "等使用者核准"
label status:approved 0e8a16 "使用者已核准，可開工"
label status:in-progress 0052cc "實作中"
label status:in-review 5319e7 "PR 審查中"
label status:blocked 000000 "卡住，需使用者決定"
for r in design engineering art audio ux qa; do label "role:$r" c5def5 "需要 $r 角色"; done
label core-design e99695 "動到核心設計，必須使用者核准"
label P1 b60205 "當機、卡關、資料遺失"
label P2 d93f0b "明顯錯誤但可繞過"
label P3 fef2c0 "打磨"

existing=$(gh api "repos/$repo/milestones?state=all&per_page=100" -q '.[].title')
milestone() { grep -qxF "$1" <<<"$existing" || gh api "repos/$repo/milestones" -f title="$1" -f description="$2" >/dev/null; }
milestone "M0 Prototype" "找出最好玩的核心：試 3 個以上提案並寫下核心樂趣與支柱"
milestone "M1 Vertical Slice" "核心定案，一關達上線品質，手機與桌面可完整遊玩"
milestone "M2 Alpha" "所有規劃系統已實作，整輪不卡關"
milestone "M3 Beta" "功能凍結，只做平衡、修正、打磨與真機測試"
milestone "M4 Release" "無 P1/P2，文件與遊戲一致，打版本標籤"
echo "labels and milestones ready on $repo"
