import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultAnimation,drawingTime,continuousDuration,validateAnimation,continuousStrokes} from '../src/timing.js';
import {validateProject,samples} from '../src/engine.js';
const drawing=(length=100)=>({points:[{x:0,y:0},{x:length,y:0}],samples:samples([{x:0,y:0},{x:length,y:0}]),
  color:'#ffffff',width:5,smoothing:0,texture:.65,start:5,end:7});
const config=()=>({...defaultAnimation(10),mode:'continuous',breaks:[{start:2,end:5},{start:8,end:10}]});

test('drawing clock holds through breaks and resumes from the same position',()=>{
  const breaks=config().breaks;
  for(const [wall,active] of [[0,0],[1,1],[2,2],[3,2],[5,2],[6,3],[8,5],[9,5],[10,5],[15,10]])
    assert.equal(drawingTime(wall,breaks),active,`at ${wall}s`);
  assert.equal(continuousDuration(config()),15);
});

test('initial and adjacent breaks do not skip or double-count drawing time',()=>{
  const breaks=[{start:0,end:2},{start:2,end:4}];
  for(const t of [0,1,2,3,4])assert.equal(drawingTime(t,breaks),0);
  assert.equal(drawingTime(5,breaks),1);
  assert.equal(drawingTime(-1,breaks),0);
});

test('continuous sequence distributes duration by distance without changing manual timings',()=>{
  const original=[drawing(100),{...drawing(300),start:8,end:12}];
  const serialized=JSON.stringify(original);
  const seq=continuousStrokes(original,8);
  assert.deepEqual(seq.map(s=>[s.start,s.end]),[[0,2],[2,8]]);
  assert.equal(seq[0].samples,original[0].samples);
  assert.equal(JSON.stringify(original),serialized);
  assert.deepEqual(continuousStrokes([],10),[]);
});

test('dots receive positive reveal time and the drawing finishes exactly at its duration',()=>{
  const seq=continuousStrokes([drawing(0),drawing(0),drawing(100)],3);
  for(const s of seq)assert.ok(s.end>s.start);
  assert.equal(seq.at(-1).end,3);
  assert.equal(seq[0].end,seq[1].start);
});

test('invalid or overlapping breaks and projects longer than an hour are rejected',()=>{
  const base=config();assert.equal(validateAnimation(base),base);
  for(const breaks of [[{start:2,end:2}],[{start:-1,end:2}], [{start:2,end:5},{start:4,end:6}],
    [{start:8,end:10},{start:2,end:5}], [{start:1,end:Infinity}], [null], [{start:0,end:3599}]])
    assert.throws(()=>validateAnimation({...base,breaks}));
  for(const drawDuration of [0,NaN,Infinity,3601])assert.throws(()=>validateAnimation({...base,drawDuration}));
  assert.throws(()=>validateAnimation({...base,mode:'unknown'}));
  assert.throws(()=>validateAnimation({...base,strokeDuration:NaN}));
});

test('removing breaks reduces total length, and late breaks remain visible on the timeline',()=>{
  assert.equal(continuousDuration({...config(),breaks:[]}),10);
  assert.equal(continuousDuration({...config(),breaks:[{start:20,end:22}]}),22);
});

test('version 2 roundtrip retains continuous mode, breaks, and original per-stroke duration',()=>{
  const {samples:_,...s}=drawing();
  const project={version:2,background:'#203631',duration:15,strokes:[s],audio:null,animation:config()};
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))),project);
  assert.throws(()=>validateProject({...project,animation:undefined}));
  assert.throws(()=>validateProject({...project,animation:{...config(),breaks:[{start:2,end:1}]}}));
});

test('older version 1 projects remain valid and default to per-stroke playback',()=>{
  const {samples:_,...s}=drawing();
  const old={version:1,background:'#203631',duration:20,strokes:[s],audio:null};
  assert.deepEqual(validateProject(old),old);
  assert.deepEqual(defaultAnimation(old.duration),{mode:'stroke',drawDuration:20,strokeDuration:20,breaks:[]});
});
