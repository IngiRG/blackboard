import {defaultAnimation, drawingTime, continuousDuration, validateAnimation, continuousStrokes} from './timing.js';
import {W,H,clamp,samples,smoothPoints,drawStroke,setTiming,validateProject} from './engine.js';
import {SceneRenderer, LiveStrokeRenderer, frameScheduler} from './renderer.js';
function safeTiming(...args){try{setTiming(...args);}catch(error){toast(error.message);}}
const $=id=>document.getElementById(id), board=$('board'),ctx=board.getContext('2d');
let strokes=[],redo=[],current=null,selected=-1,mode='draw',time=0,playing=false,origin=0,raf=0,audioContext=null,audioBuffer=null,audioSource=null,audioData=null,exporting=false,cancelExport=false,downloadURL=null;
let duration=10,background='#203631',dirty=false;
let animation=defaultAnimation(), continuousSequence=[], continuousInitialized=false;
function toast(message){$('status').textContent=message;$('status').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('status').style.display='none',4500);}
function prepare(s){s.samples=samples(smoothPoints(s.points,s.smoothing));return s;}
let revision = 0, drawingRevision = 0;
const renderers = new WeakMap();
const liveRenderer = new LiveStrokeRenderer();
const drawingFrame = frameScheduler(() => render());
function render(target = ctx, t = time, all = mode === 'draw') {
  let renderer = renderers.get(target);
  if (!renderer) {
    renderer = new SceneRenderer();
    renderers.set(target, renderer);
  }
  const continuous = !all && animation.mode === 'continuous';
  renderer.render(target, continuous ? continuousSequence : strokes, all ? drawingRevision : revision, background,
    continuous ? drawingTime(t, animation.breaks) : t, all);
  if (current && target === ctx && all) liveRenderer.render(target, current);
  if (target === ctx) $('empty').hidden = strokes.length > 0 || !!current;
}
function format(t){return `${Math.floor(t/60)}:${(t%60).toFixed(2).padStart(5,'0')}`;}
function updateTime(){ $('seek').max=duration;$('seek').value=time;$('time').textContent=`${format(time)} / ${format(duration)}`;updateBreakState();}
function changed(appendOnly=false){revision++;if(!appendOnly)drawingRevision++;dirty=true;continuousSequence=continuousStrokes(strokes,animation.drawDuration);duration=animation.mode==='continuous'?Math.max(continuousDuration(animation),audioBuffer?.duration||0):Math.max(animation.strokeDuration,strokes.at(-1)?.end||0,audioBuffer?.duration||0);if(animation.mode==='stroke')animation.strokeDuration=duration;time=Math.min(time,duration);$('duration').value=duration.toFixed(2);$('stroke-count').textContent=`${strokes.length} stroke${strokes.length===1?'':'s'}`;$('undo').disabled=!strokes.length;$('redo').disabled=!redo.length;list();timingControls();updateTime();render();}
function list(){const parent=$('stroke-list');parent.replaceChildren();$('no-strokes').hidden=strokes.length>0;strokes.forEach((s,i)=>{const card=document.createElement('div');card.className='stroke-card'+(selected===i?' selected':'');const top=document.createElement('div');top.className='stroke-top';const dot=document.createElement('span');dot.className='dot';dot.style.background=s.color;top.append(dot,document.createTextNode(`Stroke ${String(i+1).padStart(2,'0')}`));const del=document.createElement('button');del.textContent='×';del.title=`Delete stroke ${i+1}`;del.onclick=()=>{if(exporting)return;pause();strokes.splice(i,1);redo=[];changed();};top.append(del);card.append(top);const times=document.createElement('div');times.className='times';for(const field of ['start','end']){const label=document.createElement('label');label.textContent=field==='start'?'START · seconds':'END · seconds';const input=document.createElement('input');input.type='number';input.min=0;input.max=3600;input.step=.05;input.value=s[field].toFixed(2);input.setAttribute('aria-label',`Stroke ${i+1} ${field}`);input.onchange=()=>{if(exporting)return;pause();let start=field==='start'?Number(input.value):s.start,end=field==='end'?Number(input.value):s.end;if(!Number.isFinite(start)||!Number.isFinite(end)||Math.max(start,end)>3500){toast('Enter a time below 3500 seconds.');list();return;}safeTiming(strokes,i,start,end);selected=i;changed();};label.append(input);times.append(label);}card.append(times);const cues=document.createElement('div');cues.className='cue-buttons';for(const field of ['start','end']){const b=document.createElement('button');b.textContent=`Set ${field} here`;b.onclick=()=>{if(exporting)return;safeTiming(strokes,i,field==='start'?time:s.start,field==='end'?time:s.end);selected=i;changed();};cues.append(b);}card.append(cues);parent.append(card);});}
function setMode(next){if(exporting)return;pause();if(current)finish();mode=next;$('draw-mode').classList.toggle('active',mode==='draw');$('animate-mode').classList.toggle('active',mode==='animate');$('mode-hint').textContent=mode==='draw'?'Draw with your mouse, pen, or finger.':'Preview mode · adjust animation timing on the right.';board.style.cursor=mode==='draw'?'crosshair':'default';render();}
function point(e){const r=board.getBoundingClientRect();return{x:clamp((e.clientX-r.left)*W/r.width,0,W),y:clamp((e.clientY-r.top)*H/r.height,0,H)};}
board.onpointerdown=e=>{if(mode!=='draw'||exporting||e.button!==0||current)return;if((strokes.at(-1)?.end||0)>3599){toast('The sequence cannot exceed one hour.');return;}e.preventDefault();board.setPointerCapture(e.pointerId);current={points:[point(e)],color:$('color').value,width:+$('width').value,smoothing:+$('smooth').value/100,texture:+$('texture').value/100,start:strokes.at(-1)?.end||0};current.end=current.start+1;render();};
board.onpointermove=e=>{if(!current)return;const events=e.getCoalescedEvents?.();for(const event of events?.length?events:[e]){const p=point(event),last=current.points.at(-1);if(Math.hypot(p.x-last.x,p.y-last.y)>.7)current.points.push(p);}drawingFrame.schedule();};
function finish(){if(!current)return;drawingFrame.cancel();strokes.push(prepare(current));current=null;liveRenderer.reset();redo=[];selected=strokes.length-1;changed(true);}
board.onpointerup=finish;board.onlostpointercapture=finish;board.onpointercancel=()=>{drawingFrame.cancel();current=null;liveRenderer.reset();render();};
$('draw-mode').onclick=()=>setMode('draw');$('animate-mode').onclick=()=>setMode('animate');
function brush(){const c=$('brush').getContext('2d');c.fillStyle=background;c.fillRect(0,0,210,65);drawStroke(c,prepare({points:Array.from({length:100},(_,i)=>({x:15+i*1.8,y:33+Math.sin(i/22)*10})),width:+$('width').value,color:$('color').value,smoothing:+$('smooth').value/100,texture:+$('texture').value/100}));}
for(const [id,suffix] of [['width',' px'],['smooth','%'],['texture','%']])$(id).oninput=()=>{$(`${id}-value`).value=$(id).value+suffix;brush();};$('color').oninput=brush;document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{$('color').value=b.dataset.color;brush();});$('background').oninput=()=>{background=$('background').value;dirty=true;render();brush();};
$('undo').onclick=()=>{if(exporting||!strokes.length)return;pause();redo.push(strokes.pop());changed();};$('redo').onclick=()=>{if(exporting||!redo.length)return;pause();strokes.push(redo.pop());changed(true);};$('clear').onclick=()=>{if(exporting||!strokes.length||!confirm('Clear all strokes? Save your project first if you want to keep them.'))return;pause();strokes=[];redo=[];changed();};
async function getAudioContext(){audioContext??=new AudioContext();if(audioContext.state==='suspended')await audioContext.resume();return audioContext;}
function stopAudio(){if(audioSource){try{audioSource.stop();}catch{}audioSource.disconnect();audioSource=null;}}
function pause(){playing=false;cancelAnimationFrame(raf);stopAudio();$('play').textContent='▶';$('play').setAttribute('aria-label','Play animation');}
function tick(){if(!playing)return;time=Math.min(duration,(audioContext.currentTime-origin));updateTime();render();if(time>=duration)pause();else raf=requestAnimationFrame(tick);}
async function play(){if(exporting)return;if(playing){pause();return;}setMode('animate');const ac=await getAudioContext();if(time>=duration)time=0;if(audioBuffer&&time<audioBuffer.duration){audioSource=ac.createBufferSource();audioSource.buffer=audioBuffer;audioSource.connect(ac.destination);audioSource.start(0,time);}origin=ac.currentTime-time;playing=true;$('play').textContent='Ⅱ';$('play').setAttribute('aria-label','Pause animation');tick();}
$('play').onclick=()=>play().catch(e=>toast(e.message));$('restart').onclick=()=>{if(exporting)return;pause();time=0;updateTime();render();};$('seek').oninput=()=>{if(exporting)return;const nextTime=+$('seek').value;if(mode!=='animate')setMode('animate');else pause();time=nextTime;updateTime();render();};$('duration').onchange=()=>{if(exporting)return;pause();duration=clamp(Number($('duration').value)||10,1,3600);animation.strokeDuration=duration;duration=Math.max(duration,strokes.at(-1)?.end||0,audioBuffer?.duration||0);changed();};$('fit').onclick=()=>{if(exporting||!strokes.length)return;pause();const each=duration/strokes.length;if(each<.05){toast('Increase the duration to fit all strokes.');return;}strokes.forEach((s,i)=>{s.start=i*each;s.end=(i+1)*each;});changed();};
function waveform(){const c=$('wave').getContext('2d');c.clearRect(0,0,1200,64);if(!audioBuffer){$('audio-name').textContent='Add a voiceover, or tell a silent story.';return;}const data=audioBuffer.getChannelData(0);c.fillStyle='#8da889';for(let i=0;i<600;i++){let peak=0;const a=Math.floor(i*data.length/600),b=Math.floor((i+1)*data.length/600);for(let j=a;j<b;j+=Math.max(1,Math.floor((b-a)/150)))peak=Math.max(peak,Math.abs(data[j]));c.fillRect(i*2,32-peak*29,1,Math.max(1,peak*58));}$('audio-name').textContent=audioData?.name||'Voiceover';}
function dataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Could not read file.'));r.readAsDataURL(file);});}
async function loadAudio(file){if(file.size>100*1024*1024)throw Error('Choose an audio file smaller than 100 MB.');const ac=await getAudioContext(),buffer=await ac.decodeAudioData(await file.arrayBuffer());if(buffer.duration>3600)throw Error('Audio must be shorter than one hour.');const data=await dataURL(new Blob([file],{type:file.type.startsWith('audio/')?file.type:'audio/wav'}));pause();audioBuffer=buffer;audioData={name:file.name,data};$('remove-audio').hidden=false;changed();waveform();toast('Audio ready. Switch to Animate to time your strokes.');}
$('upload').onclick=()=>{if(!exporting)$('audio-file').click();};$('audio-file').onchange=async e=>{try{if(e.target.files[0])await loadAudio(e.target.files[0]);}catch(err){toast('Audio could not be loaded: '+err.message);}e.target.value='';};$('remove-audio').onclick=()=>{if(exporting)return;pause();audioBuffer=null;audioData=null;$('remove-audio').hidden=true;changed();waveform();};
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
$('save').onclick=()=>{const project={version:2,animation,background,duration,strokes:strokes.map(({samples,...s})=>s),audio:audioData};download(new Blob([JSON.stringify(project)],{type:'application/json'}),'my-story.blackboard');dirty=false;toast('Project saved, including its audio.');};$('open').onclick=()=>{if(!exporting)$('project-file').click();};$('project-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>150*1024*1024)throw Error('Project is too large.');const data=validateProject(JSON.parse(await file.text()));let buffer=null;if(data.audio){const ac=await getAudioContext();buffer=await ac.decodeAudioData(await(await fetch(data.audio.data)).arrayBuffer());if(buffer.duration>3600)throw Error('Audio exceeds one hour.');}if(dirty&&!confirm('Replace this unsaved project?'))return;pause();strokes=data.strokes.map(prepare);redo=[];background=data.background;$('background').value=background;duration=data.duration;animation=data.animation||defaultAnimation(data.duration);continuousInitialized=!!data.animation;audioBuffer=buffer;audioData=data.audio||null;time=0;$('remove-audio').hidden=!buffer;changed();dirty=false;brush();waveform();toast('Project opened.');}catch(err){toast('Could not open project: '+err.message);}e.target.value='';};
$('export').onclick=()=>{if(!strokes.length){toast('Draw something before exporting.');return;}$('with-audio').disabled=!audioBuffer;$('export-dialog').showModal();};$('cancel-export').onclick=()=>{cancelExport=true;};$('export-dialog').addEventListener('cancel',e=>{if(exporting)e.preventDefault();});
$('start-export').onclick=async()=>{if(exporting)return;if(!window.MediaRecorder||!board.captureStream){toast('Video export is not supported in this browser. Try Chrome or Edge.');return;}const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));if(!mime){toast('This browser cannot export WebM video. Try Chrome or Edge.');return;}pause();exporting=true;cancelExport=false;$('start-export').hidden=true;$('cancel-export').hidden=false;$('download').hidden=true;$('export-dialog').querySelector('.close').disabled=true;document.querySelector('main').inert=true;document.querySelector('header').inert=true;let stream,source,dest,recorder;try{const ac=await getAudioContext();const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const c=canvas.getContext('2d');render(c,0,false);stream=canvas.captureStream(30);if($('with-audio').checked&&audioBuffer){dest=ac.createMediaStreamDestination();source=ac.createBufferSource();source.buffer=audioBuffer;source.connect(dest);for(const track of dest.stream.getAudioTracks())stream.addTrack(track);}const chunks=[];recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=e=>reject(e.error||Error('Recording failed.'));});recorder.start(250);const start=ac.currentTime+.1;source?.start(start);await new Promise(resolve=>{function frame(){const t=Math.max(0,ac.currentTime-start);render(c,Math.min(t,duration),false);$('export-progress').value=Math.min(t/duration,1);$('export-state').textContent=`Rendering ${Math.round(Math.min(t/duration,1)*100)}%`;if(t>=duration||cancelExport){resolve();return;}setTimeout(frame,1000/30);}frame();});if(recorder.state!=='inactive')recorder.stop();await stopped;if(cancelExport){$('export-state').textContent='Export cancelled. Keep the tab visible when exporting.';}else{if(downloadURL)URL.revokeObjectURL(downloadURL);downloadURL=URL.createObjectURL(new Blob(chunks,{type:mime}));$('download').href=downloadURL;$('download').download='blackboard-story.webm';$('download').hidden=false;$('export-state').textContent='Your video is ready.';}}catch(err){$('export-state').textContent='Export failed: '+err.message;}finally{if(recorder&&recorder.state!=='inactive')recorder.stop();try{source?.stop();}catch{}source?.disconnect();dest?.disconnect();stream?.getTracks().forEach(t=>t.stop());exporting=false;$('start-export').hidden=false;$('cancel-export').hidden=true;$('export-dialog').querySelector('.close').disabled=false;document.querySelector('main').inert=false;document.querySelector('header').inert=false;render();}};
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(exporting){cancelExport=true;$('export-state').textContent='Export cancelled because the tab was hidden. Keep it visible and retry.';}pause();}});
document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||exporting||$('export-dialog').open)return;if(e.code==='Space'){e.preventDefault();play().catch(err=>toast(err.message));}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();}if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();$('save').click();}});

function updateBreakState() {
  if (animation.mode !== 'continuous') return;
  const gap = animation.breaks.find(g => time >= g.start && time < g.end);
  $('break-state').textContent = gap ? `Drawing paused · resumes at ${format(gap.end)}` :
    (drawingTime(time, animation.breaks) >= animation.drawDuration ? 'Drawing complete' : 'Drawing continues');
}

function commitAnimation(next) {
  if (exporting) return;
  try {
    validateAnimation(next);
    pause();
    animation = next;
    changed();
  } catch (error) {
    toast(error.message);
    timingControls();
  }
}

function timingControls() {
  const continuous = animation.mode === 'continuous';
  $('timing-mode').value = animation.mode;
  $('continuous-panel').hidden = !continuous;
  $('stroke-list').hidden = continuous;
  $('no-strokes').hidden = continuous || strokes.length > 0;
  $('fit').hidden = continuous;
  $('duration').disabled = continuous;
  $('duration').title = continuous ? 'Total length includes drawing time, breaks, and audio.' : '';
  $('drawing-duration').value = animation.drawDuration;
  $('add-break').disabled = !strokes.length;
  $('timing-help').textContent = continuous
    ? 'Reveal the entire drawing at a steady pace. Add breaks anywhere—even in the middle of a stroke.'
    : 'Strokes reveal in drawing order. Set a start and end, or use the playhead.';
  $('no-breaks').hidden = animation.breaks.length > 0;
  const parent = $('break-list');
  parent.replaceChildren();
  $('break-markers').replaceChildren();
  if (!continuous) return;
  animation.breaks.forEach((gap, i) => {
    const card = document.createElement('div');
    card.className = 'stroke-card';
    const top = document.createElement('div');
    top.className = 'stroke-top';
    top.textContent = `Break ${i + 1}`;
    const remove = document.createElement('button');
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Delete break ${i + 1}`);
    remove.onclick = () => commitAnimation({...animation, breaks: animation.breaks.filter((_, index) => index !== i)});
    top.append(remove);
    card.append(top);
    const times = document.createElement('div');
    times.className = 'times';
    const cues = document.createElement('div');
    cues.className = 'cue-buttons';
    for (const field of ['start', 'end']) {
      const label = document.createElement('label');
      label.textContent = field === 'start' ? 'PAUSE AT · seconds' : 'RESUME AT · seconds';
      const input = document.createElement('input');
      input.type = 'number'; input.min = 0; input.max = 3600; input.step = .05;
      input.value = gap[field].toFixed(2);
      input.setAttribute('aria-label', `Break ${i + 1} ${field === 'start' ? 'start' : 'resume'}`);
      const edit = value => {
        const breaks = animation.breaks.map((g, index) => index === i ? {...g, [field]: value} : {...g});
        breaks.sort((a, b) => a.start - b.start);
        commitAnimation({...animation, breaks});
      };
      input.onchange = () => edit(input.value === '' ? NaN : Number(input.value));
      label.append(input); times.append(label);
      const cue = document.createElement('button');
      cue.textContent = field === 'start' ? 'Pause here' : 'Resume here';
      cue.onclick = () => edit(time);
      cues.append(cue);
    }
    card.append(times, cues); parent.append(card);
    const marker = document.createElement('span');
    marker.className = 'break-marker';
    marker.style.left = `${100 * gap.start / duration}%`;
    marker.style.width = `${100 * (gap.end - gap.start) / duration}%`;
    $('break-markers').append(marker);
  });
}

$('timing-mode').onchange = () => {
  if (exporting) return;
  if (current) finish();
  const next = {...animation, mode: $('timing-mode').value};
  if (next.mode === 'continuous' && !continuousInitialized) {
    next.drawDuration = duration;
    continuousInitialized = true;
  }
  commitAnimation(next);
  setMode('animate');
};
$('drawing-duration').onchange = () => commitAnimation({...animation,
  drawDuration: $('drawing-duration').value === '' ? NaN : Number($('drawing-duration').value)});
$('add-break').onclick = () => {
  if (exporting || !strokes.length) return;
  pause();
  const start = Math.round(time * 100) / 100;
  if (animation.breaks.some(g => start >= g.start && start < g.end)) {
    toast('There is already a break here. Edit its resume time below.'); return;
  }
  if (drawingTime(start, animation.breaks) >= animation.drawDuration) {
    toast('Scrub to a point before the drawing finishes to add a break.'); return;
  }
  const nextStart = animation.breaks.find(g => g.start > start)?.start ?? 3600;
  const gap = {start, end: Math.min(start + 1, nextStart)};
  commitAnimation({...animation, breaks: [...animation.breaks, gap].sort((a, b) => a.start - b.start)});
  setMode('animate');
};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
changed();dirty=false;brush();waveform();
