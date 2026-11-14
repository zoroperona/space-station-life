// node tools/tech-demo/render.mjs --preview | --render
// Runtime-only replacement of the film director, captured at native 1920×1080.
import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../..');
const out=path.join(root,'exports/tech-demo');mkdirSync(out,{recursive:true});
const profile=mkdtempSync(path.join(tmpdir(),'xinghuan-film-'));
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal','--hide-scrollbars','--disable-background-timer-throttling','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws;
try{
  let port;
  for(let n=0;n<100&&!port;n++){await sleep(100);try{port=readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];}catch{}}
  if(!port)throw Error('Chrome did not start');
  const target=(await(await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t=>t.type==='page');
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  let id=0;const pending=new Map();
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
  const original=readFileSync(path.join(root,'src/main.js'),'utf8');
  const start=original.indexOf('  function setupFilm() {'),end=original.lastIndexOf('  init();');
  if(start<0||end<start)throw Error('Could not locate film director');
  const patched=original.slice(0,start)+readFileSync(path.join(dir,'director.js'),'utf8')+'\n'+original.slice(end);
  ws.onmessage=async e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}
    else if(m.method==='Fetch.requestPaused'){const p=m.params;try{await send('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/javascript; charset=utf-8'}],body:Buffer.from(patched).toString('base64')});}catch(e){console.error(e.message);}}
    else if(m.method==='Runtime.exceptionThrown')console.error('PAGE ERROR',JSON.stringify(m.params.exceptionDetails));
  };
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  await send('Runtime.enable');await send('Page.enable');
  await send('Fetch.enable',{patterns:[{urlPattern:'*/src/main.js',requestStage:'Request'}]});
  await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:pathToFileURL(path.join(root,'index.html')).href+'?dbg=film'});
  let ready=false;for(let n=0;n<200;n++){if(await evaluate('!!window.film').catch(()=>false)){ready=true;break;}await sleep(200);}
  if(!ready)throw Error('Film director did not initialize');await sleep(2000);
  const meta=await evaluate('({frames:film.frames,duration:film.duration,shots:film.shots})');writeFileSync(path.join(out,'timeline.json'),JSON.stringify(meta,null,2));
  const preview=process.argv.includes('--preview');
  const frameDir=path.join(out,preview?'preview':'frames');mkdirSync(frameDir,{recursive:true});
  const previewFrames=new Set(meta.shots.map(s=>Math.round((s.start+s.duration*.55)*30)));
  if(preview)await evaluate('window.captureRender=W.render;W.render=()=>{if(window.captureThisFrame)captureRender()}');
  const begin=Date.now();
  for(let i=0;i<meta.frames;i++){
    await evaluate(`${preview?`window.captureThisFrame=${previewFrames.has(i)};`:''}film.step(${i})`);
    if(!preview||previewFrames.has(i)){
      const shot=await send('Page.captureScreenshot',{format:'jpeg',quality:94,optimizeForSpeed:true});
      writeFileSync(path.join(frameDir,`f${String(i).padStart(5,'0')}.jpg`),Buffer.from(shot.data,'base64'));
    }
    if(i%90===0)console.log(`${i}/${meta.frames} frames · ${((Date.now()-begin)/1000).toFixed(1)}s`);
  }
  console.log('CAPTURE COMPLETE',frameDir);
}finally{if(ws)ws.close();chrome.kill();await sleep(600);rmSync(profile,{recursive:true,force:true});}
