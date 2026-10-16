# AGENTS.md — NOCTURNE 血月之城

給接手開發的 agent。目標：**持續加入有趣、手感好的玩法**，同時不弄壞現有的五關循環。玩家向說明在 `README.md`，這裡只寫開發需要的事。

## 硬性規則

- 純靜態網站：原生 ES module、Canvas 2D、Web Audio。**不加框架、套件、建置步驟**；`npm test` 只用 Node 22 內建的 `node:test`。
- 所有資源用相對路徑（GitHub Pages 子路徑 `/nocturne-blood-moon-castle/`）。
- `core.js` 不碰 DOM、Canvas、Audio、`localStorage`，才能在 Node 裡測試。
- 遊戲邏輯的亂數一律用 `game.rand()`（有 seed，可重現），不要用 `Math.random()`；純視覺特效可以用 `Math.random()`。
- 美術與音效都由程式產生，不放外部或原作遊戲素材。`docs/references/` 是 AI 生成的原創概念圖，只用來對齊風格與配色方向，不放進遊戲，也不會被部署。概念圖的細節比遊戲的程式像素美術豐富得多，取的是氛圍和色調，不是解析度。
  - `library-mobile-ui.jpg`：書庫場景的層次（暖色木平台、冷綠背景），以及手機版的十字鍵與右側圓形技能按鈕配置。
  - `castle-rooftop-night.jpg`：城堡屋頂、夜雨、紫藍夜空與月亮，石磚的輪廓光加上火炬暖光。
  - `clock-tower-hud.jpg`：鐘塔大鐘面與石像鬼，左上角的頭像、HP／MP 條等 HUD 組成。
- 介面文字用繁體中文；英文只用在裝飾性副標（例如 `THE FORSAKEN GATE`）。
- 每次改動都要 `npm test` 通過。CI 測試失敗就不會部署。

## 架構（一條路徑）

```
input (game.js) → Game.update(dt, input) (core.js) → emit(event) → game.js 的 onEvent：音效／粒子／UI
                                                     ↘ game.js render() 呼叫 art.js 的 draw*
```

| 檔案 | 負責 | 改它的時機 |
| --- | --- | --- |
| `core.js` | 狀態機 `title/playing/paused/upgrade/dead/won`、物理、戰鬥、敵人 AI、`STAGES`、`RELICS` | 任何規則或數值 |
| `game.js` | 鍵盤／觸控輸入、事件轉成回饋（`onEvent` 的 `switch`）、modal UI、存檔、主迴圈、鏡頭 | 新事件的回饋、新 UI |
| `art.js` | `drawScene/drawHero/drawEnemy/drawPortal`，靜態場景有快取 | 新敵人或新場景外觀 |
| `audio.js` | `AudioSystem.play(name, intensity)`：合成音效＋震動 pattern | 新音效 |
| `index.html` / `style.css` | HUD、觸控按鈕、SVG icon（`#i-<name>`） | 新按鈕、新 icon |

邏輯和表現只透過事件溝通：core 呼叫 `this.emit('type', data)`，game.js 決定怎麼呈現。新增機制時沿用這個模式。

## 常見改法

- **新聖物**：在 `RELICS` 加一筆 `{ id, icon, name, type, text, apply }`。`icon` 必須是 `index.html` 裡已有的 `#i-<icon>` symbol。`apply` 直接改 `player` 的數值；要做新的效果類型，就在 `player` 加欄位並在 core 裡讀它。聖物可以重複抽到並疊加，數值要有上限（參考 `crit` 上限 0.8、`magicCost` 下限 15）。
- **新敵人**：`spawnEnemy`（血量、傷害、速度）→ `updateEnemy` 加分支（移動，以及設定 `tell` 預警）→ `enemyAttack`（命中判定）→ `art.js` 的 `drawEnemy` 分派加外觀 → `loadStage` 的類型 roll 決定出現關卡。攻擊一定要先有 `tell` 預警（頭上的 `!`），玩家才有反應空間。
- **新事件回饋**：core `emit` → game.js `onEvent` 加 `case` → 視需要 `audio.play` 加音效名稱。
- **新增或刪除關卡**：五關的數量寫死在好幾處：`core.js` 的 `index === 4`、`stage === 4`，`game.js` 的 `roman` 陣列和 `/ V` 字串，`art.js` 依 `stage` 選的場景主題，以及 `tests/core.test.js` 的 `STAGES.length === 5`。必須一起改。
- **新的根目錄檔案**：Pages workflow 只部署根目錄的 `*.html *.css *.js` 和 `.nojekyll`。其他類型的檔案（圖片、資料夾）要記得加進 `.github/workflows/pages.yml`。

## 測試

- `npm test` 跑 `tests/core.test.js`：用 `arena()` 清空場景，再用 `enemy()` 放目標，以 `advance()` 推進時間（1/120 秒一步）。新機制請照這個模式加一個測試，斷言**規則**（命中、冷卻、狀態轉換），不要斷言調手感用的確切數值。
- 瀏覽器測試（選用）：`python3 -m http.server 8080` 後跑 `node tests/browser-smoke.mjs`，需要 Playwright。可用 `PLAYWRIGHT_MODULE`、`CHROMIUM_PATH`、`BASE_URL` 指定路徑。
- 網址加 `?test` 會暴露 `window.__nocturne`（`game`、`settings`、`startRun`、`clearInput`），可以在瀏覽器 console 直接改狀態試玩，例如 `__nocturne.game.loadStage(4)` 直接跳到頭目關。
- 震動、音量和手感必須在真機上確認；自動測試只能驗證規則。

## 團隊與流程

開發依 `docs/process.md` 進行：里程碑 M0 Prototype（目前）→ M1 Vertical Slice → M2 Alpha → M3 Beta → M4 Release；每個 GitHub Issue 走「提案 → 核准 → 實作 → 表現 → QA → 審查 → 合併」。

- 主對話執行 `/produce` 擔任製作人，調度 `.claude/agents/` 的 7 個角色：`game-designer`、`gameplay-engineer`、`technical-artist`、`audio-designer`、`ux-designer`、`qa-playtester`、`code-reviewer`。
- 玩法提案（`type:proposal`）與 `core-design` 工作必須等使用者在 Issue 標上 `status:approved` 才能開工。
- 規則與數值的現況寫在 `docs/game-design.md`；改了規則或數值就要同步更新。
- 不是 Claude Code 的 agent（例如 Codex）也照同一份流程：依角色檔案的職責分工，最後輸出同樣格式的 Handoff。
