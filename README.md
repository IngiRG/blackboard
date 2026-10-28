# Blackboard Studio

A local-first blackboard animation editor. Draw a story, time its strokes to a voiceover, and export a 1920×1080 video. No account, API key, backend, or runtime dependencies.

## Use online with GitHub Pages

No installation or local server is needed. The entire editor, including audio processing and video export, runs in your browser.

One-time repository setup:

1. Open [Settings → Pages](https://github.com/IngiRG/blackboard/settings/pages).
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Choose **main** and **/(root)**, then click **Save**.
4. Once GitHub finishes deploying, open **https://ingirg.github.io/blackboard/**.

The repository includes `.nojekyll` for plain static publishing. Changes pushed to `main` will be published automatically after Pages is enabled. Audio and drawings remain on your device; save project files to keep your work. The online version has the same browser/export requirements described below.

## Run locally (optional)

Requires Node.js 20 or newer:

```sh
git clone https://github.com/IngiRG/blackboard.git
cd blackboard
npm start
```

Open **http://localhost:3000**. Use a recent desktop Chrome or Edge for video export. The static files can also be hosted on any HTTPS static host; `server.mjs` is a local development server.

## Workflow

1. **Add audio** to import a browser-supported audio file (such as WAV or MP3). The waveform helps locate moments in your narration. Audio remains on your device.
2. **Draw** with a mouse, stylus, or touch. Choose chalk color, stroke width, smoothing, texture, and board color. Brush settings apply to new strokes. Undo/redo and individual stroke deletion are available.
3. Switch to **Animate** and choose **Per stroke** or **Continuous** in the right sidebar. In **Per stroke**, play or scrub the timeline. Each stroke has a start and end in seconds; **Set start here / Set end here** use the current playhead. Reveals follow the original drawing order. Moving a stroke into a later stroke automatically shifts subsequent strokes forward, preserving their durations. Earlier starts are constrained to the preceding stroke's end. **Fit strokes to length** distributes them evenly across the timeline.
4. **Export video**, choose whether to include audio, then **Create video** and **Download video**. This version exports **WebM**, not MP4. Exports are full HD at a target 30 fps and run in real time. Keep the tab visible; hiding it cancels export. Long or complex drawings depend on your device's rendering capacity. Audio ends naturally if the picture sequence is longer.
5. **Save project** downloads a `.blackboard` JSON file containing the drawing, brush settings, timings, board color, and embedded audio. **Open project** restores it. Save before leaving: this version does not automatically persist unsaved projects.

Limits: one-hour projects, 100 MB audio imports, 150 MB project imports. Unsupported or corrupt files display an error without replacing the current project. Keyboard shortcuts: Space to play/pause, Ctrl/Cmd+Z to undo, Ctrl/Cmd+Shift+Z to redo, Ctrl/Cmd+S to save.

## Continuous animation: fixed start, fixed end, and breaks

Choose **Continuous** under **Animation mode**. Timing applies to the whole picture, in drawing order. Set the window first:

1. Scrub the audio to when drawing should begin and click **Set start here**.
2. Scrub to when the whole drawing should finish and click **Set end here**. You can also enter either time directly, including an end beyond the current audio.
3. Scrub to where drawing should pause and click **Add break at playhead**.
4. Set the break's **Pause at** and **Resume at** times, or use **Pause here** / **Resume here** at the playhead.
5. To pause at a shape boundary, choose **Hold drawing at → After stroke N**. For a square drawn with four strokes followed by a circle, choose **After stroke 4**. **Show paused picture** lets you check the result. Leaving **Captured point** selected holds the exact drawing position visible when the break was added, even if it is halfway through a stroke.

**The start and end remain fixed when you add, extend, or delete breaks.** Drawing speed adjusts separately between the start, anchored breaks, and end. Each break remembers its drawing position as well as its times, so extending a pause does not change the picture held during that pause. Audio keeps playing throughout. Before the start the board is blank; after the end the completed drawing remains visible if audio continues.

Example: set start to **2s**, end to **12s**, and a break at **5–8s** holding **After stroke 4**. The square draws from 2–5s, stays still from 5–8s, and the circle draws from 8–12s. The drawing still ends at 12s. Additional breaks work the same way.

Breaks must be inside the start/end window, cannot overlap, and must follow drawing order. Invalid edits show an error and leave the existing timing intact. Adjust or remove breaks before moving an endpoint past them. Changing shapes after timing may require reselecting break positions because positions are saved as proportions of the drawing path.

Preview, video export, and saved projects all use the same timing. Switching back to **Per stroke** restores your manual stroke timings and length. New saves use project format version 3. Version 1 projects still open in per-stroke mode; version 2 continuous projects are converted to fixed-window settings. Refresh the app before opening a new save in another browser.

## Development and verification

```sh
npm test
npm run check
```

Tests cover arc-length reveal sampling, smoothing endpoints, ordered timing/ripple behavior, bounds, project validation, and static-server routing. Rendering regression tests compare incremental paint operations with full redraws, including texture, rewind, mode changes, edits, and live smoothing. Continuous timing tests cover fixed endpoints, square-to-circle breaks, anchored mid-stroke holds/resume, changing pause duration, multiple breaks, drawing speed, mode preservation, project migration, and equivalent preview/export paint operations. Operation-count tests ensure completed strokes are not repainted and forward animation paints each sample only once, regardless of frame count. Optional browser integration checks:

```sh
npm install --no-save playwright
npx playwright install chromium
node tests/browser.mjs
```

The browser check exercises drawing, undo/redo, timing, playback, project round-tripping, and WebM generation with and without an imported WAV. Unit/server tests and syntax checks were run during implementation. The browser suite could not be executed in the authoring environment because a Chromium binary was unavailable and its download failed; browser rendering and encoded A/V synchronization still need confirmation on a real browser.

## Structure

- `src/engine.js`: deterministic chalk rendering, smoothing, arc-length sampling, timing constraints, project validation.
- `src/timing.js`: fixed-window drawing progress, anchored breaks, project migration, and distance-based reveal coordinates.
- `src/renderer.js`: bounded canvas caches, incremental live smoothing and animation, and frame-coalesced pointer rendering.
- `src/app.js`: pointer input, editor controls, Web Audio playback, waveform, project I/O, and MediaRecorder export.
- `src/style.css`: responsive studio layout.
- `server.mjs`: dependency-free local static server, serving only application assets.

Rendering uses a fixed 1920×1080 coordinate system. The same stroke renderer drives the editor and exported frames. AudioContext time is the common clock for preview and export. Textured strokes use deterministic grain so their texture stays stable across frames. Export uses an independent canvas and a Web Audio media destination; the include-audio setting determines whether an audio track is added.

## Rendering performance

Finished strokes are cached on a single full-HD backing canvas. Moving the pointer does not repaint previous strokes, and adding a stroke extends the cached drawing. Live drawing smooths only newly collected points, keeps the stable prefix, and redraws only the changing endpoint. Pointer events are collected at their original frequency but painted at most once per animation frame.

Preview and export each have an independent incremental renderer. Forward playback adds only newly revealed chalk samples; it does not repaint completed strokes or the already-visible part of the current stroke. Backward seeks, destructive edits, and background/mode changes rebuild the affected cache. The cache uses a fixed number of canvases rather than allocating one full-HD canvas per stroke. Drawing geometry, deterministic texture, project compatibility, audio timing, and export resolution are preserved. Actual frame rate still depends on your browser and hardware; automated operation-count tests are not a browser FPS benchmark.
