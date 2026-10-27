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
3. Switch to **Animate**. Play or scrub the timeline. Each stroke has a start and end in seconds; **Set start here / Set end here** use the current playhead. Reveals follow the original drawing order. Moving a stroke into a later stroke automatically shifts subsequent strokes forward, preserving their durations. Earlier starts are constrained to the preceding stroke's end. **Fit strokes to length** distributes them evenly across the timeline.
4. **Export video**, choose whether to include audio, then **Create video** and **Download video**. This version exports **WebM**, not MP4. Exports are full HD at a target 30 fps and run in real time. Keep the tab visible; hiding it cancels export. Long or complex drawings depend on your device's rendering capacity. Audio ends naturally if the picture sequence is longer.
5. **Save project** downloads a `.blackboard` JSON file containing the drawing, brush settings, timings, board color, and embedded audio. **Open project** restores it. Save before leaving: this version does not automatically persist unsaved projects.

Limits: one-hour projects, 100 MB audio imports, 150 MB project imports. Unsupported or corrupt files display an error without replacing the current project. Keyboard shortcuts: Space to play/pause, Ctrl/Cmd+Z to undo, Ctrl/Cmd+Shift+Z to redo, Ctrl/Cmd+S to save.

## Development and verification

```sh
npm test
npm run check
```

Tests cover arc-length reveal sampling, smoothing endpoints, ordered timing/ripple behavior, bounds, project validation, and static-server routing. Rendering regression tests compare incremental paint operations with full redraws, including texture, rewind, mode changes, edits, and live smoothing. Operation-count tests ensure completed strokes are not repainted and forward animation paints each sample only once, regardless of frame count. Optional browser integration checks:

```sh
npm install --no-save playwright
npx playwright install chromium
node tests/browser.mjs
```

The browser check exercises drawing, undo/redo, timing, playback, project round-tripping, and WebM generation with and without an imported WAV. Unit/server tests and syntax checks were run during implementation. The browser suite could not be executed in the authoring environment because a Chromium binary was unavailable and its download failed; browser rendering and encoded A/V synchronization still need confirmation on a real browser.

## Structure

- `src/engine.js`: deterministic chalk rendering, smoothing, arc-length sampling, timing constraints, project validation.
- `src/renderer.js`: bounded canvas caches, incremental live smoothing and animation, and frame-coalesced pointer rendering.
- `src/app.js`: pointer input, editor controls, Web Audio playback, waveform, project I/O, and MediaRecorder export.
- `src/style.css`: responsive studio layout.
- `server.mjs`: dependency-free local static server, serving only application assets.

Rendering uses a fixed 1920×1080 coordinate system. The same stroke renderer drives the editor and exported frames. AudioContext time is the common clock for preview and export. Textured strokes use deterministic grain so their texture stays stable across frames. Export uses an independent canvas and a Web Audio media destination; the include-audio setting determines whether an audio track is added.

## Rendering performance

Finished strokes are cached on a single full-HD backing canvas. Moving the pointer does not repaint previous strokes, and adding a stroke extends the cached drawing. Live drawing smooths only newly collected points, keeps the stable prefix, and redraws only the changing endpoint. Pointer events are collected at their original frequency but painted at most once per animation frame.

Preview and export each have an independent incremental renderer. Forward playback adds only newly revealed chalk samples; it does not repaint completed strokes or the already-visible part of the current stroke. Backward seeks, destructive edits, and background/mode changes rebuild the affected cache. The cache uses a fixed number of canvases rather than allocating one full-HD canvas per stroke. Drawing geometry, deterministic texture, project compatibility, audio timing, and export resolution are preserved. Actual frame rate still depends on your browser and hardware; automated operation-count tests are not a browser FPS benchmark.
