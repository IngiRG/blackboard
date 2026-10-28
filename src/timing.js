// Continuous playback uses drawing time rather than individual stroke timings.
// Breaks are absolute positions on the audio/video timeline; the audio clock
// keeps running while the drawing clock holds still.
export function defaultAnimation(duration = 10) {
  return {mode: 'stroke', drawDuration: duration, strokeDuration: duration, breaks: []};
}

export function drawingTime(time, breaks) {
  let paused = 0;
  for (const gap of breaks) {
    if (time <= gap.start) break;
    paused += Math.min(time, gap.end) - gap.start;
  }
  return Math.max(0, time - paused);
}

export function continuousDuration(animation) {
  return Math.max(1, animation.drawDuration + animation.breaks.reduce((n, gap) => n + gap.end - gap.start, 0),
    animation.breaks.at(-1)?.end || 0);
}

export function validateAnimation(animation) {
  if (!animation || !['stroke', 'continuous'].includes(animation.mode) ||
      !Number.isFinite(animation.drawDuration) || animation.drawDuration < .1 || animation.drawDuration > 3600 ||
      !Number.isFinite(animation.strokeDuration) || animation.strokeDuration < 1 || animation.strokeDuration > 3600 ||
      !Array.isArray(animation.breaks) || animation.breaks.length > 1000) {
    throw Error('Invalid animation settings.');
  }
  let end = 0;
  for (const gap of animation.breaks) {
    if (!gap || !Number.isFinite(gap.start) || !Number.isFinite(gap.end) || gap.start < end ||
        gap.end - gap.start < .05 - 1e-9 || gap.end > 3600) {
      throw Error('Breaks need a resume time after their start and must not overlap.');
    }
    end = gap.end;
  }
  if (continuousDuration(animation) > 3600) throw Error('The animation cannot exceed one hour.');
  return animation;
}

// Longer strokes get proportionally more drawing time. A dot has a small
// nonzero weight so it remains visible, even in drawings composed only of dots.
// Original manual timings and sample arrays are left untouched.
export function continuousStrokes(strokes, duration) {
  const weights = strokes.map(s => Math.max(1, s.samples.at(-1)?.distance || 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let distance = 0;
  return strokes.map((stroke, i) => {
    const start = duration * distance / total;
    distance += weights[i];
    return {...stroke, start, end: i === strokes.length - 1 ? duration : duration * distance / total};
  });
}
