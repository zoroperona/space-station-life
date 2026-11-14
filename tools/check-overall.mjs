// Real Chrome/WebGL integration checks; no player saves are read or written.
import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'exports/visual-upgrade');mkdirSync(output,{recursive:true});
const profile=mkdtempSync(path.join(tmpdir(),'xinghuan-check-'));
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws;
try{
  let port;for(let i=0;i<100&&!port;i++){await sleep(100);try{port=readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]}catch{}}
  const target=(await(await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t=>t.type==='page');
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
  const pending=new Map(),errors=[],requests=[];let id=0;
  const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Fetch.requestPaused'){send('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'Failed'}).catch(e=>errors.push(e.message));}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description).join(' '));else if(m.method==='Network.requestWillBeSent'&&!m.params.request.url.startsWith('data:'))requests.push(m.params.request.url);};
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  await send('Runtime.enable');await send('Network.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  const selftest=false;
  await send('Page.navigate',{url:pathToFileURL(path.join(root,'index.html')).href+(selftest?'?dbg=test':'?dbg=journey-test')});
  if(selftest){
    let result='';for(let i=0;i<600;i++){result=await evaluate('document.getElementById("selftest")?.textContent||""');if(result)break;await sleep(200);}
    writeFileSync(path.join(output,'gameplay-selftest.txt'),result);console.log(result);
    if(!result.startsWith('SELFTEST OK'))throw Error('Gameplay self-test failed');
  } else {
  let ready=false;for(let n=0;n<200;n++){if(await evaluate('!!window.journeyTest').catch(()=>false)){ready=true;break;}await sleep(200);}
  if(!ready)throw Error('Failed to initialize: '+JSON.stringify(errors));
  await sleep(1500);
  const startup=await evaluate('TextureAssets.status()');
  if(requests.some(u=>u.endsWith('/data/textures.js')))throw Error('Monolithic texture payload still loaded');
  await evaluate('window.actualRender=W.render;W.render=()=>{}');
  const capture=async name=>{await evaluate('actualRender()');const r=await send('Page.captureScreenshot',{format:'jpeg',quality:93});writeFileSync(path.join(output,name+'.jpg'),Buffer.from(r.data,'base64'));};

  // Refresh real localStorage snapshots in this disposable browser profile.
  const reload=async()=>{
    await send('Page.navigate',{url:pathToFileURL(path.join(root,'index.html')).href+'?dbg=journey-test&resume=1'});
    await sleep(600);
    for(let i=0;i<200;i++){if(await evaluate('!!window.journeyTest').catch(()=>false))break;await sleep(100);}
    await evaluate('window.actualRender=W.render;W.render=()=>{}');
  };
  for(const photo of [false,true]){
    await evaluate(`journeyTest.orbit('sol','jupiter');journeyTest.step();journeyTest.lock();journeyTest.setKey('KeyD',true);for(let i=0;i<45;i++)journeyTest.step();journeyTest.setKey('KeyD',false);${photo?"journeyTest.photo(.8,.4,250);journeyTest.key('KeyK');journeyTest.step();":''}journeyTest.persist();`);
    const before=await evaluate('journeyTest.snapshot()');await reload();const after=await evaluate('journeyTest.snapshot()');
    for(const key of ['position','rotation','velocity','camera','cameraQ'])if(before[key].some((v,i)=>Math.abs(v-after[key][i])>1e-8))throw Error('Refresh changed '+key);
    for(const key of ['phase','survey','lock','hidden','shipView','fov'])if(before[key]!==after[key])throw Error('Refresh changed '+key);
    if(JSON.stringify(before.photo)!==JSON.stringify(after.photo))throw Error('Photo state lost');
    const invalid=await evaluate('(()=>{const s=journeyTest.snapshot();s.position=[null,0,0];return journeyTest.restore(s);})()');
    if(invalid)throw Error('Invalid snapshot accepted');
    console.log('Refresh restoration PASS',photo?'photo':'locked flight');
  }
  await evaluate("journeyTest.key('KeyP');journeyTest.orbit('sol','jupiter');journeyTest.step();document.getElementById('lockButton').click();for(let i=0;i<60;i++)journeyTest.step();");
  if(await evaluate("journeyTest.state().locked!=='jupiter'"))throw Error('Lock button failed');
  await evaluate("document.querySelector('[data-flight=KeyX]').click()");
  if(await evaluate('Math.hypot(...journeyTest.state().velocity)>1e-6'))throw Error('Stop button failed');
  await capture('overall-flight-ui');
  const layout=await evaluate(`(()=>{
    const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};};
    return {mission:rect('mission'),tl:rect('tl'),toasts:rect('toasts'),controls:rect('flightControls'),needs:rect('needs')};
  })()`);
  const overlaps=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
  if(overlaps(layout.mission,layout.tl)||overlaps(layout.mission,layout.toasts)||overlaps(layout.controls,layout.needs))throw Error('Desktop HUD overlap');
  await send('Emulation.setDeviceMetricsOverride',{width:880,height:700,deviceScaleFactor:1,mobile:false});await sleep(200);await evaluate('journeyTest.step()');await capture('overall-flight-ui-narrow');
  const narrow=await evaluate(`(()=>{const ids=['mission','tl','flightControls','needs'];return Object.fromEntries(ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [id,{x:r.x,y:r.y,right:r.right,bottom:r.bottom}];}));})()`);
  if(overlaps(narrow.mission,narrow.tl)||overlaps(narrow.flightControls,narrow.needs))throw Error('Narrow HUD overlap');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  const sizes=[];
  for(const quality of ['high','balanced','performance']){
    await evaluate(`W.setQuality('${quality}');journeyTest.step();actualRender();`);
    sizes.push(await evaluate('({quality:W.quality,width:W.renderer.domElement.width,samples:W.post.scene.samples})'));
  }
  if(sizes[2].width>=sizes[0].width||sizes[2].samples!==0)throw Error('Quality profile ineffective');
  await evaluate("document.getElementById('settingsButton').click()");await capture('overall-settings');await evaluate('journeyTest.closePanel()');
  // Warm both systems, then compare like-for-like GPU resource counts.
  const resources=[];
  for(let i=0;i<5;i++){
    await evaluate("journeyTest.orbit('trappist1','trappist1_e');journeyTest.step();actualRender();journeyTest.orbit('sol','jupiter');journeyTest.step();actualRender();");
    resources.push(await evaluate('({...W.renderer.info.memory,programs:W.renderer.info.programs.length})'));
  }
  if(resources.at(-1).geometries>resources[1].geometries+2||resources.at(-1).textures>resources[1].textures+4||resources.at(-1).programs>resources[1].programs+2)throw Error('GPU resources grow across system switches '+JSON.stringify(resources));
  await evaluate("W.setQuality('balanced');journeyTest.persist()");await reload();
  if(await evaluate("W.quality!=='balanced'"))throw Error('Quality preference not restored');
  // A normal launch must wait for Continue without advancing simulation.
  await send('Page.navigate',{url:pathToFileURL(path.join(root,'index.html')).href});await sleep(1800);
  const initialSave=await evaluate("localStorage.getItem('xinghuan-3d-v1')");await sleep(6500);
  if(initialSave!==await evaluate("localStorage.getItem('xinghuan-3d-v1')"))throw Error('Intro screen advanced or overwrote save');
  await evaluate("document.getElementById('c').requestPointerLock=()=>{};document.getElementById('start').click()");await sleep(800);
  await evaluate("window.dispatchEvent(new Event('pagehide'))");
  const production=await evaluate("JSON.parse(localStorage.getItem('xinghuan-3d-v1'))");
  if(!production.flight||production.t<=JSON.parse(initialSave).t)throw Error('Production autosave did not record flight');
  await reload();const restored=await evaluate('journeyTest.snapshot()');
  for(const key of ['position','rotation','velocity','camera','cameraQ'])if(production.flight[key].some((v,i)=>Math.abs(v-restored[key][i])>1e-8))throw Error('Production save mismatch '+key);
  console.log('Production pagehide save PASS');
  if(errors.length)throw Error('Browser errors '+JSON.stringify(errors).slice(0,2000));
  writeFileSync(path.join(output,'overall-report.json'),JSON.stringify({refresh:true,layout,narrow,sizes,resources,errors},null,2));
  console.log('PASS overall experience',JSON.stringify({sizes,resources}));
  }
}finally{if(ws)ws.close();chrome.kill();await sleep(500);rmSync(profile,{recursive:true,force:true});}
