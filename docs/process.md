# 開發流程

NOCTURNE 由一位製作人（主對話執行 `/produce`）帶 7 個角色 subagent 開發。這份文件定義階段、每個功能的流程、交接格式和 GitHub 慣例。各角色的細節寫在 `.claude/agents/<角色>.md`。

## 角色與檔案所有權

| 角色 | 定義 | 模型 | 負責檔案 |
| --- | --- | --- | --- |
| 製作人 Producer | `.claude/skills/produce/SKILL.md`（主對話） | 主對話 | Issue、分支、PR、合併、`docs/process.md` |
| 遊戲設計 Game Designer | `game-designer` | Opus | 提案 Issue、`docs/game-design.md`、`core.js` 中的 `STAGES`／`RELICS` 數值 |
| 玩法程式 Gameplay Engineer | `gameplay-engineer` | Sonnet | `core.js`、`tests/core.test.js`；`game.js` 的輸入、主迴圈與 `handleEvent` 接線 |
| 技術美術 Technical Artist | `technical-artist` | Sonnet | `art.js`；`game.js` 的 `render`、粒子、劍光與畫面特效 |
| 音效設計 Audio Designer | `audio-designer` | Sonnet | `audio.js`（音效、配樂、震動 pattern） |
| UX/UI 設計 UX Designer | `ux-designer` | Sonnet | `index.html`、`style.css`；`game.js` 的 HUD、modal、觸控與無障礙 |
| QA 試玩 QA Playtester | `qa-playtester` | Haiku | `tests/`（迴歸測試、`browser-smoke.mjs`），試玩報告 |
| 程式審查 Code Reviewer | `code-reviewer` | Opus | 不改檔，只在 PR 留審查結論 |

`game.js` 由三個角色共用，所以同一分支上只能**依序**派工，不能並行。並行只限於檔案完全不重疊的工作，例如 `art.js` 與 `audio.js`。

## 里程碑

| 里程碑 | 目的 | 完成條件 |
| --- | --- | --- |
| **M0 Prototype**（目前） | 找出最好玩的核心 | 試過至少 3 個玩法提案；每個都有試玩結論（保留／調整／丟棄）；寫下核心樂趣一句話與 3 條設計支柱，存進 `docs/game-design.md` |
| M1 Vertical Slice | 一段達到上線品質的完整體驗 | 核心機制定案；一關的美術、音效、UX 達到最終品質；手機與桌面都能完整玩一輪；沒有已知的 P1 bug |
| M2 Alpha | 功能齊全 | 所有規劃的系統都已實作，不必精緻；內容可以是暫代的；整輪不會卡關或當機 |
| M3 Beta | 內容齊全、開始打磨 | 不再加新功能；只做平衡、修 bug、效能與手感；在真機上試玩過 |
| M4 Release | 正式發佈 | 沒有已知的 P1／P2 bug；README 與 `docs/game-design.md` 和實際遊戲一致；建立版本標籤 |

切換里程碑由製作人依完成條件判斷，不需要使用者核准，但要在對應的 GitHub milestone 留言說明理由。如果切換會改動核心設計，就照下方「核准點」處理。

## 功能流程（每個 Issue 一輪）

```
1 提案 ──► 2 核准 ──► 3 開工 ──► 4 實作 ──► 5 表現 ──► 6 驗證 ──► 7 審查 ──► 8 合併
 designer   使用者     producer   engineer   artist/     qa        reviewer   producer
                                             audio/ux
```

1. **提案**：Game Designer 開一個 `type:proposal` Issue，套用提案範本，標上 `status:needs-approval`。動到核心設計的提案另外標 `core-design`（見下方定義）。
2. **核准（使用者）**：使用者把標籤改成 `status:approved` 才能開工；如果是留言要求修改，Designer 修改提案後重新送審。製作人用 `gh` 讀取標籤狀態，**沒有 `status:approved` 一律不開工**。
3. **開工**：製作人把標籤改成 `status:in-progress`，從 `main` 開分支 `feat/<issue號>-<短名>`（bug 用 `fix/`，數值調整用 `tune/`，雜項用 `chore/`）。
4. **實作**：Gameplay Engineer 寫規則、`emit` 事件、補 core 測試，`npm test` 必須通過。
5. **表現**：依提案的「回饋需求」，依序派給 Technical Artist、Audio Designer、UX Designer。沒有需求的角色就跳過。
6. **驗證**：QA Playtester 跑 `npm test`，在瀏覽器依提案的試玩情境測試，回報 bug 與手感問題。有問題就退回第 4 或第 5 步。
7. **審查**：製作人開 PR（內文寫 `Closes #<n>`），標籤改成 `status:in-review`，再派 Code Reviewer。審查結論是 `APPROVED` 或 `CHANGES REQUESTED`，以 PR 留言呈現。
8. **合併**：CI 綠燈且最新審查結論是 `APPROVED`，製作人就 squash merge 並刪除分支。合併到 `main` 等於部署。

**Actions 無法執行時**：如果 CI job 沒有啟動就失敗（例如 GitHub 回報帳單或支出上限問題，job 沒有任何步驟），可以改用本機測試代替。製作人在 PR 的最新 commit 上跑 `npm test`，把結果貼成 PR 留言（`本機 CI 替代：<commit SHA> npm test N/N 通過`），然後就可以合併。這時 Pages 不會部署，合併後要在 PR 留言註明「未部署」。如果 CI 有實際跑測試而且失敗，就不能用這個替代方式。

**退回上限**：同一個 Issue 在第 6、7 步合計被退回 2 次之後，第 3 次不再自行修正。製作人改標 `status:blocked`，在 Issue 寫明卡在哪裡，並請使用者決定。

**數值調整與 bug**：`type:tuning` 和 `type:bug` 不需要提案和核准，直接從第 3 步開始，但仍要經過第 6 到第 8 步。除非這個改動動到核心設計。

## 核准點

只有兩種情況要停下來等使用者：

- 每個 `type:proposal` 開工前。
- 任何標了 `core-design` 的工作。不論類型，都要使用者核准才能做。

`core-design` 的定義：改變死亡重置、跨輪成長、一輪的關卡數、操作方式或按鍵配置、遊戲的勝負條件、目標平台，或要新增外部依賴與建置步驟。

## 交接格式

每個 subagent 結束時，回報的最後一段一定是這個區塊，製作人靠它決定下一步：

```
## Handoff
- 角色: <角色名>
- Issue: #<n>
- 結果: done | needs-changes | blocked
- 改動檔案: <路徑清單，沒有就寫「無」>
- 驗證: <跑了什麼、結果，例如「npm test 12/12 通過」>
- 交給: <下一個角色或 producer>
- 備註: <下一個角色必須知道的事，例如新事件名稱、新的 player 欄位、要調的數值>
```

製作人把每份 Handoff 的重點貼到 Issue 留言，讓進度留在 GitHub 上，換對話也接得下去。

## Definition of Ready（可以開工）

- Issue 有清楚的玩家行為描述與試玩情境。
- 提案已標 `status:approved`，或屬於不需要提案的 `type:tuning`、`type:bug`。
- 已指派 milestone 與角色標籤。

## Definition of Done（可以合併）

- `npm test` 與 CI 通過（Actions 無法執行時，依第 8 步改用本機替代）；新規則有對應的 core 測試。
- QA 試玩報告沒有未解決的 P1 問題。
- Code Reviewer 的最新結論是 `APPROVED`。
- 玩家看得到的改動已經更新 `README.md`；規則或數值的改動已經更新 `docs/game-design.md`。
- 符合 `AGENTS.md` 的硬性規則。

## GitHub 慣例

由 `scripts/setup-github.sh` 建立，重複執行也安全。

| 種類 | 標籤 |
| --- | --- |
| 類型 | `type:proposal` `type:feature` `type:bug` `type:tuning` `type:chore` |
| 狀態 | `status:needs-approval` `status:approved` `status:in-progress` `status:in-review` `status:blocked` |
| 角色 | `role:design` `role:engineering` `role:art` `role:audio` `role:ux` `role:qa` |
| 其他 | `core-design` `P1` `P2` `P3` |

- 里程碑：`M0 Prototype`、`M1 Vertical Slice`、`M2 Alpha`、`M3 Beta`、`M4 Release`。
- 嚴重度：P1＝當機、卡關、資料遺失或核心玩不了；P2＝明顯錯誤但有辦法繞過；P3＝打磨類問題。
- Commit 與 PR 標題用英文祈使句，例如 `Add shield knight enemy`。內文可以用中文。
