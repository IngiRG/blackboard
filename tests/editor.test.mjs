import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise the actual editor handlers with a minimal DOM/canvas harness. Pixel
// equivalence is covered in renderer.test; this checks independent cursor state.
test('editor sliders stay independent and save exactly the linked pairs',async()=>{
 class Element {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.value='';this.classList={toggle(){}};}
  append(...nodes){this.children.push(...nodes);}prepend(...nodes){this.children.unshift(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}setAttribute(k,v){this[k]=v;}addEventListener(){}click(){this.onclick?.();}
  getContext(){return this.ctx??={fillRect(){},clearRect(){},beginPath(){},arc(){},fill(){},drawImage(){}};}
 }
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const elements=new Map();for(const match of html.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)){
  const e=new Element(match[1]);e.value=match[0].match(/\bvalue="([^"]*)"/)?.[1]||'';elements.set(match[2],e);
 }
 const $=id=>{assert.ok(elements.has(id),`Missing element ${id}`);return elements.get(id);};
 const saved=[];const originalURL=URL.createObjectURL,originalTimeout=globalThis.setTimeout;
 globalThis.document={getElementById:$,createElement:tag=>new Element(tag),createTextNode:text=>({text}),querySelectorAll:()=>[],addEventListener(){}};
 globalThis.window={addEventListener(){}};globalThis.confirm=()=>true;
 let frame,clock;
 globalThis.requestAnimationFrame=callback=>{frame=callback;return 1;};globalThis.cancelAnimationFrame=()=>{frame=null;};
 globalThis.AudioContext=class{constructor(){this.currentTime=0;this.state='running';clock=this;}};
 globalThis.setTimeout=()=>1;URL.createObjectURL=blob=>{saved.push(blob);return 'blob:test';};
 try{
  await import('../src/app.js');
  const project={version:1,background:'#203631',duration:12,audio:null,strokes:[{points:[{x:0,y:0},{x:500,y:500}],color:'#ffffff',width:5,smoothing:.55,texture:.65,start:0,end:1}]};
  await $('project-file').onchange({target:{files:[{size:100,text:async()=>JSON.stringify(project)}],value:''}});
  $('timing-mode').value='continuous';$('timing-mode').onchange();
  $('animation-seek').value='40';$('animation-seek').oninput();
  assert.equal(Number($('seek').value),0);
  $('seek').value='5';$('seek').oninput();
  assert.equal(Number($('animation-seek').value),40);
  $('link-point').onclick();
  $('seek').value='8';$('seek').oninput();
  assert.equal(Number($('animation-seek').value),40);
  $('link-point').onclick();
  $('animation-seek').value='70';$('animation-seek').oninput();
  assert.equal(Number($('seek').value),8);
  $('save').onclick();const data=JSON.parse(await saved.at(-1).text());
  assert.equal(data.version,4);
  assert.deepEqual(data.animation.points,[{time:0,position:0},{time:5,position:.4},{time:8,position:.4},{time:12,position:1}]);
  $('seek').value='1';$('seek').oninput();$('set-map-start').onclick();
  assert.equal(Number($('animation-seek').value),0);
  $('seek').value='10';$('seek').oninput();$('set-map-end').onclick();
  assert.equal(Number($('animation-seek').value),100);
  $('save').onclick();const endpoints=JSON.parse(await saved.at(-1).text()).animation.points;
  assert.equal(endpoints[0].time,1);assert.equal(endpoints.at(-1).time,10);
  assert.equal(endpoints[1].time,5);assert.equal(endpoints[2].time,8);
  $('animation-seek').value='70';$('animation-seek').oninput();
  $('seek').value='5';$('seek').oninput();
  await $('listen-audio').onclick();clock.currentTime=1;frame();
  assert.equal(Number($('seek').value),6);
  assert.equal(Number($('animation-seek').value),70,'audio-only playback must keep the selected drawing');
  await $('play').onclick();
  await $('preview-mapping').onclick();
  assert.equal(Number($('animation-seek').value),40,'timed preview must follow the saved mapping');
  $('animation-seek').value='60';$('animation-seek').oninput();
  assert.equal(Number($('seek').value),6,'drawing scrub stops preview without moving audio');
  assert.equal(Number($('animation-seek').value),60);
 }finally{URL.createObjectURL=originalURL;globalThis.setTimeout=originalTimeout;}
});
