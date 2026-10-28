// Continuous animation is a fixed window on the audio/video timeline.
// Each break anchors BOTH a time interval and a position in the drawing.
// Moving its resume time changes the pace, never the held picture or final end.
export function defaultAnimation(duration = 10) {
  return {mode: 'stroke', start: 0, end: duration, strokeDuration: duration, breaks: []};
}

export function continuousDuration(animation) {
  return Math.max(1, animation.end);
}

export function activeDrawingDuration(animation) {
  return animation.end - animation.start - animation.breaks.reduce((n, gap) => n + gap.end - gap.start, 0);
}

const lerp = (time, start, end, from, to) => end === start ? to :
  from + (to - from) * Math.max(0, Math.min(1, (time - start) / (end - start)));

export function continuousProgress(time, animation) {
  if (time <= animation.start) return 0;
  if (time >= animation.end) return 1;
  let start = animation.start, position = 0;
  for (const gap of animation.breaks) {
    if (time < gap.start) return lerp(time, start, gap.start, position, gap.position);
    if (time < gap.end) return gap.position;
    start = gap.end;
    position = gap.position;
  }
  return lerp(time, start, animation.end, position, 1);
}

export function validateAnimation(animation) {
  if (!animation || !['stroke', 'continuous'].includes(animation.mode) ||
      !Number.isFinite(animation.start) || !Number.isFinite(animation.end) ||
      animation.start < 0 || animation.end > 3600 || animation.end - animation.start < .05 - 1e-9 ||
      !Number.isFinite(animation.strokeDuration) || animation.strokeDuration < 1 || animation.strokeDuration > 3600 ||
      !Array.isArray(animation.breaks) || animation.breaks.length > 1000) {
    throw Error('Set an animation end after its start, within one hour.');
  }
  let end = animation.start, position = 0;
  for (const gap of animation.breaks) {
    if (!gap || !Number.isFinite(gap.start) || !Number.isFinite(gap.end) || gap.start < end ||
        gap.end - gap.start < .05 - 1e-9 || gap.end > animation.end ||
        !Number.isFinite(gap.position) || gap.position < position || gap.position > 1) {
      throw Error('Keep breaks inside the start/end window, without overlaps, and in drawing order.');
    }
    if (gap.start === end && gap.position > position) {
      throw Error('Leave drawing time before this break, or choose the same drawing position.');
    }
    end = gap.end;
    position = gap.position;
  }
  if (end === animation.end && position < 1) throw Error('Leave time after the last break to finish drawing.');
  if (activeDrawingDuration(animation) < .05 - 1e-9) throw Error('Leave at least 0.05 seconds of drawing time between the breaks.');
  return animation;
}

export function addBreakAt(animation, time) {
  if (time < animation.start || time >= animation.end) throw Error('Place the playhead between the animation start and end.');
  if (animation.breaks.some(g => time >= g.start && time < g.end)) throw Error('There is already a break here. Edit its resume time.');
  const next = animation.breaks.find(g => g.start > time);
  const limit = next?.start ?? animation.end;
  const gap = {start: time, end: Math.min(time + 1, limit - .05), position: continuousProgress(time, animation)};
  return validateAnimation({...animation, breaks: [...animation.breaks, gap].sort((a,b) => a.start-b.start)});
}

// Distance-weighted coordinates: a normalized position of 1 is the entire image.
// Keep a small nonzero weight for dots, without changing original manual timing.
export function continuousStrokes(strokes, duration = 1) {
  const weights = strokes.map(s => Math.max(1, s.samples.at(-1)?.distance || 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let distance = 0;
  return strokes.map((stroke, i) => {
    const start = duration * distance / total;
    distance += weights[i];
    return {...stroke, start, end: i === strokes.length - 1 ? duration : duration * distance / total};
  });
}

// Version 2 used drawing duration + pauses. Convert it once to fixed endpoints
// and anchored drawing positions, preserving the old reveal and pause moments.
export function migrateAnimation(old, duration = 10) {
  if (!old) return defaultAnimation(duration);
  if ('start' in old) return validateAnimation(old);
  if (!['stroke','continuous'].includes(old.mode) || !Number.isFinite(old.drawDuration) ||
      old.drawDuration < .1 || old.drawDuration > 3600 || !Number.isFinite(old.strokeDuration) ||
      old.strokeDuration < 1 || old.strokeDuration > 3600 || !Array.isArray(old.breaks) || old.breaks.length > 1000) {
    throw Error('Invalid legacy animation settings.');
  }
  let paused = 0, previousEnd = 0;
  const breaks = old.breaks.map(gap => {
    if (!gap || !Number.isFinite(gap.start) || !Number.isFinite(gap.end) || gap.start < previousEnd ||
        gap.end-gap.start < .05-1e-9 || gap.end>3600) throw Error('Invalid legacy breaks.');
    const position = Math.max(0, Math.min(1, (gap.start-paused)/old.drawDuration));
    paused += gap.end-gap.start;
    previousEnd = gap.end;
    return {...gap, position};
  });
  const end = Math.max(1, old.drawDuration+paused, previousEnd);
  return validateAnimation({mode:old.mode,start:0,end,strokeDuration:old.strokeDuration,breaks});
}
