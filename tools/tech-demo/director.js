// Injected into main.js's closure by render.mjs; the playable game is unchanged.
function setupFilm() {
  FILM = true;
  document.body.classList.add('film');
  const style = document.createElement('style');
  style.textContent = `
    body.film .hud, #labels, #caption, #intro, #panel { display:none!important }
    #cinema {position:fixed;inset:0;pointer-events:none;color:#edf8ff;font-family:"PingFang SC",sans-serif;overflow:hidden}
    .matte {position:absolute;left:0;right:0;height:74px;background:#02070c;z-index:3}
    .matte.top {top:0;border-bottom:1px solid #96def32b}.matte.bottom {bottom:0;border-top:1px solid #96def32b}
    .mast {position:absolute;left:82px;right:82px;top:24px;display:flex;justify-content:space-between;font:17px "SF Mono",Menlo,monospace;letter-spacing:3px;color:#b6d4dd}
    .mast b {color:#7ce9ff;font-weight:400}.mast .dot {display:inline-block;width:6px;height:6px;border-radius:50%;background:#84efff;margin-right:14px;box-shadow:0 0 14px #68dfff}
    .bottomline {position:absolute;left:82px;right:82px;top:23px;display:flex;justify-content:space-between;font:14px Menlo,monospace;letter-spacing:2px;color:#7d9ba9}
    #progress {position:absolute;bottom:0;left:0;height:2px;background:#83e7fa;box-shadow:0 0 12px #6cdfff}
    .shade {position:absolute;inset:74px 0;background:linear-gradient(0deg,#020b16e8 0%,#05101c92 16%,transparent 45%),linear-gradient(90deg,#02101b30,transparent 55%)}
    .edge {position:absolute;inset:108px 48px;border:1px solid #9aeaff12;clip-path:polygon(0 0,4% 0,4% 1px,1px 1px,1px 6%,0 6%,0 0,100% 0,100% 6%,calc(100% - 1px) 6%,calc(100% - 1px) 1px,96% 1px,96% 0,100% 0,100% 100%,96% 100%,96% calc(100% - 1px),calc(100% - 1px) calc(100% - 1px),calc(100% - 1px) 94%,100% 94%,100% 100%,0 100%,0 94%,1px 94%,1px calc(100% - 1px),4% calc(100% - 1px),4% 100%,0 100%)}
    .smalllabel {position:absolute;left:84px;top:108px;font:14px Menlo,monospace;letter-spacing:3px;color:#b7e2ea;text-shadow:0 1px 6px #000}
    #section {position:absolute;left:85px;bottom:142px;max-width:1400px}
    #eyebrow {display:flex;align-items:center;gap:16px;font:16px Menlo,monospace;letter-spacing:4px;color:#85e6fa;margin-bottom:18px}
    #eyebrow:before {content:'';display:block;width:42px;height:2px;background:#85e6fa;box-shadow:0 0 12px #85e6fa66}
    #headline {font-size:59px;line-height:1.25;font-weight:500;letter-spacing:5px;text-shadow:0 3px 22px #0008}
    #deck {margin-top:20px;font-size:22px;letter-spacing:3px;font-weight:300;color:#bfd0db}
    #section.hero #headline {font-size:108px;font-weight:500;letter-spacing:20px}
    #section.hero #deck {font:19px Menlo,monospace;letter-spacing:7px;color:#cee4ec}
    #metrics {position:absolute;right:87px;bottom:145px;display:flex;gap:47px;text-align:left}
    .metric {border-top:1px solid #92ddf367;padding-top:16px;min-width:125px}
    .metric strong {font:35px Menlo,monospace;font-weight:400;color:#e1f6ff}.metric i {font:15px Menlo,monospace;color:#83b1c5;font-style:normal;margin-left:7px}
    .metric span {display:block;font:12px Menlo,monospace;color:#88a5b5;letter-spacing:2px;margin-top:11px}
    #reticle {position:absolute;right:92px;top:111px;width:76px;height:76px;border:1px solid #90eaff55;border-radius:50%;opacity:.7}
    #reticle:before {content:'';position:absolute;inset:12px;border:1px dashed #90eaff77;border-radius:50%}
    #reticle:after {content:'+';position:absolute;inset:0;text-align:center;line-height:72px;color:#9feaff;font:32px/72px Menlo}
    #transition {position:absolute;inset:74px 0;background:#03121d;opacity:0;z-index:2}
    #endcredit {position:absolute;right:86px;bottom:145px;text-align:right;font:14px/2 Menlo,monospace;color:#9eb7c4;letter-spacing:1px;display:none}
  `;
  document.head.appendChild(style);
  const el = document.createElement('div'); el.id='cinema';
  el.innerHTML = `<div class="shade"></div><div class="edge"></div><div class="smalllabel" id="location"></div><div id="reticle"></div>
    <div id="section"><div id="eyebrow"></div><div id="headline"></div><div id="deck"></div></div><div id="metrics"></div>
    <div id="endcredit">A SPACE LIFE & EXPLORATION DEMO<br>星环站 · 轨道生活<br>实机画面 / GAMEPLAY CAPTURE</div>
    <div id="transition"></div><div class="matte top"><div class="mast"><span><b>星环站</b> / ORBITAL LIFE</span><span><i class="dot"></i>MISSION PREVIEW <b>001</b></span></div></div>
    <div class="matte bottom"><div class="bottomline"><span id="chapter"></span><span id="timecode"></span></div><div id="progress"></div></div>`;
  document.body.appendChild(el);
  const local = (x,y,z,tx,ty,tz) => {cam.position.set(x,y,z);cam.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(cam.position,new V3(tx,ty,tz),new V3(0,1,0)));};
  const ease = u => smooth(clamp(u));
  pickDay(-250); G.warp=1; const epoch=G.t;
  const stationShot = inside => {
    if(G.sys!=='sol') {enterSystem('sol');setAF(stationFrame);AF.group.add(ship.group);ship.group.position.copy(DOCK_POS);ship.group.quaternion.copy(DOCK_Q);G.t=epoch;}
    cruise=null;burning=false;beta.set(0,0,0);filmDim=inside;G.mode='film';stationFrame.group.add(cam);
  };
  const orbit = (system,body) => {
    cruise=null;burning=false;beta.set(0,0,0);filmDim=false;G.mode='film';G.docked=false;
    if(G.sys!==system)enterSystem(system);
    setAF(frameFor(body));AF.update(G.t);AF.group.add(ship.group);ship.group.position.set(0,0,0);ship.group.quaternion.copy(ORBIT_Q);AF.group.add(cam);G.shipBody=body;G.warp=0;
  };
  const orbitCam = (yaw,pitch,d) => {const c=ship.group.position,cp=Math.cos(pitch);local(c.x+d*cp*Math.sin(yaw),c.y+d*Math.sin(pitch),c.z+d*cp*Math.cos(yaw),c.x,c.y,c.z);};
  const shots = [
    {d:6,chapter:'01 / HOME IN ORBIT',loc:'LOW EARTH ORBIT  /  408 KM',eye:'A LIFE ABOVE THE WORLD',title:'星环站',deck:'ORBITAL LIFE  /  星球之上，生活继续',hero:true,metrics:[['408','KM','ORBIT ALTITUDE'],['92.7','MIN','ORBITAL PERIOD']],init:()=>stationShot(false),move:u=>{const a=.78+u*.4;local(Math.cos(a)*138+12,44-u*8,Math.sin(a)*138,12,-2,0);}},
    {d:4,chapter:'01 / HOME IN ORBIT',loc:'STATION EXTERIOR  /  SOLAR ARRAYS',eye:'01 — HOME IN ORBIT',title:'把家，安在轨道上',deck:'太阳翼掠过晨昏线，新的轨道日开始。',init:()=>stationShot(false),move:u=>local(lerp(65,42,u),lerp(31,24,u),lerp(88,73,u),10,1,0)},
    {d:5,chapter:'02 / LIFE IN MICROGRAVITY',loc:'HABITAT  →  UNITY NODE  →  LAB',eye:'02 — LIFE IN MICROGRAVITY',title:'失重，也有日常',deck:'穿过舱段，在太空安顿每一天。',init:()=>stationShot(true),move:u=>{const x=lerp(-7.7,5.8,ease(u));local(x,.05+Math.sin(u*5)*.035,Math.sin(u*4)*.08,x+3,0,Math.sin(u*5+1)*.26);}},
    {d:4,chapter:'02 / LIFE IN MICROGRAVITY',loc:'CUPOLA  /  EARTH OBSERVATION',eye:'THE VIEW FROM HOME',title:'窗外，就是整个世界',deck:'从穹顶舱，看地球缓缓转过。',init:()=>stationShot(true),move:u=>local(.1,-1.72,.05,.1+Math.sin(u*1.5)*.6,-3.2,.8-u)},
    {d:3,chapter:'02 / LIFE IN MICROGRAVITY',loc:'GREENHOUSE  /  LIFE SUPPORT',eye:'GROW BEYOND EARTH',title:'让生命，在太空生长',deck:'种植 · 照料 · 收获',init:()=>stationShot(true),move:u=>{const z=lerp(2,4.5,ease(u));local(.25,.3,z,-1.2,-.25,z+1.6);}},
    {d:3,chapter:'02 / LIFE IN MICROGRAVITY',loc:'LABORATORY  /  MICROGRAVITY SCIENCE',eye:'CURIOSITY NEVER RESTS',title:'在微重力中，探索未知',deck:'每一次实验，都是下一次远航的起点。',init:()=>stationShot(true),move:u=>local(lerp(5.35,4.4,ease(u)),.05,lerp(.7,.35,ease(u)),4,-.02,-.9)},
    {d:4,chapter:'03 / DEPARTURE',loc:'VOYAGER  /  UNDOCKING SEQUENCE',eye:'03 — DEPARTURE',title:'离开熟悉的轨道',deck:'「远航者号」准备就绪。',init:()=>{stationShot(false);G.docked=false;},move:u=>{ship.group.position.set(DOCK_POS.x+u*u*30,0,0);ship.group.quaternion.copy(DOCK_Q);local(DOCK_POS.x-22+u*6,13,40,ship.group.position.x-28,0,0);}},
    {d:4,chapter:'03 / DEPARTURE',loc:'FUSION DRIVE  /  ACCELERATION',eye:'DESTINATION: THE UNKNOWN',title:'点燃引擎，驶向远方',deck:'1g 聚变推进 · 加速、翻转、减速',metrics:[['1','g','FUSION DRIVE']],init:()=>{filmDim=false;setMode('pilot');startCruise('sol/moon');cruise.f=.07;cruise.dur=14;},move:()=>{}},
    {d:4,chapter:'04 / BEYOND THE HORIZON',loc:'LUNA  /  PARKING ORBIT',eye:'04 — BEYOND THE HORIZON',title:'下一站，月球',deck:'抵近环形山，沿晨昏线飞行。',init:()=>orbit('sol','moon'),move:u=>orbitCam(.6+u*.65,.62,135)},
    {d:5,chapter:'04 / BEYOND THE HORIZON',loc:'SATURN  /  RING PLANE',eye:'WORLDS WORTH EXPLORING',title:'越过行星的边界',deck:'穿行太阳系，邂逅土星的光环。',init:()=>orbit('sol','saturn'),move:u=>orbitCam(1.65+u*.8,.83,170)},
    {d:4,chapter:'04 / BEYOND THE HORIZON',loc:'TRAPPIST-1 e  /  EXOPLANET',eye:'ANOTHER STAR. ANOTHER POSSIBILITY.',title:'驶向另一颗恒星',deck:'约 40.7 光年外，想象新的世界。',metrics:[['40.7','LY','DISTANT SYSTEM']],init:()=>orbit('trappist1','trappist1_e'),move:u=>orbitCam(.9+u*.6,.56,150)},
    {d:6,chapter:'XINGHUAN / ORBITAL LIFE',loc:'BACK TO EARTH  /  YOUR JOURNEY BEGINS',eye:'在轨生活 · 驶向群星',title:'星环站',deck:'MAKE A HOME.  EXPLORE THE UNIVERSE.',hero:true,end:true,init:()=>stationShot(false),move:u=>{const a=1.25+u*.23;local(Math.cos(a)*148+12,43,Math.sin(a)*148,12,-2,0);}},
  ];
  let total=0; for(const s of shots){s.start=total;total+=s.d;}
  let cur=-1;
  window.film={frames:Math.round(total*30),duration:total,shots:shots.map(s=>({start:s.start,duration:s.d,title:s.title})),step(i){
    const t=i/30;let k=shots.length-1;while(k>0&&t<shots[k].start)k--;
    const s=shots[k],dt=t-s.start,u=dt/s.d;
    if(k!==cur){cur=k;s.init();$('section').className=s.hero?'hero':'';$('eyebrow').textContent=s.eye;$('headline').textContent=s.title;$('deck').textContent=s.deck;$('location').textContent=s.loc;$('chapter').textContent=s.chapter;$('metrics').innerHTML=(s.metrics||[]).map(m=>`<div class="metric"><strong>${m[0]}</strong><i>${m[1]}</i><span>${m[2]}</span></div>`).join('');$('endcredit').style.display=s.end?'block':'none';}
    cam.fov=58;cam.updateProjectionMatrix();s.move(u);frame();
    const enter=ease((dt-.12)/.65),leave=ease((s.d-dt)/.35),alpha=enter*leave;
    $('section').style.opacity=alpha;$('section').style.transform=`translateY(${(1-enter)*18}px)`;$('metrics').style.opacity=alpha;$('endcredit').style.opacity=alpha;
    $('reticle').style.transform=`rotate(${t*7}deg)`;$('progress').style.width=`${t/total*100}%`;
    $('timecode').textContent=`GAMEPLAY CAPTURE  /  ${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t)%60).padStart(2,'0')}:${String(i%30).padStart(2,'0')}`;
    let fade=0;if(k===0)fade=1-ease(t/1.1);else fade=Math.max(0,1-dt/.22)*.8;if(s.end)fade=Math.max(fade,1-ease((total-t)/1.1));
    $('transition').style.opacity=fade;return {i,shot:k,title:s.title};
  }};
}
