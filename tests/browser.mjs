// Optional browser integration check: npm install --no-save playwright && npx playwright install chromium
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3020'},stdio:['ignore','pipe','pipe']});
let browser;
try{
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:3020');
const bounds=await page.locator('#board').boundingBox();await page.mouse.move(bounds.x+50,bounds.y+50);await page.mouse.down();await page.mouse.move(bounds.x+200,bounds.y+140,{steps:20});await page.mouse.up();assert.equal(await page.locator('.stroke-card').count(),1);await page.locator('#undo').click();assert.equal(await page.locator('.stroke-card').count(),0);await page.locator('#redo').click();assert.equal(await page.locator('.stroke-card').count(),1);
await page.locator('#duration').fill('1');await page.locator('#duration').dispatchEvent('change');await page.locator('#fit').click();await page.locator('#animate-mode').click();await page.locator('#play').click();await page.waitForTimeout(1200);assert.match(await page.locator('#time').textContent(),/0:01.00/);
const projectDownload=page.waitForEvent('download');await page.locator('#save').click();const project=await projectDownload;const projectPath=await project.path();await page.locator('#project-file').setInputFiles(projectPath);await page.waitForTimeout(200);assert.equal(await page.locator('.stroke-card').count(),1);
// A one-second PCM WAV gives a real decoded audio track for the second export.
const wav=Buffer.alloc(44+44100*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);for(let i=0;i<44100;i++)wav.writeInt16LE(Math.round(Math.sin(i/44100*Math.PI*880)*4000),44+i*2);
for(const sound of [false,true]){if(sound){await page.locator('#audio-file').setInputFiles({name:'tone.wav',mimeType:'audio/wav',buffer:wav});await page.waitForFunction(()=>!document.getElementById('remove-audio').hidden);}await page.locator('#export').click();await page.locator('#with-audio').setChecked(sound);await page.locator('#start-export').click();await page.locator('#download').waitFor({state:'visible',timeout:15000});const result=await page.evaluate(async()=>{const blob=await(await fetch(document.getElementById('download').href)).blob();return{size:blob.size,type:blob.type};});assert.ok(result.size>1000);assert.match(result.type,/video\/webm/);await page.locator('.close').click();}
assert.deepEqual(errors,[]);console.log('Browser checks passed: drawing, undo/redo, timing, playback, save/load, silent/audio WebM export.');
}finally{await browser?.close();server.kill();}
