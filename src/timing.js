// Timing points pair a drawing position (0..1) with an audio time in seconds.
// Equal positions at different times create a hold; all other intervals reveal
// continuously. Editing cursors are UI state and never change this saved map.
export function defaultAnimation(duration = 10) {
  return {mode: 'stroke', strokeDuration: duration, points: [{time: 0, position: 0}, {time: duration, position: 1}]};
}
export function continuousDuration(animation) { return Math.max(1, animation.points.at(-1).time); }
export function validateAnimation(animation) {
  if (!animation || !['stroke', 'continuous'].includes(animation.mode) ||
      !Number.isFinite(animation.strokeDuration) || animation.strokeDuration < 1 || animation.strokeDuration > 3600 ||
      !Array.isArray(animation.points) || animation.points.length < 2 || animation.points.length > 2002 ||
      animation.points[0]?.position !== 0 || animation.points.at(-1)?.position !== 1) {
    throw Error('Timing needs a start at 0% and an end at 100%.');
  }
  let previous = null;
  for (const point of animation.points) {
    if (!point || !Number.isFinite(point.time) || !Number.isFinite(point.position) ||
        point.time < 0 || point.time > 3600 || point.position < 0 || point.position > 1) {
      throw Error('Use audio times from 0 to 3600 seconds and drawing positions from 0% to 100%.');
    }
    if (previous && (point.time - previous.time < .01 - 1e-9 || point.position < previous.position)) {
      throw Error('Timing points must move forward in audio and cannot move backward through the drawing.');
    }
    previous = point;
  }
  return animation;
}
export function continuousProgress(time, animation) {
  const points = animation.points;
  if (time <= points[0].time) return 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (time <= b.time) return a.position + (b.position - a.position) * (time - a.time) / (b.time - a.time);
  }
  return 1;
}
// Linking at an existing audio time replaces that pair. Otherwise it creates
// another point, including repeated 0% or 100% values for initial/final holds.
export function linkPoint(animation, time, position) {
  const points = animation.points.map(p => ({...p}));
  const index = points.findIndex(p => Math.abs(p.time - time) < 1e-9);
  if (index >= 0) points[index] = {time, position};
  else points.push({time, position});
  points.sort((a,b) => a.time - b.time);
  return validateAnimation({...animation, points});
}
export function setEndpoint(animation, which, time) {
  const points = animation.points.map(p => ({...p}));
  const index = which === 'start' ? 0 : points.length - 1;
  points[index].time = time;
  return validateAnimation({...animation, points});
}
export function migrateAnimation(old, duration = 10) {
  if (!old) return defaultAnimation(duration);
  if ('points' in old) return validateAnimation(old);
  const legacy = migrateLegacyAnimation(old, duration);
  const pairs = [{time:legacy.start,position:0}];
  for (const gap of legacy.breaks) pairs.push({time:gap.start,position:gap.position},{time:gap.end,position:gap.position});
  pairs.push({time:legacy.end,position:1});
  const points = [];
  for (const p of pairs) {
    if (points.at(-1)?.time === p.time) {
      if (points.at(-1).position !== p.position) throw Error('Conflicting legacy timing points.');
    } else points.push(p);
  }
  return validateAnimation({mode:legacy.mode,strokeDuration:legacy.strokeDuration,points});
}

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

// Legacy version 2/3 readers; never used for new edits.
function activeDrawingDuration(animation) {
  return animation.end-animation.start-animation.breaks.reduce((n,g)=>n+g.end-g.start,0);
}
function validateWindowAnimation(animation) {
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

function migrateLegacyAnimation(old, duration = 10) {
  if (!old) return defaultAnimation(duration);
  if ('start' in old) return validateWindowAnimation(old);
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
  return validateWindowAnimation({mode:old.mode,start:0,end,strokeDuration:old.strokeDuration,breaks});
}
