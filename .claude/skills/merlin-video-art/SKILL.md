---
name: merlin-video-art
description: Generate NOCTURNE character animation and sound effects as a short chroma-key video on Merlin (getmerlin.in) through Claude in Chrome, then convert it into a sprite sheet and audio files with tools/video-to-assets.mjs. Use for "animate the hero", "new attack animation", "generate a sound effect", "Merlin video" or any animation that frame-by-frame images got wrong.
---

# Merlin video art

Why video: one image per frame loses continuity and the wrong limb moves. A video carries the motion, and its soundtrack matches the action. Merlin credits are limited, so every generation is a decision: work out what is needed and what can be reused first.

Needs a local session with Claude in Chrome connected and Merlin signed in. Cloud sessions cannot use this skill. Never upload commercial game art.

## Budget

| Setting | Use | Credits |
| --- | --- | --- |
| Seedance 2.0 Mini, 5 s, 1:1, 480p, audio on | Default | 200 |
| Same at 720p | Never: the sprite is about 65 px tall, a 480p clip has about 7 source pixels per sprite pixel | 400 |
| FLUX 3 720p | Only for a sound Seedance failed at; native audio is cleaner | about 880 |

1. Before anything else, open the account menu (top right) and note the Monthly percentage, then check it after the first clip. Measured on a Pro plan: one clip costs about 1.1% of Monthly and 2.8% of Daily (9 clips and 3 images moved Monthly from 22% to 32% and Daily from 6% to 31%), so the Daily limit is the closer one. The chat shows about 215 to 240 credits per clip, above the card's 200.
2. Set a clip cap with the user for the task and report credits spent against it.
3. Reuse first: old clips in `docs/art-bible/raw/` and the user's Merlin history cost nothing to mine.
4. Chain several actions into one clip. Five seconds fits four or five moves, and the game plays each for only 0.2 to 0.5 s.
5. Retry at most once per clip. If two tries fail, change the approach or ask.

## Generate

1. Open `https://www.getmerlin.in/zh-Hant/chat` in a new tab. Start a new chat for each clip so old context cannot leak in.
2. Click the sparkle-image button beside the paperclip, switch the popup to **Video**, choose **Seedance 2.0 Mini**.
3. Upload the first frame with `file_upload` on the page's hidden file input: `docs/art-bible/anchors/hero-video-first-frame.png`. Its wide flat margin is what keeps the sword and cape inside the video; a tightly cropped reference gets cut off however the prompt is worded. For a new character, make the first frame with the same margin: the body at most 45% of the frame height, feet on the same ground line, and room on both sides and above for the longest reach of its weapon, plus the distance a lunge or charge travels. Every lunge, backswing and overhead pose of the hero runs into the edge somewhere when this is short.
4. Check the attachment thumbnail is in the composer, or the clip ignores the first frame. Type any short prompt and send: the real prompt goes into the card. Sending costs nothing yet. A later clip can stay in the same chat, with the first frame uploaded again.
5. A **"Before I start Generating Video..."** card appears after a few seconds, always reset to 16:9, 720p, 400 credits, with audio off. It has a countdown of about 70 s. Before it ends, change the chips to **1:1**, **480p**, **Generate Audio on**, confirm the card reads **200**, then click **Generate Video** once. The chips open popups at fixed offsets, so batch these clicks and screenshot the result. Never let the countdown run out unchecked. If a second card appears after clicking, the first one was discarded: set the chips again.
6. Merlin rewrites the prompt on that card and always drops the action timing. Click the card's prompt box, select all, and type the full prompt (template below). The card must show the reference note; if it does not, the image did not attach, so discard it.
7. A clip takes a few minutes. Read the URL with `[...document.querySelectorAll('video')].map(v => v.currentSrc)`; the file is public on `storage.googleapis.com`. Fetch it with curl (no browser download) into `docs/art-bible/raw/<name>.mp4`.
8. Record the credits, the prompt and the result in `docs/art-log.md`.

Learned on #83: several clips can generate at once, one chat per browser tab, but keep each chat open until its video appears. A chat that was navigated away from while generating and then fetched again only ever offers a signed vendor URL, which the browser tool will not hand over (still true two days later). A chat that stayed open and ended in "network error" is fine: reload it once the clip is done and the video has its `storage.googleapis.com` URL. The placeholder message must ask for a video ("Generate a 5 second video that animates this ..."); one that mentions a sprite sheet can make Merlin draw an image instead and spend credits. When Merlin writes a line of text above the card, the card and its chips sit about 16 px lower: always check that the card reads 1:1, 480p, audio on and 200 before clicking Generate.

## Prompt template

```text
Use the attached image as the exact first frame and animate it for a 2D side-scrolling game sprite sheet. 480p, 1:1, 5 seconds. Locked static camera: no zoom, no pan, no cuts. The character stays centered in place with feet on the same ground line, full body, cape and sword always inside the frame with wide margins. Keep the exact character design, retro pixel-art look, side view facing right and flat solid #FF00FF background the whole time, with no shadow, dust, sparks, slash trails or any added effects. Action, brisk and snappy, each move returning to the same guard stance: {ACTIONS WITH SECOND MARKS}. Audio: only {SOUNDS}, no music, no voice.
```

Name the second each move lands on, so frames and sounds can be located. Describe every swing as a path relative to the body facing right, from where it starts to where it ends ("chop from overhead down to behind the left foot", "backhand from the low back up to overhead"); "swing" alone gives a weapon that only moves across. Ask for the wind-up and the end of each move to be held for a beat: held poses are the frames worth picking, and an enemy's tell needs a readable wind-up pose for 0.5 to 1 s. Keep light reactions (a flinch) apart from heavy ones (a knockdown). For effects without the hero (a spell burst), drop the character wording and ask for a black background.

## Convert

1. Look at the clip before picking frames, with a contact sheet at 6 fps (ffmpeg runs in WSL on this machine; `tools/video-to-assets.mjs` finds it by itself):

   ```bash
   ffmpeg -i clip.mp4 -vf "fps=6,scale=200:-1:flags=neighbor,tile=6x5" -frames:v 1 sheet.png
   ```

2. Measure sound: `ffmpeg -i clip.mp4 -af silencedetect=noise=-35dB:d=0.08 -f null -` lists where sounds begin and end.
3. Add the clip and each animation to `tools/hero-clips.json`:
   - `clips.<id>`: `file`, frame `size`, `heroHeight` (head to toe in source pixels) and `feet` (`[x, y]` of the ground point under the body). Clips made from the same first frame share these numbers, which is what keeps scale and position equal across animations.
   - `anims.<name>`: `clip`, `fps`, and `times` (seconds of each frame; `["<clip>", seconds]` takes one frame from another clip that shares the same numbers) or `loop: true` with `from`, `to`, `frames`, which searches that range for the two frames that close best. `strike` on an attack is how many frames play during the swing, `windup` how many of those open it during the weapon's wind-up; the rest are its follow-through. `dx`, `dy`, `scale` correct position, per frame if given as an array: an airborne pose needs a negative `dy` so its feet are not drawn at the top of the jump. `clear: [x0, y0, x1, y1]` masks out a box of source pixels, for dust.
   - `sfx.<name>`: `clip`, `from`, `to`. The name replaces the sound of that name in `audio.js`.
4. Run `node tools/video-to-assets.mjs tools/hero-clips.json`. It writes `assets/hero.png`, `assets/hero-sheet.js` and `assets/sfx-<name>.m4a`.
5. The tool prints `WARNING ... cut by the video's <side> edge` for a picked frame whose art runs into the top, left or right edge (rows with `clear` or `minX` are skipped). What the video cut off cannot be restored: pick another frame, from another clip of the same character if needed (`["<clip>", seconds]`), and reshoot only when no clip has the pose. Never ship a warned frame.
6. Review in `tools/anim-review.html`: pick the weapon, tick the scenarios, and watch them loop with the real physics. Then check the running game.

A new weapon needs a first frame first: in a Merlin chat with GPT Image 2, attach `hero-video-first-frame.png` and ask to replace only the weapon, keeping size, position and background (about 88 credits). Give it its own `tools/hero-<weapon>-clips.json`, build it, and add the sheet to `assets/hero-sheets.js`. Name its sounds `swing_<weapon>` so they win over `swing` while it is in hand.

Code effects finish the look: trails, slam rings, dust and flashes are drawn in Canvas along the sprite's own path (the blade's start and end angles), never baked into the video.

Frame counts come from the game: an attack lasts 0.24 s, a dash 0.18 s. Three or four frames are enough for those; pick the wind-up, the extreme and the follow-through, not evenly spaced frames, when the action is short.

## Other characters

A boss or enemy gets its own first frame (made from the art bible anchors, approved by the user), its own `tools/<name>-clips.json` and sheet, and a pose function in `art.js` that maps its state (`tell`, `warn.kind`, `recover`, stun, phase) to a row, as `heroPose` does for the hero. Plan its clips before spending: list every move and reaction the game draws, group them into 5 s clips of four or five moves, and get the clip cap approved. Replacing code-drawn enemies needs an approved art conversion proposal; the warning shapes drawn over them stay in code.
