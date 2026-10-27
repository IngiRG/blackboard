import { W, H, clamp, samples, drawSamples, progress, visibleSampleCount } from './engine.js';

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  return canvas;
}

// A single backing canvas per render target, not one full-HD bitmap per stroke.
// Forward playback paints each chalk sample exactly once. A backward seek or
// destructive edit reconstructs the image; normal frames never replay its past.
export class SceneRenderer {
  constructor(canvas = makeCanvas()) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.revision = -1;
    this.time = -Infinity;
    this.strokeIndex = 0;
    this.sampleIndex = 0;
  }

  render(target, strokes, revision, background, time, all = false) {
    if (this.revision !== revision || this.background !== background ||
        this.all !== all || (!all && time < this.time)) {
      this.context.fillStyle = background;
      this.context.fillRect(0, 0, W, H);
      this.strokeIndex = 0;
      this.sampleIndex = 0;
    }
    this.revision = revision;
    this.background = background;
    this.all = all;
    this.time = time;

    while (this.strokeIndex < strokes.length) {
      const stroke = strokes[this.strokeIndex];
      const fraction = all ? 1 : progress(stroke, time);
      const count = visibleSampleCount(stroke.samples, fraction);
      drawSamples(this.context, stroke, stroke.samples, this.sampleIndex, count);
      this.sampleIndex = count;
      // Do not advance early for a dot or zero-distance stroke.
      if (fraction < 1) break;
      this.strokeIndex++;
      this.sampleIndex = 0;
    }
    target.drawImage(this.canvas, 0, 0);
  }
}

// Smoothing only changes the last segment when points are appended. Cache the
// stable prefix and draw the moving endpoint separately, retaining the exact
// geometry and deterministic grain used by the final stroke and export.
export class LiveStrokeRenderer {
  constructor(canvas = makeCanvas()) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.stroke = null;
  }

  reset() {
    this.stroke = null;
  }

  render(target, stroke) {
    if (stroke !== this.stroke) {
      this.context.clearRect(0, 0, W, H);
      this.stroke = stroke;
      this.lastPoint = stroke.points[0];
      this.nextPoint = 1;
      this.sampleCount = 1;
      drawSamples(this.context, stroke, [this.lastPoint]);
    }
    const amount = 1 - clamp(stroke.smoothing, 0, .95) * .85;
    while (this.nextPoint < stroke.points.length - 1) {
      const raw = stroke.points[this.nextPoint++];
      const next = stroke.smoothing ? {
        x: this.lastPoint.x + (raw.x - this.lastPoint.x) * amount,
        y: this.lastPoint.y + (raw.y - this.lastPoint.y) * amount,
      } : raw;
      const segment = samples([this.lastPoint, next]).slice(1);
      drawSamples(this.context, stroke, segment, 0, segment.length, this.sampleCount);
      this.sampleCount += segment.length;
      this.lastPoint = next;
    }
    target.drawImage(this.canvas, 0, 0);
    if (stroke.points.length > 1) {
      const tail = samples([this.lastPoint, stroke.points.at(-1)]).slice(1);
      drawSamples(target, stroke, tail, 0, tail.length, this.sampleCount);
    }
  }
}

// High-rate pen events are all collected, but displayed at most once per frame.
export function frameScheduler(callback, request = requestAnimationFrame, cancel = cancelAnimationFrame) {
  let pending = null;
  return {
    schedule() {
      if (pending !== null) return;
      pending = request(() => { pending = null; callback(); });
    },
    cancel() {
      if (pending !== null) cancel(pending);
      pending = null;
    },
  };
}
