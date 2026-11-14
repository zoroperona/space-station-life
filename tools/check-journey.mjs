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
  const selftest=process.argv.includes('--selftest');
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
  const shots=[];
  for(const [system,body] of [['trappist1','trappist1_e'],['sol','moon'],['sol','mars'],['sol','saturn']]){
    if(process.argv.includes('--timing')&&body!=='trappist1_e')continue;
    await evaluate(`journeyTest.orbit(${JSON.stringify(system)},${JSON.stringify(body)});journeyTest.photo(1.1,1.05,150);journeyTest.step();`);
    await evaluate('TextureAssets.prefetch(W.byId[journeyTest.state().body].def)');
    await evaluate('journeyTest.step()');await capture(body);console.log('Screenshot',body);
    if(body==='trappist1_e'){
      const renderMs=await evaluate('(async()=>{actualRender();W.renderer.getContext().finish();const t=performance.now();for(let i=0;i<20;i++){journeyTest.step();actualRender();W.renderer.getContext().finish();}return (performance.now()-t)/20;})()');
      console.log('TRAPPIST GPU + frame ms',renderMs.toFixed(1));
      writeFileSync(path.join(output,'render-timing.json'),JSON.stringify({width:1280,height:720,meanFrameMs:renderMs,frames:20,note:'Headless Chrome Metal, synchronous GPU finish; not a cross-device FPS guarantee.'},null,2));
    }
  }
  const flights=[];let maxDecelerationTurn=0;
  for(const [system,body,to] of [['sol','earth','sol/moon'],['sol','moon','sol/saturn'],['sol','saturn','trappist1/trappist1_e'],['trappist1','trappist1_e','sol/station']]){
    if(process.argv.includes('--timing')||(process.argv.includes('--quick')&&body!=='earth'))continue;
    await evaluate(`journeyTest.orbit(${JSON.stringify(system)},${JSON.stringify(body)});journeyTest.step();journeyTest.start(${JSON.stringify(to)});`);
    const duration=await evaluate('journeyTest.state().duration');
    const marks=[.02,.15,.25,.49,.51,.70,.82,.94,.99,1.0],records=[];let next=0;
    const count=Math.ceil(duration*30)+90;let previousCamera=null;
    for(let i=0;i<count;i++){
      const state=await evaluate('journeyTest.step();journeyTest.state()');
      if(state.cruising&&state.f>.55&&state.f<.995&&previousCamera){
        const dot=Math.min(1,Math.abs(state.cameraLocalQ.reduce((s,x,k)=>s+x*previousCamera[k],0)));
        const angle=2*Math.acos(dot);maxDecelerationTurn=Math.max(maxDecelerationTurn,angle);
        if(angle>.08)throw Error('Deceleration camera jumped '+(angle*180/Math.PI)+' degrees/frame');
      }
      previousCamera=state.cameraLocalQ;
      if(state.ship.some(x=>!Number.isFinite(x))||state.camera.some(x=>!Number.isFinite(x)))throw Error('Nonfinite flight state');
      if(next<marks.length&&i>=(duration*30)*marks[next]-1){
        const name=`${body}-to-${to.split('/')[1]}-${String(next).padStart(2,'0')}`;
        await capture(name);records.push({mark:marks[next],...state});next++;
      }
      if(i===Math.ceil(duration*30)-2||i===Math.ceil(duration*30)-1)shots.push(state);
    }
    const state=await evaluate('journeyTest.state()');
    const arrived=records.find(r=>r.mark===1);
    if(arrived&&!arrived.cruising){const delta=state.cameraLocalQ.reduce((n,x,k)=>n+Math.abs(x-arrived.cameraLocalQ[k]),0);if(delta>1e-6)throw Error('Camera reframed itself after arrival');}
    if(state.cruising||state.mode!=='pilot'||state.system!==to.split('/')[0])throw Error('Arrival failed '+to);
    flights.push({from:body,to,duration,records,final:state});console.log('Flight complete',body,to,duration);
  }
  // Departure strafing must not carry the source horizon into Jupiter's view.
  const jupiterAngles=[];
  for(const strafe of [false,true]){
    const result=await evaluate(`(()=>{
      journeyTest.orbit('sol','earth');journeyTest.step();
      if(${strafe}){journeyTest.toggleSurvey();journeyTest.setKey('KeyD',true);for(let i=0;i<150;i++)journeyTest.step();journeyTest.setKey('KeyD',false);}
      journeyTest.start('sol/jupiter');
      let last=null,maxTurn=0;
      while(journeyTest.state().cruising){
        journeyTest.step();const s=journeyTest.state();
        if(s.cruising&&s.f>.55&&last){const dot=Math.min(1,Math.abs(s.cameraLocalQ.reduce((n,x,k)=>n+x*last[k],0)));maxTurn=Math.max(maxTurn,2*Math.acos(dot));}
        last=s.cameraLocalQ;
      }
      const north=W.byId.jupiter.pole.clone().applyQuaternion(W.root.quaternion).applyQuaternion(W.camera.getWorldQuaternion(new THREE.Quaternion()).invert());
      return {strafe:${strafe},rollDegrees:Math.atan2(north.x,north.y)*180/Math.PI,maxTurn};
    })()`);
    if(Math.abs(result.rollDegrees)>15||result.maxTurn>.08)throw Error('Jupiter arrival horizon unstable: '+JSON.stringify(result));
    await capture(strafe?'jupiter-after-D':'jupiter-direct');jupiterAngles.push(result);
  }
  console.log('Jupiter arrival angles',jupiterAngles);
  writeFileSync(path.join(output,'jupiter-arrival.json'),JSON.stringify(jupiterAngles,null,2));
  await evaluate("journeyTest.orbit('sol','jupiter');journeyTest.step()");
  const moonCollision=await evaluate(`(()=>{
    const R=W.byId.callisto.def.R;
    return {cross:journeyTest.collisionProbe('callisto',R*4),miss:journeyTest.collisionProbe('callisto',R*4,R*1.2),inside:journeyTest.collisionProbe('callisto',R*.5)};
  })()`);
  if(moonCollision.cross.hit!=='callisto'||moonCollision.cross.position[0]>-moonCollision.cross.minimum||moonCollision.cross.speed>1e-3||moonCollision.miss.hit||Math.hypot(...moonCollision.inside.position)<moonCollision.inside.minimum)throw Error('Non-target moon collision failed '+JSON.stringify(moonCollision));
  console.log('Non-target Callisto collision PASS',moonCollision);
  const surveyChecks=[];
  for(const body of ['moon','jupiter']){
    await evaluate(`journeyTest.orbit('sol','${body}');journeyTest.toggleSurvey();journeyTest.aim([1,0,0]);journeyTest.step();`);
    const before=await evaluate('journeyTest.state()');
    await evaluate("journeyTest.setKey('KeyW',true);for(let i=0;i<15;i++)journeyTest.step();");
    const normal=await evaluate('journeyTest.state()');
    await evaluate("journeyTest.setKey('ShiftLeft',true);for(let i=0;i<15;i++)journeyTest.step();");
    const fast=await evaluate('journeyTest.state()');
    await evaluate("journeyTest.setKey('KeyW',false);journeyTest.setKey('ShiftLeft',false);journeyTest.setKey('KeyX',true);journeyTest.step();journeyTest.setKey('KeyX',false);");
    const stopped=await evaluate('journeyTest.state()');
    if(Math.hypot(...normal.ship)<before.radius*.2||Math.hypot(...fast.velocity)<Math.hypot(...normal.velocity)*3||Math.hypot(...stopped.velocity)>1e-6||normal.phase!==before.phase)throw Error('Free flight controls failed on '+body);
    const orbit=await evaluate(`(()=>{
      journeyTest.orbit('sol','${body}');journeyTest.toggleSurvey();journeyTest.setKey('KeyW',true);journeyTest.setKey('ShiftLeft',true);
      let total=0,previous=Math.PI/2,minimum=Infinity;
      for(let i=0;i<150;i++){
        const s=journeyTest.state(),x=s.ship[0],y=s.ship[1]+s.orbitRadius,r=Math.hypot(x,y);
        journeyTest.aim([y/r-x/r*.12,-x/r-y/r*.12,0]);journeyTest.step();
        const n=journeyTest.state(),angle=Math.atan2(n.ship[1]+n.orbitRadius,n.ship[0]);
        let d=angle-previous;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
        total+=Math.abs(d);previous=angle;minimum=Math.min(minimum,n.actualAltitude);
      }
      journeyTest.setKey('KeyW',false);journeyTest.setKey('ShiftLeft',false);journeyTest.setKey('KeyX',true);journeyTest.step();journeyTest.setKey('KeyX',false);
      return {angle:total,minimum,state:journeyTest.state()};
    })()`);
    if(orbit.angle<Math.PI||orbit.minimum<(body==='jupiter'?before.radius*.004:150)-1||Math.hypot(...orbit.state.worldCamera)>1000)throw Error('Manual orbit / floating origin failed on '+body);
    await evaluate("(()=>{const s=journeyTest.state();journeyTest.aim([-s.ship[0],-s.ship[1]-s.orbitRadius,-s.ship[2]]);journeyTest.setKey('ShiftLeft',true);for(let i=0;i<60;i++)journeyTest.step();journeyTest.setKey('ShiftLeft',false);})()");
    const safe=await evaluate('journeyTest.state()');if(safe.actualAltitude<(body==='jupiter'?before.radius*.004:150)-1)throw Error('Surface collision failed');
    await evaluate('journeyTest.toggleSurvey();journeyTest.step();');
    if(await evaluate('journeyTest.state().survey'))throw Error('Cannot return to precision controls');
    surveyChecks.push({body,normalSpeed:Math.hypot(...normal.velocity),boostSpeed:Math.hypot(...fast.velocity),manualOrbitDegreesIn5s:orbit.angle*180/Math.PI,minimumAltitude:orbit.minimum,surfaceProtection:true,stopped:true});
  }
  const exploration=await evaluate(`(()=>{
    journeyTest.orbit('sol','jupiter');journeyTest.step();journeyTest.lock();
    const r=journeyTest.state().orbitRadius;
    journeyTest.setKey('KeyD',true);for(let i=0;i<180;i++)journeyTest.step();journeyTest.setKey('KeyD',false);
    const s=journeyTest.state(),radius=Math.hypot(s.ship[0],s.ship[1]+r,s.ship[2]);
    for(let i=0;i<90;i++)journeyTest.step();
    const view=journeyTest.targetInCamera();
    if(Math.abs(radius-r)>5||view[2]>-.995)throw Error('Lock orbit lost radius or target '+JSON.stringify({radius,r,view}));
    journeyTest.lock();if(journeyTest.state().locked)throw Error('Unlock failed');
    journeyTest.placeNear('callisto',10000);journeyTest.aim([0,-1,0]);
    journeyTest.setKey('ShiftLeft',true);for(let i=0;i<120;i++)journeyTest.step();journeyTest.setKey('ShiftLeft',false);
    if(journeyTest.nearby()!=='callisto'||!journeyTest.state().approachLimited)throw Error('Nearby body / approach assist failed');
    journeyTest.scan();const credits=journeyTest.credits(),records=journeyTest.journal();journeyTest.closePanel();
    journeyTest.scan();if(journeyTest.credits()!==credits)throw Error('Repeated scan duplicated rewards');journeyTest.closePanel();
    if(!records.callisto||!records.callisto[1])throw Error('Close observation missing');
    return {orbitRadiusError:Math.abs(radius-r),targetView:view,nearby:journeyTest.nearby(),records};
  })()`);
  console.log('Exploration controls PASS',exploration);
  await evaluate("journeyTest.placeNear('callisto',W.byId.callisto.def.R*.2);journeyTest.lock();for(let i=0;i<90;i++)journeyTest.step();");
  await capture('callisto-close-exploration');
  await evaluate('journeyTest.scan()');await capture('callisto-observations');await evaluate('journeyTest.closePanel()');
  const photoCheck=await evaluate(`(()=>{
    journeyTest.key('KeyP');journeyTest.key('KeyK');
    if(!journeyTest.photoHidden())throw Error('Hide ship failed');
    journeyTest.step();actualRender();
    const url=W.renderer.domElement.toDataURL('image/png');
    journeyTest.key('KeyP');if(journeyTest.photoHidden())throw Error('Photo exit did not restore ship');
    if(!url.startsWith('data:image/png')||url.length<10000)throw Error('Photo export failed');
    return {pngBytes:Math.round(url.length*.75)};
  })()`);
  console.log('Photo capture PASS',photoCheck);
  const labelCheck=await evaluate(`(()=>{
    const bodies=W.bodies,host=document.getElementById('labels'),ship=W.labelOccluder;
    const effect=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());
    ship.add(effect);
    try{
      W.bodies=[];
      for(let i=0;i<9;i++){
        const p=new THREE.Vector3((i%3-1)*.7,(Math.floor(i/3)-1)*.7,.5).unproject(W.camera);
        p.sub(W.camera.getWorldPosition(new THREE.Vector3())).normalize().multiplyScalar(1e8).add(W.camera.getWorldPosition(new THREE.Vector3()));
        W.bodies.push({def:{id:'label-test-'+i,name:'test '+i,R:1,kind:'planet'},pos:W.toSys(p)});
      }
      const snapshots=[];
      for(const scale of [1,1000,2,2000,1]){
        effect.scale.setScalar(scale);effect.updateWorldMatrix(true,false);
        W.updateLabels(true,host,null);
        snapshots.push([...host.children].filter(e=>e.textContent.startsWith('test ')).map(e=>e.textContent+':'+e.style.display).join('|'));
      }
      if(!snapshots[0].includes(':block'))throw Error('No visible test labels');
      if(snapshots.some(s=>s!==snapshots[0]))throw Error('Animated effect changed label visibility');
      return {passed:true,scales:5};
    }finally{ship.remove(effect);effect.geometry.dispose();effect.material.dispose();W.bodies=bodies;W.clearLabels();}
  })()`);
  console.log('Stable labels',labelCheck);
  const distantLabels=await evaluate(`(()=>{
    const original=W.bodies,occluder=W.labelOccluder,host=document.getElementById('labels');
    let checks=0;
    try{
      W.labelOccluder=null;
      for(const distance of [1e12,5e12,1e13,9e13])for(let i=0;i<100;i++){
        const x=.3+Math.sin(i)*1e-5,y=.5+Math.cos(i)*1e-5;
        const p=new THREE.Vector3(x,y,-1).normalize().multiplyScalar(distance).applyMatrix4(W.camera.matrixWorld);
        W.bodies=[{def:{id:'far-test',name:'distant-test',R:1,kind:'planet'},pos:W.toSys(p)}];
        W.updateLabels(true,host,null);
        const el=[...host.children].find(e=>e.textContent==='distant-test');
        if(!el||el.style.display==='none')throw Error('Distant label flickered at '+distance+' sample '+i);
        checks++;
      }
      // Targets behind the camera and beyond the true far plane stay hidden.
      for(const z of [1e12,-2e14]){
        W.bodies[0].pos=W.toSys(new THREE.Vector3(0,0,z).applyMatrix4(W.camera.matrixWorld));
        W.updateLabels(true,host,null);
        if([...host.children].find(e=>e.textContent==='distant-test').style.display!=='none')throw Error('Distant clipping failed');
      }
      return {checks,passed:true};
    }finally{W.bodies=original;W.labelOccluder=occluder;W.clearLabels();}
  })()`);
  console.log('Distant labels',distantLabels);

  await evaluate("StarMap.open('system','sol')");await sleep(900);
  await evaluate(`(()=>{
    const h=StarMap.debug().hits.find(h=>h.key==='sol/jupiter'),cv=document.getElementById('smapCv'),r=cv.getBoundingClientRect();
    cv.dispatchEvent(new WheelEvent('wheel',{clientX:r.left+h.x,clientY:r.top+h.y,deltaY:-600,cancelable:true}));
  })()`);await sleep(900);
  const satellites=await evaluate('StarMap.debug()');
  if(satellites.level!=='planet'||satellites.focus.body!=='jupiter'||!['io','europa','ganymede','callisto'].every(id=>satellites.hits.some(h=>h.key==='sol/'+id)))throw Error('Zoom did not reveal Jupiter moons');
  await evaluate(`(()=>{
    const h=StarMap.debug().hits.find(h=>h.key==='sol/callisto'),cv=document.getElementById('smapCv'),r=cv.getBoundingClientRect();
    cv.setPointerCapture=()=>{};
    cv.dispatchEvent(new PointerEvent('pointerdown',{clientX:r.left+h.x,clientY:r.top+h.y,pointerId:1}));
    cv.dispatchEvent(new PointerEvent('pointerup',{clientX:r.left+h.x,clientY:r.top+h.y,pointerId:1}));
  })()`);
  if(!await evaluate("document.getElementById('smapSide').textContent.includes('卡利斯托')"))throw Error('Moon selection failed');
  await capture('jupiter-moons-map');
  await evaluate('StarMap.up()');await sleep(500);
  if(await evaluate("StarMap.debug().level!=='system'"))throw Error('Cannot return to solar system');
  console.log('Zoom to Jupiter satellites and select Callisto PASS');
  const status=await evaluate('TextureAssets.status()');
  if(status.bytes>384*1024*1024)throw Error('Texture cache exceeded budget');
  for(let i=0;i<shots.length;i+=2){
    const distance=Math.hypot(...shots[i].shipInCamera.map((x,k)=>x-shots[i+1].shipInCamera[k]));
    if(distance>3)throw Error('Arrival camera discontinuity: '+distance+'m');
  }
  // A deliberately absent file exercises file:// script errors, without renaming assets.
  await evaluate('TEX_LOW.__missing=TEX_LOW.mercury;TEXTURE_MANIFEST.__missing={levels:[{url:"data/texture-lod/__missing-test-file.js",width:2048,height:1024}]};');
  const fallback=await evaluate('TextureAssets.request("__missing",1)');
  const fallbackMap=await evaluate('TextureAssets.status().maps.find(m=>m.key==="__missing")');
  if(fallback!==false||fallbackMap.width!==512)throw Error('Missing HD map did not preserve preview: '+JSON.stringify({fallback,fallbackMap}));

  const report={maxDecelerationTurnDegrees:maxDecelerationTurn*180/Math.PI,surveyChecks,startup,status,requests,flights,arrivalBoundary:shots,fallback:{passed:true,map:fallbackMap},errors};
  if(!process.argv.includes('--timing'))writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  if(errors.length)throw Error('Browser errors: '+JSON.stringify(errors).slice(0,2000));
  console.log('PASS',output);
  }
}finally{if(ws)ws.close();chrome.kill();await sleep(500);rmSync(profile,{recursive:true,force:true});}
