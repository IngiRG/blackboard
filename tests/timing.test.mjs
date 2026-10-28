import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultAnimation,continuousProgress,activeDrawingDuration,continuousDuration,validateAnimation,continuousStrokes,addBreakAt,migrateAnimation} from '../src/timing.js';
import {validateProject,samples} from '../src/engine.js';
const drawing=(length=100)=>({points:[{x:0,y:0},{x:length,y:0}],samples:samples([{x:0,y:0},{x:length,y:0}]),
  color:'#ffffff',width:5,smoothing:0,texture:.65,start:5,end:7});
const config=()=>({...defaultAnimation(20),mode:'continuous',start:2,end:12,breaks:[{start:5,end:8,position:.5}]});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('fixed window starts blank, holds at its anchor and finishes exactly at its end',()=>{
  const a=config();validateAnimation(a);
  for(const [t,p] of [[0,0],[2,0],[3.5,.25],[5,.5],[6,.5],[8,.5],[10,.75],[12,1],[15,1]])close(continuousProgress(t,a),p);
  assert.equal(continuousDuration(a),12);
  assert.equal(activeDrawingDuration(a),7);
});

test('adding and extending a break preserves the held picture and fixed endpoints',()=>{
  const base={...defaultAnimation(20),mode:'continuous',start:2,end:12};
  const original=JSON.stringify(base),a=addBreakAt(base,5);
  close(a.breaks[0].position,.3);
  const longer=validateAnimation({...a,breaks:[{...a.breaks[0],end:9}]});
  for(const current of [a,longer]){
    assert.equal(current.start,2);assert.equal(current.end,12);
    close(continuousProgress(5,current),.3);close(continuousProgress(current.breaks[0].end,current),.3);
    close(continuousProgress(12,current),1);
  }
  assert.ok(continuousProgress(10,longer)<continuousProgress(10,a));
  assert.equal(JSON.stringify(base),original);
});

test('multiple breaks preserve earlier anchors when another break is inserted',()=>{
  let a=config();a=addBreakAt(a,10);
  close(a.breaks[1].position,.75);
  a=validateAnimation({...a,breaks:[a.breaks[0],{...a.breaks[1],end:11.5}]});
  for(const [t,p] of [[5,.5],[8,.5],[10,.75],[11.5,.75],[12,1]])close(continuousProgress(t,a),p);
});

test('a square finishes before the break and the circle starts after it',()=>{
  const strokes=continuousStrokes(Array.from({length:5},()=>drawing(100)));
  const a={...config(),breaks:[{start:5,end:8,position:strokes[3].end}]};
  validateAnimation(a);
  close(continuousProgress(5,a),strokes[3].end);
  close(continuousProgress(7,a),strokes[4].start);
  assert.ok(continuousProgress(8.1,a)>strokes[4].start);
  close(continuousProgress(12,a),strokes[4].end);
});

test('moving endpoints changes pace without moving anchored break times or pictures',()=>{
  const a=validateAnimation({...config(),start:1,end:15});
  assert.deepEqual(a.breaks,config().breaks);
  close(continuousProgress(3,a),.25);close(continuousProgress(11.5,a),.75);close(continuousProgress(15,a),1);
});

test('initial and adjacent breaks with equal positions are valid and do not jump',()=>{
  const a=validateAnimation({...defaultAnimation(10),breaks:[{start:0,end:1,position:0},{start:1,end:2,position:0}]});
  for(const t of [0,.5,1,1.5,2])close(continuousProgress(t,a),0);
  close(continuousProgress(6,a),.5);
});

test('continuous coordinates preserve manual timings and give dots nonzero duration',()=>{
  const original=[drawing(100),{...drawing(300),start:8,end:12}],serialized=JSON.stringify(original);
  const seq=continuousStrokes(original);
  assert.deepEqual(seq.map(s=>[s.start,s.end]),[[0,.25],[.25,1]]);
  assert.equal(seq[0].samples,original[0].samples);assert.equal(JSON.stringify(original),serialized);
  assert.deepEqual(continuousStrokes([],1),[]);
  const dots=continuousStrokes([drawing(0),drawing(0),drawing(100)]);
  for(const s of dots)assert.ok(s.end>s.start);
  assert.equal(dots.at(-1).end,1);
});

test('reject invalid windows, overlaps, backwards anchors, and zero drawing time',()=>{
  const a=config();
  for(const patch of [{start:12},{start:-1},{end:3601},{end:NaN},{mode:'other'},{strokeDuration:NaN},
    {breaks:[{start:1,end:3,position:.2}]}, {breaks:[{start:3,end:13,position:.5}]},
    {breaks:[{start:3,end:3,position:.5}]}, {breaks:[{start:3,end:6,position:.5},{start:5,end:8,position:.6}]},
    {breaks:[{start:3,end:4,position:.8},{start:5,end:8,position:.6}]},
    {breaks:[{start:2,end:4,position:.2}]}, {breaks:[{start:5,end:12,position:.8}]},
    {breaks:[{start:2,end:12,position:0}]}, {breaks:[{start:5,end:8,position:Infinity}]}, {breaks:[null]}])
    assert.throws(()=>validateAnimation({...a,...patch}));
  for(const time of [-1,1,6,12,12.1])assert.throws(()=>addBreakAt(a,time));
});

test('deleting breaks redistributes drawing time inside the same window',()=>{
  const a={...config(),breaks:[]};
  assert.equal(continuousDuration(a),continuousDuration(config()));
  assert.equal(activeDrawingDuration(a),10);
  close(continuousProgress(7,a),.5);
});

test('version 3 project roundtrip retains endpoints, anchors and manual duration',()=>{
  const {samples:_,...s}=drawing();
  const project={version:3,background:'#203631',duration:20,strokes:[s],audio:null,animation:config()};
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))),project);
  assert.throws(()=>validateProject({...project,animation:undefined}));
  assert.throws(()=>validateProject({...project,animation:{...config(),end:4}}));
});

test('version 1 projects default to per-stroke; version 2 pauses migrate with the same reveal',()=>{
  const {samples:_,...s}=drawing();
  const old={version:1,background:'#203631',duration:20,strokes:[s],audio:null};
  assert.deepEqual(validateProject(old),old);assert.equal(migrateAnimation(undefined,20).mode,'stroke');
  const legacy={mode:'continuous',drawDuration:10,strokeDuration:20,breaks:[{start:2,end:5},{start:8,end:10}]};
  const project={...old,version:2,animation:legacy};assert.deepEqual(validateProject(project),project);
  const a=migrateAnimation(legacy);
  assert.equal(a.start,0);assert.equal(a.end,15);assert.equal(a.strokeDuration,20);
  for(const [t,p] of [[0,0],[1,.1],[2,.2],[4,.2],[5,.2],[6,.3],[8,.5],[10,.5],[15,1]])close(continuousProgress(t,a),p);
  assert.throws(()=>migrateAnimation({...legacy,breaks:[{start:4,end:2}]}));
});
