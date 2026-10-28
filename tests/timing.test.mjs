import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultAnimation,continuousProgress,continuousDuration,validateAnimation,continuousStrokes,linkPoint,setEndpoint,migrateAnimation} from '../src/timing.js';
import {validateProject,samples} from '../src/engine.js';
const drawing=(length=100)=>({points:[{x:0,y:0},{x:length,y:0}],samples:samples([{x:0,y:0},{x:length,y:0}]),color:'#ffffff',width:5,smoothing:0,texture:.65,start:5,end:7});
const config=()=>({...defaultAnimation(12),mode:'continuous',points:[{time:2,position:0},{time:5,position:.5},{time:8,position:.5},{time:12,position:1}]});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('timing pairs interpolate, hold equal positions and respect endpoints',()=>{
 const a=config();validateAnimation(a);
 for(const [t,p] of [[0,0],[2,0],[3.5,.25],[5,.5],[6,.5],[8,.5],[10,.75],[12,1],[15,1]])close(continuousProgress(t,a),p);
 assert.equal(continuousDuration(a),12);
});
test('linking chosen positions stores those positions independently of existing timing',()=>{
 const base={...defaultAnimation(12),mode:'continuous'},copy=JSON.stringify(base);
 const a=linkPoint(base,5,.7);close(continuousProgress(5,a),.7);
 const b=linkPoint(a,8,.7);close(continuousProgress(6,b),.7);close(continuousProgress(8,b),.7);close(continuousProgress(12,b),1);
 assert.equal(JSON.stringify(base),copy);assert.equal(a.points.length,3);assert.equal(b.points.length,4);
});
test('multiple intermediate positions adapt speed without moving other timing pairs',()=>{
 let a=linkPoint(defaultAnimation(20),4,.2);a=linkPoint(a,15,.9);a=linkPoint(a,10,.4);
 for(const [t,p] of [[4,.2],[10,.4],[15,.9],[20,1]])close(continuousProgress(t,a),p);
 close(continuousProgress(7,a),.3);
});
test('square and circle can be timed without editing individual strokes',()=>{
 const seq=continuousStrokes(Array.from({length:5},()=>drawing()));
 let a=setEndpoint(defaultAnimation(12),'start',2);
 a=linkPoint(a,5,seq[3].end);a=linkPoint(a,8,seq[3].end);
 close(continuousProgress(6,a),seq[4].start);assert.ok(continuousProgress(8.1,a)>seq[4].start);close(continuousProgress(12,a),1);
});
test('same audio time updates an existing pair and endpoint edits preserve other pairs',()=>{
 const a=linkPoint(config(),5,.4);assert.equal(a.points.length,4);close(continuousProgress(5,a),.4);
 const b=setEndpoint(a,'end',15);assert.deepEqual(b.points.slice(0,-1),a.points.slice(0,-1));close(continuousProgress(15,b),1);
 assert.throws(()=>setEndpoint(a,'start',6));assert.throws(()=>setEndpoint(a,'end',7));
});
test('reject reversed drawing, duplicate times, missing endpoints and nonfinite values',()=>{
 const a=config();
 for(const [t,p] of [[6,.2],[10,.1],[-1,0],[3601,1],[6,NaN],[NaN,.8],[6,1.2],[2,.4],[12,.9]])assert.throws(()=>linkPoint(a,t,p));
 for(const points of [[],[{time:0,position:0}], [{time:0,position:0},{time:0,position:1}], [{time:1,position:.2},{time:2,position:1}]])assert.throws(()=>validateAnimation({...a,points}));
});
test('repeated blank and complete positions create initial and final holds',()=>{
 let a=linkPoint(defaultAnimation(10),2,0);a=linkPoint(a,8,1);
 close(continuousProgress(1,a),0);close(continuousProgress(5,a),.5);close(continuousProgress(9,a),1);
});
test('continuous geometry preserves manual timings and gives dots positive weight',()=>{
 const ss=[drawing(100),{...drawing(300),start:8,end:12}],copy=JSON.stringify(ss),seq=continuousStrokes(ss);
 assert.deepEqual(seq.map(s=>[s.start,s.end]),[[0,.25],[.25,1]]);assert.equal(JSON.stringify(ss),copy);assert.equal(seq[0].samples,ss[0].samples);
 assert.deepEqual(continuousStrokes([]),[]);for(const s of continuousStrokes([drawing(0),drawing(0)]))assert.ok(s.end>s.start);
});
test('version 4 project roundtrip preserves the mapping and per-stroke duration',()=>{
 const {samples:_,...s}=drawing();const p={version:4,background:'#203631',duration:12,strokes:[s],audio:null,animation:config()};
 assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);assert.throws(()=>validateProject({...p,animation:undefined}));
});
test('versions 1, 2 and 3 load with their original timing',()=>{
 const {samples:_,...s}=drawing(),p={version:1,background:'#203631',duration:20,strokes:[s],audio:null};
 assert.deepEqual(validateProject(p),p);assert.equal(migrateAnimation(undefined,20).mode,'stroke');
 const legacy2={mode:'continuous',drawDuration:10,strokeDuration:20,breaks:[{start:2,end:5},{start:8,end:10}]};
 validateProject({...p,version:2,animation:legacy2});const a=migrateAnimation(legacy2);
 for(const [t,x] of [[1,.1],[2,.2],[4,.2],[6,.3],[8,.5],[10,.5],[15,1]])close(continuousProgress(t,a),x);
 const legacy3={mode:'continuous',start:2,end:12,strokeDuration:20,breaks:[{start:5,end:8,position:.5}]};
 validateProject({...p,version:3,animation:legacy3});assert.deepEqual(migrateAnimation(legacy3).points,config().points);
 assert.throws(()=>migrateAnimation({...legacy2,breaks:[{start:5,end:2}]}));
});
