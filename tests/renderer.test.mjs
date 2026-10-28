import {test} from 'node:test';
import assert from 'node:assert/strict';
import {drawStroke, samples, smoothPoints, progress, visibleSampleCount} from '../src/engine.js';
import {SceneRenderer, LiveStrokeRenderer, frameScheduler} from '../src/renderer.js';

// Record actual paint operations (including alpha, overlap order and grain)
// rather than mocking the renderer. Opaque image copies replace the destination;
// transparent live layers compose over it just as the browser canvas does.
function canvas(record = true) {
  const c = {opaque:false, operations:[], fills:0, clears:0, copies:0};
  c.getContext = () => ctx;
  const ctx = {
    fillStyle:'', globalAlpha:1,
    beginPath() {},
    arc(...args) { this.arcArgs = args; },
    fill() { c.fills++; if (record) c.operations.push([this.fillStyle, this.globalAlpha, ...this.arcArgs]); },
    fillRect() { c.opaque=true; c.clears++; c.operations=[['background',this.fillStyle]]; },
    clearRect() { c.opaque=false; c.clears++; c.operations=[]; },
    drawImage(source) {
      c.copies++;
      if (record) c.operations = source.opaque ? source.operations.slice() : c.operations.concat(source.operations);
      c.opaque ||= source.opaque;
    },
  };
  return c;
}
function stroke(index=0, texture=.65, smoothing=.55) {
  const s = {points:[{x:20,y:30},{x:30,y:45},{x:60,y:38},{x:75,y:70}],
    color:index%2?'#cc9922':'#ffffff',width:5,texture,smoothing,start:index*2,end:index*2+1};
  s.samples=samples(smoothPoints(s.points,s.smoothing));
  return s;
}
function full(strokes,time,all=false,background='#203631') {
  const result=canvas(),ctx=result.getContext();ctx.fillStyle=background;ctx.fillRect();
  for(const s of strokes)drawStroke(ctx,s,all?1:progress(s,time));
  return result.operations;
}

test('incremental playback exactly matches full rendering, including gaps, dots and rewind',()=>{
  const ss=[stroke(),stroke(1),{...stroke(2),points:[{x:7,y:8}],samples:[{x:7,y:8,distance:0}]}];
  const backing=canvas(),renderer=new SceneRenderer(backing),target=canvas();
  for(const t of [0,.001,.2,.7,1,1.5,2,2.3,3,4,4.1,5,2.5,0,5]) {
    renderer.render(target.getContext(),ss,0,'#203631',t);
    assert.deepEqual(target.operations,full(ss,t),`frame ${t}`);
  }
});

test('mode, background, timing and destructive edits invalidate the scene cache',()=>{
  let ss=[stroke(),stroke(1)];const renderer=new SceneRenderer(canvas()),target=canvas();
  let revision=0;
  const check=(t,all=false,bg='#203631')=>{
    renderer.render(target.getContext(),ss,revision,bg,t,all);
    assert.deepEqual(target.operations,full(ss,t,all,bg));
  };
  check(0,true);check(.4);check(2,true);check(2,true,'#001122');
  ss[0].end=2;revision++;check(1);ss.pop();revision++;check(1,true);
  ss=[];revision++;check(0,true);ss=[stroke(1)];revision++;check(2.5);
});

test('drawing and append-only commits never repaint completed strokes',()=>{
  const backing=canvas(false),renderer=new SceneRenderer(backing),target=canvas(false);
  const ss=Array.from({length:30},(_,i)=>stroke(i));
  renderer.render(target.getContext(),ss,0,'#203631',0,true);
  const initial=backing.fills;
  for(let frame=0;frame<120;frame++)renderer.render(target.getContext(),ss,0,'#203631',0,true);
  assert.equal(backing.fills,initial,'existing marks must not be rasterized on pointer moves');
  const next=stroke(30);ss.push(next);renderer.render(target.getContext(),ss,0,'#203631',0,true);
  assert.equal(backing.fills-initial,next.samples.length*5);
  assert.equal(backing.clears,1);
});

test('forward animation paints each sample once across hundreds of frames',()=>{
  const backing=canvas(false),renderer=new SceneRenderer(backing),target=canvas(false);
  const ss=Array.from({length:30},(_,i)=>stroke(i));
  for(let frame=0;frame<=600;frame++)renderer.render(target.getContext(),ss,0,'#203631',frame/10);
  assert.equal(backing.fills,ss.reduce((n,s)=>n+s.samples.length*5,0));
  assert.equal(backing.clears,1);
});

test('live smoothing and texture match final rendering as points arrive in batches',()=>{
  for(const smoothing of [0,.55,.95])for(const texture of [0,.65,1]){
    const backing=canvas(),renderer=new LiveStrokeRenderer(backing);
    const s={...stroke(0,texture,smoothing),points:[]};delete s.samples;
    const points=[{x:10,y:10},{x:10,y:10},{x:25,y:40},{x:42,y:5},{x:90,y:70},{x:100,y:80}];
    for(const batch of [[points[0]],points.slice(1,3),points.slice(3)]){
      s.points.push(...batch);const target=canvas();target.getContext().fillStyle='#203631';target.getContext().fillRect();
      renderer.render(target.getContext(),s);
      assert.deepEqual(target.operations,full([s],0,true),`smoothing ${smoothing}, texture ${texture}`);
      const count=backing.fills;
      const again=canvas();renderer.render(again.getContext(),s);
      assert.equal(backing.fills,count,'stable prefix must not be repainted');
    }
    renderer.reset();const next=stroke();const target=canvas();target.getContext().fillStyle='#203631';target.getContext().fillRect();
    renderer.render(target.getContext(),next);
    assert.deepEqual(target.operations,full([next],0,true));
  }
});

test('binary reveal boundary matches a linear reference including repeated distances',()=>{
  const pts=[0,0,1,1,4,10].map(distance=>({distance}));
  for(const f of [-1,0,.0001,.1,.4,.9,1,2]) {
    const expected=f<=0?0:pts.filter(p=>p.distance<=10*f).length;
    assert.equal(visibleSampleCount(pts,f),expected);
  }
});

test('pen bursts schedule one frame and cancelled frames cannot redraw stale input',()=>{
  let serial=0,calls=0;const pending=new Map();
  const scheduler=frameScheduler(()=>calls++,fn=>{pending.set(++serial,fn);return serial;},id=>pending.delete(id));
  for(let i=0;i<100;i++)scheduler.schedule();
  assert.equal(pending.size,1);const cb=pending.values().next().value;pending.clear();cb();assert.equal(calls,1);
  scheduler.schedule();assert.equal(pending.size,1);scheduler.cancel();assert.equal(pending.size,0);
  scheduler.schedule();assert.equal(pending.size,1);
});

test('continuous preview and export hold identical frames inside a stroke and resume without extra paint',async()=>{
  const {continuousStrokes,continuousProgress,defaultAnimation}=await import('../src/timing.js');
  const ss=continuousStrokes([stroke(),stroke(1)]),animation={...defaultAnimation(7),start:0,end:7,breaks:[{start:1,end:3,position:.25},{start:5,end:6,position:.75}]};
  const previewBacking=canvas(),exportBacking=canvas();
  const preview=new SceneRenderer(previewBacking),video=new SceneRenderer(exportBacking);
  const target=canvas(),exportTarget=canvas();
  let hold;
  for(const wall of [0,.5,1,1.5,2,3,3.5,4,5,5.5,6,7]){
    const active=continuousProgress(wall,animation);
    preview.render(target.getContext(),ss,0,'#203631',active);
    video.render(exportTarget.getContext(),ss,0,'#203631',active);
    assert.deepEqual(target.operations,full(ss,active));
    assert.deepEqual(exportTarget.operations,target.operations);
    if(wall===1)hold={operations:target.operations.slice(),fills:previewBacking.fills};
    if(wall>1&&wall<=3){assert.deepEqual(target.operations,hold.operations);assert.equal(previewBacking.fills,hold.fills);}
  }
  assert.deepEqual(target.operations,full(ss,1));
  // Backward seeking into a break reconstructs precisely the held image.
  preview.render(target.getContext(),ss,0,'#203631',continuousProgress(2,animation));
  assert.deepEqual(target.operations,hold.operations);
});
