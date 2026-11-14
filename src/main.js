'use strict';
/* 游戏主体：状态、操控（舱内 / 出舱 / 驾驶 / 巡航）、生活与空间站系统模拟、界面。 */
(function () {
  const $ = id => document.getElementById(id);
  const SAVE_KEY = 'xinghuan-3d-v1', Q = THREE.Quaternion;
  const DOCK_POS = new V3(21.0 + M.SHIP_NOSE, -0.1, 0), DOCK_Q = new Q().setFromAxisAngle(new V3(0, 1, 0), Math.PI / 2);
  const WARPS = [1, 10, 100, 1000];
  // 抵达停泊轨道时的姿态：机头朝飞行方向并下俯，让天体出现在视野里
  const ORBIT_Q = new Q().setFromRotationMatrix(new THREE.Matrix4().lookAt(new V3(), new V3(1, -0.8, 0.25), new V3(0, 1, 0)));
  const params = new URLSearchParams(location.search), DBG = params.get('dbg');

  let G, station, ship, cam, stationFrame = null, AF = null, cruise = null, act = null, panel = null, auto = null;
  const P = { pos: new V3(-3.2, 0, 0), vel: new V3(), yaw: -Math.PI / 2, pitch: 0, q: new Q() };
  const SV = new V3();            // 飞船相对参考系的速度
  let FILM = false, filmDim = false, shadowT = 5, photo = null, insideState = null;
  let survey = false, lockedBody = null, nearby = null, approachLimited = false;
  const surveyInput={forward:0,side:0,height:0};
  let shipView = 0, lastSave = 0, hudT = 0, screenT = 0, beta = new V3();

  function newGame() {
    return { v: 1, t: Date.now() / 1000 - J2000_UNIX, sys: 'sol', mode: 'iva', warp: 0,
      needs: { energy: 85, food: 55, health: 92, mood: 65 }, res: { bat: 45, o2: 28, water: 90, meals: 24, fresh: 0 },
      credits: 0, plantG: 0.35, tendedAt: -1e12, damage: -1, nextFault: 0, flags: {}, scanned: {}, step: 0,
      docked: true, shipBody: null, supplyAt: 0, shipTime: 0, cupolaAt: -1e12 };
  }
  function load() {
    try { const d = JSON.parse(localStorage.getItem(SAVE_KEY)); if (d && d.v === 1 && d.needs && d.res && SYSTEMS.some(s => s.id === d.sys)) return d; } catch (e) { }
    return newGame();
  }
  function captureFlight(){
    if(!AF||G.mode!=='pilot'||cruise)return null;
    return {v:1,sys:G.sys,body:G.shipBody,phase:AF.th0,position:ship.group.position.toArray(),rotation:ship.group.quaternion.toArray(),velocity:SV.toArray(),
      camera:cam.position.toArray(),cameraQ:cam.quaternion.toArray(),fov:cam.fov,survey,shipView,lock:lockedBody?.def.id||null,photo:photo?{...photo}:null,hidden:!!ship.visiblePhoto};
  }
  function restoreFlight(f){
    const vector=(a,n)=>Array.isArray(a)&&a.length===n&&a.every(Number.isFinite);
    const quaternion=a=>vector(a,4)&&Math.abs(Math.hypot(...a)-1)<.01;
    if(!f||f.v!==1||f.sys!==G.sys||f.body!==G.shipBody||!Number.isFinite(f.phase)||!vector(f.position,3)||!quaternion(f.rotation)||!vector(f.velocity,3)||!vector(f.camera,3)||!quaternion(f.cameraQ)||!Number.isFinite(f.fov)||f.fov<2||f.fov>100)return false;
    if(f.photo&&(!['yaw','pitch','dist','fov'].every(k=>Number.isFinite(f.photo[k]))||f.photo.dist<1))return false;
    AF.th0=f.phase;AF.update(G.t);ship.group.position.fromArray(f.position);ship.group.quaternion.fromArray(f.rotation).normalize();SV.fromArray(f.velocity);
    survey=!!f.survey&&!G.docked&&AF!==stationFrame;shipView=f.shipView===1?1:0;lockedBody=survey&&f.lock?W.byId[f.lock]||null:null;
    photo=f.photo?{...f.photo}:null;document.body.classList.toggle('photo',!!photo);
    (photo?AF.group:ship.group).add(cam);cam.position.fromArray(f.camera);cam.quaternion.fromArray(f.cameraQ).normalize();cam.fov=f.fov;cam.updateProjectionMatrix();
    ship.visiblePhoto=!!photo&&!!f.hidden;ship.group.visible=!ship.visiblePhoto;helpLine();
    if(photo)$('photoHint').textContent='观景模式 · P 返回驾驶 · K 隐藏飞船 · J 保存照片 · 滚轮调整距离';
    return true;
  }
  let saveFailed=false;
  function save() {
    if (DBG || cruise||!G) return;
    G.flight=captureFlight();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(G));saveFailed=false; }
    catch { if(!saveFailed){saveFailed=true;toast('自动保存失败：浏览器存储不可用，请暂时不要关闭页面','warn');} }
  }
  addEventListener('pagehide',save);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)save();for(const k in keys)keys[k]=false;mdx=mdy=0;});

  /* ---------- 提示 ---------- */
  function toast(msg, cls) {
    const el = document.createElement('div'); el.className = 'toast ' + (cls || ''); el.textContent = msg; $('toasts').appendChild(el);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => el.remove(), 6000);
  }
  const warned = {};
  function warn(key, cond, msg) { if (cond && !warned[key]) { toast(msg, 'warn'); warned[key] = true; } else if (!cond) warned[key] = false; }

  /* ---------- 参考系与恒星系 ---------- */
  function enterSystem(id) {
    if (stationFrame) { W.root.remove(stationFrame.group); stationFrame = null; }
    W.clearLabels(); W.setSystem(id); G.sys = id; W.updateBodies(G.t);
    if (id === 'sol') { stationFrame = new OrbitFrame(W.byId.earth, 4.08e5, 51.64); stationFrame.group.add(station.group); W.root.add(stationFrame.group); stationFrame.update(G.t); }
  }
  function frameFor(bodyId) {
    if (!bodyId) return stationFrame;
    const b = W.byId[bodyId], f = new OrbitFrame(b, parkingAlt(b.def), 28);
    faceDay(f); f.update(G.t); return f;
  }
  /* 让停泊轨道的当前位置落在昼半球上空（抵达时不至于一片漆黑） */
  function faceDay(f) { if (f !== stationFrame && f.body.def.kind !== 'star') f.faceAt(G.t + 300, W.starBodies[0].pos.clone().sub(f.body.pos).normalize()); }
  function setAF(f) {
    if (AF && AF !== stationFrame && AF !== f) W.root.remove(AF.group);
    AF = f; if (f !== stationFrame) W.root.add(f.group);
  }
  const atStation = () => AF === stationFrame && !cruise;

  function setMode(m) {
    G.mode = m;document.body.dataset.mode=m;
    if (m === 'iva' || m === 'eva') stationFrame.group.add(cam);
    else if (m === 'pilot') { ship.group.add(cam); pilotCam(); }
    else W.root.add(cam);
    cam.up.set(0, 1, 0);
    $('visor').style.display = m === 'eva' ? 'block' : 'none';
    $('cross').style.display = (m === 'iva' || m === 'eva') ? 'block' : 'none';
    $('cruise').style.display = m === 'cruise' ? 'block' : 'none';
    helpLine();
  }
  function pilotCam() { if (shipView === 0) { cam.position.set(0, 17, 66); cam.rotation.set(-0.2, 0, 0); } else { cam.position.set(0, 3.3, -26.5); cam.rotation.set(-0.06, 0, 0); } }
  function helpLine() {
    $('help').textContent = {
      iva: '鼠标 转头 · WASD 飘行 · 空格/C 上/下 · F 互动 · P 观景 · M 星图 · [ ] 时间流速 · H 帮助',
      eva: '鼠标 转向 · WASD/空格/C 喷气机动 · Q/E 滚转 · X 刹停 · F 互动',
      pilot: 'Esc 释放鼠标后可点击驾驶按钮 · L 锁定后 A/D 环绕 · H 全部按键',

      cruise: '巡航中……',
    }[G.mode];
  }

  function openSettings(){
    openPanel('settings',`<div class="card"><h2>画质与声音</h2><p>低画质减少渲染分辨率与抗锯齿开销；不改变飞行、碰撞或探索进度。</p>
      <label for="qualitySelect">画质档位 </label><select id="qualitySelect" class="btn ghost"><option value="performance">流畅</option><option value="balanced">均衡</option><option value="high">清晰</option></select>
      <p class="dim">当前渲染 ${W.renderer.domElement.width} × ${W.renderer.domElement.height} · 贴图缓存约 ${Math.round(TextureAssets.status().bytes/1048576)} MB</p>
      <p>音效默认关闭。开启后播放舱内引擎与操作提示，系统有本地中文语音时播放抵达播报。</p>
      <div class="btns"><button class="btn ghost" data-a="sound">开关音效 N</button><button class="btn" data-a="close">返回</button></div></div>`);
    $('qualitySelect').value=W.quality;
    $('qualitySelect').onchange=e=>{W.setQuality(e.target.value);openSettings();};
  }
  document.addEventListener('click',e=>{
    const button=e.target.closest('[data-flight]');if(!button||button.disabled||panel)return;
    if(button.dataset.flight==='KeyX'){SV.set(0,0,0);surveyInput.forward=0;burning=false;}
    else onKey(button.dataset.flight);
    hud();
  });
  function flightHUD(){
    if(G.mode!=='pilot')return;
    const n=!G.docked?nearestBody():null,target=lockedBody||n?.body;
    $('lockButton').textContent=lockedBody?'解除锁定 L':'锁定 L';$('lockButton').setAttribute('aria-pressed',String(!!lockedBody));
    $('assistButton').textContent=survey?'切精细驾驶 B':'切自由飞行 B';$('assistButton').setAttribute('aria-pressed',String(survey));
    for(const b of $('flightControls').querySelectorAll('button'))b.disabled=G.docked&&['KeyL','KeyB','KeyG','KeyX'].includes(b.dataset.flight);
    $('flightTargetName').textContent=G.docked?'已对接 · U 脱离':(lockedBody?'已锁定 · ':'附近 · ')+(target?.def.name||'深空');
    if(!target){$('flightTelemetry').textContent='按 U 脱离对接后开始飞行';return;}
    const relative=bodyLocal(target).sub(ship.group.position),closing=SV.dot(relative.clone().normalize());
    $('flightTelemetry').textContent=(closing>=0?'接近 ':'远离 ')+fmtSpeed(Math.abs(closing))+' · '+(approachLimited?'接近限速中':'表面保护开启');
    const view=photo?cam.quaternion.clone():ship.group.quaternion.clone().multiply(cam.quaternion);relative.applyQuaternion(view.invert());
    const centered=relative.z<0&&Math.hypot(relative.x,relative.y)<-relative.z*.12;
    $('flightDirection').textContent=centered?'◎':relative.z>0?'↶':'↑';
    $('flightDirection').style.transform=centered||relative.z>0?'none':`rotate(${Math.atan2(relative.x,relative.y)}rad)`;
    $('flightDirection').title=centered?'目标在正前方':relative.z>0?'目标在身后':'目标方向';
  }
  /* ---------- 输入 ---------- */
  const keys = {}; let mdx = 0, mdy = 0;
  const canvas = $('c');
  addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    if (!keys[e.code]) onKey(e.code);
    keys[e.code] = true;
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  canvas.addEventListener('click', () => { if (!panel && $('intro').style.display === 'none') canvas.requestPointerLock && canvas.requestPointerLock(); });
  addEventListener('mousemove', e => { if (document.pointerLockElement === canvas) { mdx += e.movementX; mdy += e.movementY; } });

  function onKey(c) {
    if ($('intro').style.display !== 'none') return;
    if (c === 'Escape') { if (panel) closePanel(); return; }
    if (c === 'KeyM') { panel === 'nav' ? closePanel() : openNav(); return; }
    if (c === 'KeyH') { $('helpbox').classList.toggle('hidden'); return; }
    if (panel === 'nav' && c === 'Backspace') { StarMap.up(); return; }
    if (panel || act || cruise) return;
    if (c === 'KeyP' && G.mode !== 'film') { togglePhoto(); return; }
    if(c==='KeyL'&&G.mode==='pilot'){toggleLock();return;}
    if(c==='KeyN'){FlightAudio.toggle();return;}
    if(photo&&c==='KeyK'){ship.visiblePhoto=!ship.visiblePhoto;ship.group.visible=!ship.visiblePhoto;return;}
    if(photo&&c==='KeyJ'){capturePhoto();return;}
    if(c==='KeyB'&&G.mode==='pilot'){toggleSurvey();return;}
    if (photo) { if (c === 'KeyT') photo.pitch = photo.pitch > 1 ? 0.3 : 1.3; return; }
    if (c === 'BracketRight' || c === 'Period') { G.warp = Math.min(WARPS.length - 1, G.warp + 1); toast('时间流速 ×' + WARPS[G.warp]); }
    if (c === 'BracketLeft' || c === 'Comma') { G.warp = Math.max(0, G.warp - 1); toast('时间流速 ×' + WARPS[G.warp]); }
    if (c === 'KeyF') interact();
    if (G.mode === 'pilot') {
      if (c === 'KeyU' && G.docked) undock();
      if (c === 'KeyV') {  shipView = 1 - shipView; pilotCam(); }
      if (c === 'KeyG') scan();
    }
  }

  /* ---------- 面板 ---------- */
  function openPanel(name, html) { panel = name; $('panel').innerHTML = html; $('panel').classList.remove('hidden'); if (document.pointerLockElement) document.exitPointerLock(); }
  function closePanel() { panel = null; $('panel').classList.add('hidden'); }
  $('panel').addEventListener('click', e => {
    const t = e.target.closest('[data-a]'); if (!t) return;
    const a = t.dataset.a, v = t.dataset.v;
    if (a === 'close') closePanel();
    else if (a === 'dest') { navSel = v; StarMap.refresh(); }
    else if (a === 'settings') openSettings();
    else if (a === 'sound') FlightAudio.toggle();
    else if (a === 'journal') openJournal();
    else if (a === 'go') startCruise(navSel);
    else if (a === 'supply') orderSupply();
    else if (a === 'reset') { if (confirm('清空存档并重新开始？')) { localStorage.removeItem(SAVE_KEY); location.reload(); } }
  });

  /* ---------- 生活：活动 ---------- */
  const ACTS = {
    sleep: { name: '睡眠中……（国际空间站乘员每天安排 8.5 小时睡眠）', dur: 8 * 3600, real: 6, fade: true, done() { G.needs.energy = 100; G.needs.mood = clamp(G.needs.mood + 10, 0, 100); G.flags.slept = true; toast('睡醒了。体力恢复。这一觉里空间站绕了地球 ' + (8 * 3600 / stationFrame.period).toFixed(1) + ' 圈'); } },
    eat: { name: '用餐', dur: 1800, real: 3, done() { const n = G.needs; if (G.res.fresh > 0) { G.res.fresh--; n.mood = clamp(n.mood + 15, 0, 100); toast('吃了一份加了新鲜蔬菜的餐食，心情大好'); } else { G.res.meals--; n.mood = clamp(n.mood + 5, 0, 100); toast('吃了一份复水食品'); } n.food = clamp(n.food + 40, 0, 100); G.flags.ate = true; } },
    exercise: { name: '跑步机锻炼（微重力下每月骨质流失约 1–1.5%，必须每天锻炼）', dur: 3600, real: 4, done() { const n = G.needs; n.health = clamp(n.health + 9, 0, 100); n.energy = clamp(n.energy - 10, 0, 100); n.food = clamp(n.food - 6, 0, 100); n.mood = clamp(n.mood + 5, 0, 100); G.flags.exercised = true; toast('锻炼完成，健康 +9'); } },
    exp: { name: '微重力流体物理实验', dur: 7200, real: 4, done() { G.credits += 8; G.needs.energy = clamp(G.needs.energy - 6, 0, 100); G.flags.exp = true; toast('实验数据已下传地面，科研点 +8'); } },
    garden: { name: '照料水培作物', dur: 1200, real: 3, done() { G.tendedAt = G.t; G.res.water = Math.max(0, G.res.water - 0.5); G.needs.mood = clamp(G.needs.mood + 6, 0, 100); G.flags.garden = true; toast('补了营养液，检查了根系。作物长势：' + Math.round(G.plantG * 100) + '%'); } },
    suitup: { name: '穿舱外航天服 · 纯氧预呼吸（排出血液中的氮，防止减压病）', dur: 2 * 3600, real: 4, done() { startEVA(); } },
    repair: { name: '更换太阳翼配电盒', dur: 1800, real: 4, done() { G.damage = -1; G.credits += 30; G.flags.repaired = true; G.nextFault = G.t + (3 + Math.random() * 4) * DAY; G.needs.mood = clamp(G.needs.mood + 10, 0, 100); toast('维修完成，发电恢复正常。科研点 +30。返回气闸舱吧'); } },
    doff: { name: '气闸复压 · 脱航天服', dur: 1800, real: 3, done() { P.pos.set(0, 0, -3.6); P.vel.set(0, 0, 0); P.yaw = Math.PI; P.pitch = 0; setMode('iva'); toast('欢迎回到舱内'); } },
  };
  function startAct(id) {
    const a = ACTS[id]; act = { id, name: a.name, total: a.dur, left: a.dur, rate: a.dur / a.real, fade: a.fade };
    $('act').style.display = 'block'; $('actName').textContent = a.name; if (a.fade) $('fade').style.opacity = 1;
    P.vel.set(0, 0, 0);
  }
  function finishAct() {
    const a = ACTS[act.id]; act = null; $('act').style.display = 'none'; $('fade').style.opacity = 0; a.done(); save();
  }

  /* ---------- 互动 ---------- */
  const tv = new V3(), tv2 = new V3(), tq = new Q();
  function target() {
    if (G.mode === 'iva') {
      const f = tv.set(0, 0, -1).applyQuaternion(cam.quaternion); let best = null, bd = 0.72;
      for (const it of station.inter) { const d = tv2.copy(it.pos).sub(P.pos), L = d.length(); if (L > (it.r || 2.3)) continue; const k = L < 0.6 ? 1 : d.dot(f) / L; if (k > bd) { bd = k; best = it.id; } }
      return best;
    }
    if (G.mode === 'eva') {
      if (G.damage >= 0 && P.pos.distanceTo(repairPos()) < 4) return 'repair';
      if (P.pos.distanceTo(station.evaHatch) < 3.5) return 'hatch';
    }
    if (G.mode === 'pilot') { if (G.docked) return 'leave'; if (AF === stationFrame && ship.group.position.distanceTo(DOCK_POS) < 3000 && !auto) return 'autodock'; }
    return null;
  }
  const repairPos = () => station.repair[Math.max(0, G.damage)].clone();
  function label(id) {
    const r = G.res;
    return {
      sleep: '睡觉（8 小时）', eat: r.meals + r.fresh > 0 ? `用餐（储备 ${r.meals} 份，鲜蔬 ${r.fresh} 份）` : '食物吃完了！去站务终端申请补给',
      exercise: '跑步机锻炼（1 小时）', exp: '做实验（2 小时，科研点 +8）', terminal: '查看站务终端',
      garden: G.plantG >= 1 ? '收获蔬菜' : `照料作物（长势 ${Math.round(G.plantG * 100)}%）`,
      airlock: '出舱活动（准备需 2 小时）', dock: G.docked ? '登上「远航者号」' : '飞船不在港',
      repair: '维修配电盒（30 分钟）', hatch: '返回气闸舱', leave: '返回空间站（U 脱离对接）', autodock: '启动自动对接',
    }[id];
  }
  function interact() {
    const id = target(); if (!id) return;
    const n = G.needs;
    if (id === 'sleep') { if (n.energy > 80) return toast('你现在一点也不困'); startAct('sleep'); }
    else if (id === 'eat') { if (G.res.meals + G.res.fresh <= 0) return; if (n.food > 90) return toast('还不饿'); startAct('eat'); }
    else if (id === 'exercise') { if (n.energy < 15) return toast('太累了，先睡一觉'); startAct('exercise'); }
    else if (id === 'exp') { if (n.energy < 10) return toast('太累了，先睡一觉'); startAct('exp'); }
    else if (id === 'terminal') { G.flags.terminal = true; openTerminal(); }
    else if (id === 'garden') {
      if (G.plantG >= 1) { G.plantG = 0.05; G.res.fresh += 4; G.credits += 5; n.mood = clamp(n.mood + 8, 0, 100); G.flags.garden = true; toast('收获了 4 份新鲜生菜（国际空间站上的 Veggie 实验也种这个）。已重新播种'); }
      else startAct('garden');
    }
    else if (id === 'airlock') { if (n.energy < 20) return toast('出舱很耗体力，先休息'); startAct('suitup'); }
    else if (id === 'dock') { if (!G.docked) return; G.flags.boarded = true; setMode('pilot'); toast('已进入「远航者号」驾驶舱。U 脱离对接，M 打开导航'); }
    else if (id === 'repair') startAct('repair');
    else if (id === 'hatch') startAct('doff');
    else if (id === 'leave') { P.pos.set(10.2, 0, 0); station.lights.forEach(l => l.shadow.needsUpdate = true); P.vel.set(0, 0, 0); P.yaw = Math.PI / 2; P.pitch = 0; setMode('iva'); }
    else if (id === 'autodock') { auto = { t: 0, p0: ship.group.position.clone(), q0: ship.group.quaternion.clone(), dur: clamp(ship.group.position.distanceTo(DOCK_POS) / 12, 8, 22) }; SV.set(0, 0, 0); toast('自动对接程序启动：对准对接轴，以低于 0.1 m/s 的速度接触'); }
  }
  function startEVA() {
    P.pos.copy(station.evaHatch).add(tv.set(0, 0, 1.0)); P.vel.set(0, 0, 0); P.q.identity(); setMode('eva');
    G.needs.mood = clamp(G.needs.mood + 15, 0, 100); G.flags.eva = true;
    toast('舱门打开了。你正以每秒 7.66 公里和空间站一起飞行——所以感觉不到速度'); if (G.damage >= 0) toast('故障点在主桁架上方、两组太阳翼之间闪红灯的位置', 'warn');
  }
  function undock() { G.docked = false; SV.set(0.35, 0, 0); toast('已脱离对接，以 0.35 m/s 缓慢后退。M 打开导航'); }

  /* ---------- 操控 ---------- */
  function inside(p, m) { for (const b of station.boxes) if (p.x > b[0] + m && p.x < b[1] - m && p.y > b[2] + m && p.y < b[3] - m && p.z > b[4] + m && p.z < b[5] - m) return true; return false; }
  function axis(p, n) { return (keys[p] ? 1 : 0) - (keys[n] ? 1 : 0); }
  function look() { const kx = axis('ArrowRight', 'ArrowLeft') * 9, ky = axis('ArrowDown', 'ArrowUp') * 9, k = cam.fov / 62; const r = [(mdx + kx) * k, (mdy + ky) * k]; mdx = mdy = 0; return r; }

  /* 观景模式（P）：隐藏界面。舱内 / 出舱时原地环顾；驾驶时镜头脱离飞船，绕着它自由转动。滚轮拉远拉近，Z / X 望远镜变焦。 */
  function togglePhoto() {
    
    if (photo) { ship.group.visible=true;ship.visiblePhoto=false;photo = null; document.body.classList.remove('photo'); cam.fov = 62; cam.updateProjectionMatrix(); setMode(G.mode); return; }
    lockedBody=null;
    photo = { yaw: 0.7, pitch: 0.35, dist: 130, fov: 62 }; document.body.classList.add('photo');
    if (G.mode === 'pilot') AF.group.add(cam);
    $('photoHint').textContent = G.mode === 'pilot' ? '观景模式　鼠标 转镜头 · W/S 前后 · A/D 平移 · 空格/C 升降 · Shift 四倍加速（B 开关自由飞行）· 滚轮 拉近 · Z/X 变焦 · K 隐藏飞船 · J 保存照片 · P 退出' : '观景模式　鼠标 环顾 · Z / X 或滚轮 望远镜变焦 · K 隐藏飞船 · J 保存照片 · P 退出';
  }
  function updPhoto(dt) {
    photo.fov = clamp(photo.fov * Math.exp(axis('KeyX', 'KeyZ') * dt * 1.4), 2.5, 95);
    if (Math.abs(cam.fov - photo.fov) > 0.01) { cam.fov = photo.fov; cam.updateProjectionMatrix(); }
    if (G.mode !== 'pilot') return;
    const [lx, ly] = look(); photo.yaw -= lx * 0.004; photo.pitch = clamp(photo.pitch + ly * 0.004, -1.5, 1.5);
    const c = ship.group.position, d = photo.dist, cp = Math.cos(photo.pitch);
    cam.position.set(c.x + d * cp * Math.sin(photo.yaw), c.y + d * Math.sin(photo.pitch), c.z + d * cp * Math.cos(photo.yaw));
    cam.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(cam.position, c, tv.set(0, 1, 0)));
    if (G.docked) { ship.group.position.copy(DOCK_POS); ship.group.quaternion.copy(DOCK_Q); }
  }
  addEventListener('wheel', e => { if (!photo) return; if (G.mode === 'pilot') photo.dist = clamp(photo.dist * Math.exp(e.deltaY * 0.0012), 45, 20000); else photo.fov = clamp(photo.fov * Math.exp(e.deltaY * 0.001), 2.5, 95); }, { passive: true });

  function updIVA(dt) {
    const [lx, ly] = look(); P.yaw -= lx * 0.0022; P.pitch = clamp(P.pitch - ly * 0.0022, -1.5, 1.5);
    cam.rotation.set(P.pitch, P.yaw, 0, 'YXZ');
    const want = tv.set(axis('KeyD', 'KeyA'), 0, -axis('KeyW', 'KeyS')).applyQuaternion(cam.quaternion); want.y += axis('Space', 'KeyC');
    if (want.lengthSq() > 0) want.normalize().multiplyScalar(G.needs.energy < 10 ? 0.8 : 1.6);
    P.vel.lerp(want, 1 - Math.exp(-dt * 4));
    const s = tv2.copy(P.vel).multiplyScalar(dt), p = P.pos, m = 0.22;
    for (const ax of ['x', 'y', 'z']) { p[ax] += s[ax]; if (!inside(p, m)) { p[ax] -= s[ax]; P.vel[ax] *= -0.2; } }
    cam.position.copy(p);
    if (p.y < -1.5 && G.t - G.cupolaAt > 3 * 3600) { G.cupolaAt = G.t; G.flags.cupola = true; G.needs.mood = clamp(G.needs.mood + 12, 0, 100); toast('穹顶舱。宇航员把从这里俯瞰地球带来的心理变化叫作“总观效应”。心情 +12'); toast('按 P 进入观景模式：隐藏界面，Z / X 可像望远镜一样变焦'); }
  }
  function rotate6(q, dt, rate) {
    const [lx, ly] = look();
    q.multiply(tq.setFromAxisAngle(tv.set(0, 1, 0), -lx * rate)).multiply(tq.setFromAxisAngle(tv.set(1, 0, 0), -ly * rate)).multiply(tq.setFromAxisAngle(tv.set(0, 0, 1), axis('KeyQ', 'KeyE') * dt * 0.8)).normalize();
  }
  function brake(v, a, dt) { const L = v.length(); if (L < 1e-4) { v.set(0, 0, 0); return; } v.multiplyScalar(Math.max(0, L - a * dt) / L); }

  function updEVA(dt) {
    rotate6(P.q, dt, 0.0018); cam.quaternion.copy(P.q);
    const a = tv.set(axis('KeyD', 'KeyA'), axis('Space', 'KeyC'), -axis('KeyW', 'KeyS')).applyQuaternion(P.q).multiplyScalar(0.6);
    P.vel.addScaledVector(a, dt).addScaledVector(stationFrame.cw(P.pos, P.vel, tv2), dt);
    if (keys.KeyX) brake(P.vel, 0.8, dt);
    const old = tv2.copy(P.pos); P.pos.addScaledVector(P.vel, dt);
    if (station.blockers.some(b => b.distanceToPoint(P.pos) < 0.35)) { P.pos.copy(old); P.vel.multiplyScalar(-0.15); }   // 撞到舱体或桁架
    if (P.pos.length() > 400) { P.pos.copy(station.evaHatch).add(tv.set(0, 0, 1.5)); P.vel.set(0, 0, 0); toast('离站太远，SAFER 喷气背包已自动把你带回气闸舱外', 'warn'); }
    cam.position.copy(P.pos);
  }
  function toggleSurvey(){
    if(G.docked||AF===stationFrame||AF.body.def.kind==='star')return toast('自由飞行需先抵达行星或卫星轨道');
    lockedBody=null;survey=!survey;SV.set(0,0,0);surveyInput.forward=surveyInput.side=surveyInput.height=0;
    helpLine();if(photo)$('photoHint').textContent=survey?'自由飞行 · W/S 前后 · A/D 平移 · 空格/C 升降 · Shift 四倍加速 · 鼠标 转镜头 · B 精细驾驶 · K 隐藏飞船 · J 保存照片 · P 退出':'观景模式 · 鼠标 转镜头 · 滚轮 拉近 · B 开启自由飞行 · K 隐藏飞船 · J 保存照片 · P 退出';toast(survey?'自由飞行：鼠标转向，W/S 前后，A/D 平移，空格/C 升降，Shift 四倍加速':'精细驾驶：恢复姿控推力和 1g 主引擎');
  }
  function bodyLocal(body){return body.pos.clone().sub(AF.group.position).applyQuaternion(AF.group.quaternion.clone().invert());}
  function nearestBody(){
    if(!AF)return null;
    let best=null;
    for(const body of W.bodies){
      const center=bodyLocal(body),altitude=ship.group.position.distanceTo(center)-body.def.R;
      if(!best||altitude<best.altitude)best={body,center,altitude};
    }
    return best;
  }
  function adoptNearbyFrame(){
    if(!survey||G.mode!=='pilot'||G.docked||!AF||AF===stationFrame)return;
    const near=nearestBody();
    if(near.body===AF.body||near.body.def.kind==='star'||near.altitude>near.body.def.R*2)return;
    const old=AF,q=old.group.quaternion.clone(),position=ship.group.position.clone().applyQuaternion(q).add(old.group.position);
    const orientation=q.clone().multiply(ship.group.quaternion);
    const photoPosition=photo?cam.position.clone().applyQuaternion(q).add(old.group.position):null;
    const photoQ=photo?q.clone().multiply(cam.quaternion):null;
    const next=frameFor(near.body.def.id),inverse=next.group.quaternion.clone().invert();
    SV.applyQuaternion(q).applyQuaternion(inverse);
    setAF(next);next.group.add(ship.group);
    ship.group.position.copy(position).sub(next.group.position).applyQuaternion(inverse);
    ship.group.quaternion.copy(inverse).multiply(orientation);
    if(photo){next.group.add(cam);cam.position.copy(photoPosition).sub(next.group.position).applyQuaternion(inverse);cam.quaternion.copy(inverse).multiply(photoQ);
      const offset=cam.position.clone().sub(ship.group.position);photo.dist=offset.length();photo.yaw=Math.atan2(offset.x,offset.z);photo.pitch=Math.asin(clamp(offset.y/photo.dist,-1,1));
    }
    G.shipBody=near.body.def.id;TextureAssets.prefetch(near.body.def);
  }
  function surfaceMargin(body){
    // 150 m hull clearance on solid worlds; keep above the visible atmosphere
    // of gas giants, which have no landable surface.
    return Math.max(150,body.def.atmo?body.def.R*.004:150);
  }
  function toggleLock(){
    if(G.docked||AF===stationFrame||photo)return toast('请在行星附近的驾驶视角锁定目标');
    if(lockedBody){lockedBody=null;return toast('已解除锁定，自由转向');}
    nearby=nearestBody();
    const selected=navSel?.startsWith(G.sys+'/')?W.byId[navSel.split('/')[1]]:null;
    lockedBody=selected&&ship.group.position.distanceTo(bodyLocal(selected))<selected.def.R*20?selected:nearby.body;
    survey=true;SV.set(0,0,0);helpLine();
    toast('锁定 '+lockedBody.def.name+'：A/D 环绕，W/S 接近或远离，空格/C 改变纬度，L 解除');
    FlightAudio.cue();
  }
  function aimLocked(dt){
    if(!lockedBody||photo)return;
    const center=bodyLocal(lockedBody),pole=lockedBody.pole.clone().applyQuaternion(AF.group.quaternion.clone().invert());
    const q=new Q().setFromRotationMatrix(new THREE.Matrix4().lookAt(ship.group.position,center,pole));
    q.multiply(cam.quaternion.clone().invert());
    ship.group.quaternion.slerp(q,1-Math.exp(-dt*7));
  }
  function capturePhoto(){
    W.render();const a=document.createElement('a');a.download='星环站-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';
    a.href=W.renderer.domElement.toDataURL('image/png');a.click();toast('已保存观景照片');
  }
  function updSurvey(dt){
    if(!survey||G.mode!=='pilot'||G.docked||AF===stationFrame||panel)return;
    adoptNearbyFrame();nearby=nearestBody();approachLimited=false;
    const stop=keys.KeyX&&!photo,boost=(keys.ShiftLeft||keys.ShiftRight)?4:1;
    // Camera-relative free flight: move the ship itself, not the parking orbit.
    const viewQ=photo?cam.quaternion.clone():ship.group.quaternion.clone().multiply(cam.quaternion);
    const forward=axis('KeyW','KeyS')||((boost>1&&!keys.KeyA&&!keys.KeyD&&!keys.Space&&!keys.KeyC)?1:0);
    const input=new V3(axis('KeyD','KeyA'),axis('Space','KeyC'),-forward);
    if(input.lengthSq()>1)input.normalize();
    const speed=Math.min(CLIGHT*.9,Math.max(200,nearby.body.def.R*.65)*boost);
    const desired=input.applyQuaternion(viewQ).multiplyScalar(speed);
    const radial=ship.group.position.clone().sub(nearby.center).normalize();
    const clearance=Math.max(0,nearby.altitude-surfaceMargin(nearby.body));
    // Limit closing speed, leaving tangential movement responsive for orbiting.
    const closing=desired.dot(radial),safeClosing=Math.max(0,clearance*3);
    if(closing < -safeClosing){desired.addScaledVector(radial,-safeClosing-closing);approachLimited=true;}
    const localLimit=Math.max(50,Math.min(speed,Math.max(clearance,200)*8));
    if(desired.length()>localLimit){desired.setLength(localLimit);approachLimited=true;}
    if(lockedBody){
      const center=bodyLocal(lockedBody),out=ship.group.position.clone().sub(center).normalize();
      const pole=lockedBody.pole.clone().applyQuaternion(AF.group.quaternion.clone().invert());
      const right=new V3().crossVectors(out,pole).normalize();
      if(right.lengthSq()<.1)right.crossVectors(out,new V3(1,0,0)).normalize();
      const up=new V3().crossVectors(right,out).normalize();
      const lockedClearance=Math.max(0,ship.group.position.distanceTo(center)-lockedBody.def.R-surfaceMargin(lockedBody));
      const v=Math.min(speed,Math.max(50,lockedClearance*8));
      desired.copy(right).multiplyScalar(axis('KeyD','KeyA')*v).addScaledVector(up,axis('Space','KeyC')*v)
        .addScaledVector(out,-forward*(forward>0?Math.min(v,lockedClearance*3):v));
      if(desired.length()>v)desired.setLength(v);
    }
    if(stop)SV.set(0,0,0);else SV.lerp(desired,1-Math.exp(-dt*(desired.lengthSq()?10:14)));
    if(SV.length()<.01)SV.set(0,0,0);
    const inward=SV.dot(radial);
    if(inward < -safeClosing){SV.addScaledVector(radial,-safeClosing-inward);approachLimited=true;}
    const sg=ship.group,next=sg.position.clone().addScaledVector(SV,dt);
    if(lockedBody&&!forward){
      const center=bodyLocal(lockedBody),radius=sg.position.distanceTo(center);
      next.sub(center).normalize().multiplyScalar(radius).add(center);
    }
    protectFlight(sg.position,next,SV);
    if(photo)cam.position.add(next.clone().sub(sg.position));
    sg.position.copy(next);aimLocked(dt);surveyInput.forward=forward;
    burning=forward>0&&SV.length()>1;

  }
  // Sweep the entire movement segment against every body in the system.
  // Testing just the endpoint lets assisted flight tunnel through small moons.
  function protectFlight(start,next,velocity){
    const inverse=AF.group.quaternion.clone().invert();
    let hit=null,first=Infinity;
    const step=next.clone().sub(start),length=step.length();
    const direction=length>0?step.clone().divideScalar(length):new V3();
    for(const body of W.bodies){
      const center=body.pos.clone().sub(AF.group.position).applyQuaternion(inverse);
      const minimum=body.def.R+surfaceMargin(body);
      const relative=start.clone().sub(center),distance=relative.length();
      if(distance<minimum){
        // Recover saves made inside a surface without allowing a crossing.
        const normal=distance>1e-6?relative.divideScalar(distance):new V3(0,1,0);
        next.copy(center).addScaledVector(normal,minimum+1);
        velocity.set(0,0,0);return body;
      }
      if(!length)continue;
      const along=-relative.dot(direction);
      if(along<0)continue;
      const perpendicular=relative.clone().cross(direction).lengthSq();
      if(perpendicular>=minimum*minimum)continue;
      const entry=along-Math.sqrt(minimum*minimum-perpendicular);
      if(entry>=0&&entry<=length&&entry<first){first=entry;hit={body,center};}
    }
    if(hit){
      next.copy(start).addScaledVector(direction,Math.max(0,first-1));
      const normal=next.clone().sub(hit.center).normalize(),inward=velocity.dot(normal);
      if(inward<0)velocity.addScaledVector(normal,-inward);
      return hit.body;
    }
    return null;
  }
  let burning = false;
  function updPilot(dt) {
    const sg = ship.group; burning = false;

    if (G.docked) { sg.position.copy(DOCK_POS); sg.quaternion.copy(DOCK_Q); look(); return; }
    if (auto) {      // 自动对接：先对准轴线，再沿轴线缓慢靠拢
      auto.t += dt; const k = smooth(auto.t / auto.dur);
      sg.position.lerpVectors(auto.p0, DOCK_POS, k); sg.quaternion.slerpQuaternions(auto.q0, DOCK_Q, smooth(auto.t / auto.dur * 1.6)); look();
      if (auto.t >= auto.dur) { auto = null; docked(); }
      return;
    }
    if(lockedBody)look();else rotate6(sg.quaternion, dt, 0.0011);
    if(survey&&AF!==stationFrame){burning=Math.abs(surveyInput.forward)>.02;return;}
    const a = tv.set(axis('KeyD', 'KeyA'), axis('Space', 'KeyC'), -axis('KeyW', 'KeyS')).multiplyScalar(2.0);
    if (keys.ShiftLeft || keys.ShiftRight) { a.z -= G0; burning = true; }
    SV.addScaledVector(a.applyQuaternion(sg.quaternion), dt).addScaledVector(AF.cw(sg.position, SV, tv2), dt);
    if (keys.KeyX) brake(SV, G0, dt);
    const next=sg.position.clone().addScaledVector(SV,dt);
    protectFlight(sg.position,next,SV);sg.position.copy(next);
    if (AF === stationFrame) {   // 手动对接判定：机头对接环贴上空间站对接口，且速度够慢、姿态够正
      const nose = tv.set(0, 0, -M.SHIP_NOSE).applyQuaternion(sg.quaternion).add(sg.position);
      if (nose.distanceTo(station.port) < 1.0 && SV.x < -0.005 && SV.length() < 0.5 && tv2.set(0, 0, -1).applyQuaternion(sg.quaternion).x < -0.97) docked();
    }
  }
  function docked() {
    G.docked = true; G.shipBody = null; SV.set(0, 0, 0); ship.group.position.copy(DOCK_POS); ship.group.quaternion.copy(DOCK_Q);
    toast('对接环锁紧，对接完成。F 返回空间站'); if (G.flags.interstellar || G.flags.v_moon) G.flags.returned = true; save();
  }

  /* ---------- 巡航 ---------- */
  let navSel = null;
  const sysOf = id => SYSTEMS.find(s => s.id === id);
  function parseDest(key) { const [sys, body] = key.split('/'); return { sys, body: body === 'station' ? null : body, def: body === 'station' ? null : sysOf(sys).bodies.find(b => b.id === body) }; }
  function shipWorld(o) { ship.group.updateWorldMatrix(true, false); return W.toSys(ship.group.getWorldPosition(o)); }   // 飞船在恒星系坐标里的位置
  function destDistance(d) {
    if (d.sys !== G.sys) { const a = W.sys.pc, b = sysOf(d.sys).pc; return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * PC; }
    const p = d.body ? W.byId[d.body].pos : stationFrame.group.position; return Math.max(1, shipWorld(tv).distanceTo(p) - (d.body ? d.def.R + parkingAlt(d.def) : 0));
  }
  function isHere(d) { return d.sys === G.sys && !cruise && ((d.body === null && AF === stationFrame) || (d.body && AF !== stationFrame && AF.body.def.id === d.body)); }

  function startCruise(key) {
    const d = parseDest(key); if (G.mode !== 'pilot' || G.docked || isHere(d)) return;
    save();closePanel(); lockedBody=null;ship.group.visible=true;ship.visiblePhoto=false; auto = null; survey=false;surveyInput.forward=surveyInput.side=surveyInput.height=0;
    const cameraStart=W.toSys(cam.getWorldPosition(new V3()));
    const cameraQ=W.root.quaternion.clone().invert().multiply(cam.getWorldQuaternion(new Q()));
    if(photo){photo=null;document.body.classList.remove('photo');}
    const C = { f:0, dest:d, inter:d.sys!==G.sys, start:shipWorld(new V3()), dir:new V3(), switched:false,
      source:AF.body, sourcePos:AF.body.pos.clone(), cameraStart, cameraQ, fov0:cam.fov };
    C.outward=C.start.clone().sub(C.sourcePos).normalize();
    C.cameraSide=new V3().crossVectors(C.outward,Math.abs(C.outward.y)>.95?new V3(1,0,0):new V3(0,1,0)).normalize();
    C.cameraUp=new V3().crossVectors(C.cameraSide,C.outward).normalize();
    C.departure=Math.max(C.source.def.R*10,2e6);
    C.approach=Math.max((d.def?d.def.R:RE)*14,2e6);
    W.root.attach(ship.group); C.q0=ship.group.quaternion.clone();
    if(C.inter){
      C.pcA=W.sys.pc;C.pcB=sysOf(d.sys).pc;C.d=destDistance(d);C.dur=38;
      W.eq2w(C.pcB[0]-C.pcA[0],C.pcB[1]-C.pcA[1],C.pcB[2]-C.pcA[2],C.dir).normalize();
    } else {
      C.tf=frameFor(d.body);C.tf.update(G.t);C.d=C.start.distanceTo(C.tf.group.position);
      C.dur=clamp(15+Math.log10(Math.max(1,C.d/1e7))*2,18,30);
    }
    C.d=Math.max(1,C.d);C.departure=Math.min(C.departure,C.d*.12);C.approach=Math.min(C.approach,C.d*.12);
    C.T=travel1g(C.d);C.t0=G.t;cruise=C;G.warp=0;setMode('cruise');
    TextureAssets.prefetch(d.def||sysOf('sol').bodies.find(b=>b.id==='earth'));
    if(C.tf) aimArrival(C);
  }
  function aimArrival(C){
    if(C.tf!==stationFrame){
      const at=C.t0+C.T.earth,body=W.bodyPosAt(C.tf.body,at,new V3());
      const sun=W.bodyPosAt(W.starBodies[0],at,new V3());
      C.tf.faceAt(at,sun.sub(body).normalize());
    }
    C.tf.update(C.t0+C.T.earth);
    C.arrivalRad=C.tf.rad.clone();C.arrivalQ=C.tf.group.quaternion.clone();
    // Match the complete destination frame, including north-up. Rotating only
    // the radial vector carries departure-dependent roll into the next world.
    const north=C.tf.body.pole.clone();
    if(Math.abs(north.dot(C.arrivalRad))>.999)north.set(1,0,0).applyQuaternion(C.arrivalQ);
    const sourceView=new Q().setFromRotationMatrix(new THREE.Matrix4().lookAt(C.outward,new V3(),C.cameraUp));
    const destinationView=new Q().setFromRotationMatrix(new THREE.Matrix4().lookAt(C.arrivalRad,new V3(),north));
    C.cameraTurn=destinationView.multiply(sourceView.invert());
    C.tf.update(G.t);
  }
  function arrivalOffset(tf,o){return o.set(tf===stationFrame?DOCK_POS.x+110:0,0,0).applyQuaternion(tf.group.quaternion).add(tf.group.position);}
  function updCruise(dt){
    const C=cruise;C.f=Math.min(1,C.f+dt/C.dur);const f=C.f;
    const s=Journey.progress(f,C.d,C.departure,C.approach),pos=ship.group.position;
    // Keep the ephemeris clock consistent with distance, including slow endpoints.
    G.t=C.t0+Journey.earthElapsed(s,C.d,G0,CLIGHT);W.updateBodies(G.t);
    if(stationFrame)stationFrame.update(G.t);
    if(C.inter&&f>=.5&&!C.switched){
      C.switched=true;if(AF&&AF!==stationFrame)W.root.remove(AF.group);AF=null;
      enterSystem(C.dest.sys);C.tf=frameFor(C.dest.body);aimArrival(C);
    }
    let end=null;
    if(C.tf){C.tf.update(G.t);end=C.tf.body.pos.clone().addScaledVector(C.arrivalRad,C.tf.r);
      if(C.tf===stationFrame)end.add(new V3(DOCK_POS.x+110,0,0).applyQuaternion(C.arrivalQ));}
    const sourceDelta=!C.switched?C.source.pos.clone().sub(C.sourcePos):new V3();
    const departure=C.start.clone().add(sourceDelta).addScaledVector(C.outward,C.departure);
    const approach=end?end.clone().addScaledVector(C.arrivalRad,C.approach):null;
    if(f<.22){
      pos.copy(C.start).add(sourceDelta).addScaledVector(C.outward,C.departure*Journey.ease(f/.22));
      if(!C.inter)C.dir.copy(approach).sub(pos).normalize();
    } else if(f>=.70){
      const remaining=(1-s)*C.d;
      pos.copy(end).addScaledVector(C.arrivalRad,remaining);
      if(!C.inter)C.dir.copy(C.arrivalRad).negate();
    } else if(C.inter){
      // Coordinate handover occurs only in deep space, with both systems out of view.
      if(!C.switched)pos.copy(departure).addScaledVector(C.dir,Math.min(Math.max(0,s*C.d-C.departure),5e13));
      else pos.copy(approach).addScaledVector(C.dir,-Math.min(Math.max(0,(1-s)*C.d-C.approach),5e13));
    } else {
      const u=Journey.ease((f-.22)/.48),lift=Math.sin(Math.PI*u)**2*C.d*.22;
      pos.lerpVectors(departure,approach,u);pos.y+=lift;
      C.dir.copy(approach).sub(departure).normalize();
    }
    if(C.inter){
      W.updateStars([lerp(C.pcA[0],C.pcB[0],s),lerp(C.pcA[1],C.pcB[1],s),lerp(C.pcA[2],C.pcB[2],s)]);
      W.transitVisibility=f<.5?1-Journey.ease((f-.40)/.07):Journey.ease((f-.53)/.07);
      W.sysGroup.visible=W.transitVisibility>0;
    }
    const forward=C.dir.lengthSq()>.5?C.dir:C.outward;
    const qt=new Q().setFromUnitVectors(new V3(0,0,-1),forward);
    qt.multiply(new Q().setFromAxisAngle(new V3(1,0,0),Math.PI*Journey.ease((f-.46)/.08)));
    const previousQ=ship.group.quaternion.clone();
    ship.group.quaternion.slerpQuaternions(C.q0,qt,Journey.ease(f/.09));
    if(f>.88){const targetQ=C.arrivalQ.clone().multiply(C.tf===stationFrame?DOCK_Q:ORBIT_Q);ship.group.quaternion.slerp(targetQ,Journey.ease((f-.88)/.12));}
    const desiredQ=ship.group.quaternion.clone();ship.group.quaternion.copy(previousQ).slerp(desiredQ,Math.max(1-Math.exp(-dt*5),Journey.ease((f-.97)/.03)));
    burning=f>.025&&f<.96&&!(f>.452&&f<.548);
    // Camera looks back at the departing world, then toward the approaching world.
    const turn=Journey.ease((f-.55)/.22);
    const turnQ=new Q().identity().slerp(C.cameraTurn||new Q(),turn);
    const radial=C.outward.clone().applyQuaternion(turnQ);
    const side=C.cameraSide.clone().applyQuaternion(turnQ),up=C.cameraUp.clone().applyQuaternion(turnQ);
    const offset=radial.multiplyScalar(145).addScaledVector(side,70).addScaledVector(up,25);
    const launchOffset=C.cameraStart.clone().sub(C.start);
    const cameraOffset=launchOffset.lerp(offset,Journey.ease(f/.09));
    cam.position.copy(pos).add(cameraOffset);
    // Build rotation around the origin: avoids subtracting astronomical positions.
    const lookQ=new Q().setFromRotationMatrix(new THREE.Matrix4().lookAt(cameraOffset,new V3(),up));
    cam.quaternion.slerpQuaternions(C.cameraQ,lookQ,Journey.ease(f/.09));
    cam.fov=lerp(C.fov0,60,Journey.ease(f/.09))+8*Math.sin(Math.PI*f)**2;cam.updateProjectionMatrix();
    const elapsed=G.t-C.t0,halfT=Math.min(elapsed,C.T.earth-elapsed);
    const v=G0*halfT/Math.sqrt(1+(G0*halfT/CLIGHT)**2);
    beta.copy(forward).multiplyScalar(v/CLIGHT);
    const phase=f<.22?'离轨 · 告别 '+C.source.def.name:f<.46?'深空巡航 · 加速':f<.55?'中点翻转':f<.70?'深空巡航 · 减速':f<.94?'接近 '+(C.dest.def?.name||'星环站'):'轨道交会';
    const shipElapsed=(CLIGHT/G0)*Math.asinh(G0*Math.max(0,halfT)/CLIGHT);
    $('cruise').innerHTML=`<b>${phase}</b><span class="travel-dest"> → ${C.dest.def?.name||'星环站'}</span><div class="travel-track"><i style="width:${f*100}%"></i></div><small>离轨　 ·　 巡航　 ·　 接近　 ·　 入轨</small><br>速度 <b>${fmtSpeed(v)}</b>　剩余 ${fmtDist((1-s)*C.d)}<br>船上时间 ${fmtDur(elapsed<C.T.earth/2?shipElapsed:C.T.ship-shipElapsed)} / ${fmtDur(C.T.ship)}　地球时间 ${fmtDur(elapsed)} / ${fmtDur(C.T.earth)}`;
    if(f>=1)arrive();
  }
  function arrive() {
    const C = cruise, d = C.dest;
    const cameraOffset=cam.position.clone().sub(ship.group.position).applyQuaternion(ship.group.quaternion.clone().invert());
    const cameraRotation=ship.group.quaternion.clone().invert().multiply(cam.quaternion);
    cruise = null; beta.set(0, 0, 0); burning = false;W.transitVisibility=1;W.sysGroup.visible=true;
    setAF(C.tf); AF.update(G.t); AF.group.add(ship.group);
    ship.group.position.set(AF === stationFrame ? DOCK_POS.x + 110 : 0, 0, 0); ship.group.quaternion.copy(AF === stationFrame ? DOCK_Q : ORBIT_Q);
    SV.set(0, 0, 0); G.shipBody = d.body; G.shipTime += C.T.ship; G.needs.mood = clamp(G.needs.mood + 20, 0, 100);
    if (d.body) G.flags['v_' + d.body] = true; if (C.inter) G.flags.interstellar = true;
    survey=AF!==stationFrame&&AF.body.def.kind!=='star';
    setMode('pilot');
    // Hold the approach view after arrival; only V/P should reframe it.
    
    cam.position.copy(cameraOffset);cam.quaternion.copy(cameraRotation);FlightAudio.announce('已抵达'+(d.def?.name||'星环站')+'。');
    if (d.body) { toast(`已进入${d.def.name}停泊轨道：高度 ${fmtDist(AF.alt)}，轨道速度 ${fmtSpeed(AF.speed)}，周期 ${fmtDur(AF.period)}`); toast(survey?'自由飞行已开启：W/S 前后，A/D 平移，Shift 四倍加速，B 切换精细驾驶':'按 G 扫描这个天体 · 按 P 进入观景模式'); }
    else toast('已抵达星环站附近。按 F 启动自动对接');
    if (C.inter) toast(`这趟航程船上过了 ${fmtDur(C.T.ship)}，地球上过了 ${fmtDur(C.T.earth)}——这就是时间膨胀`, 'warn');
    save();
  }

  /* ---------- 导航面板 ---------- */
  function openNav() { StarMap.open(); }
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  function navDetail() {
    if (!navSel) return `<h2>星图导航</h2><button class="btn ghost" data-a="journal">探索日志</button><p>在地图上单击一个天体查看资料；能去的地方会出现“启动巡航”按钮。</p>
      <p class="dim">地图分五层：行星系 → 恒星系 → 太阳邻域 → 银河系 → 本星系群。双击天体进入下一层，滚轮往外缩或按退格键回到上一层。</p>
      <p class="dim">「远航者号」的设定是一艘能持续以 1g 加速的聚变飞船——前半程加速，中点调头，后半程减速。这种发动机现实中还不存在，但航行时间、速度和时间膨胀都按真实的（相对论）公式计算。作为对照，面板里也会给出化学火箭走霍曼转移轨道需要多久。</p>
      <p class="dim">恒星位置来自 HYG 星表的真实三维坐标：飞往别的恒星时，你会看到近处的星星发生视差位移；高速时星空会因光行差向前方聚拢。</p><button class="btn ghost" data-a="close">关闭</button>`;
    if (navSel === 'mw') return `<h2>银河系</h2><p class="dim">棒旋星系 · 你所在的星系</p><table>${row('直径', '约 10 万光年')}${row('恒星数量', '约 1000–4000 亿颗')}${row('太阳到银心', fmtDist(26670 * LY))}${row('太阳绕银心一圈', '约 2.3 亿年（速度约 230 km/s）')}${row('年龄', '约 136 亿年')}</table>
      <p class="dim">我们从内部看它，所以夜空中的银河是一条带子。它的结构（中央棒、旋臂）是靠射电和红外观测、测量脉泽视差一点点拼出来的，银心另一侧至今看不清。</p><button class="btn ghost" data-a="close">关闭</button>`;
    if (navSel.startsWith('star/')) {
      const i = +navSel.slice(5), N = StarMap.nearData(), p = [N.p[i * 3], N.p[i * 3 + 1], N.p[i * 3 + 2]], cs = (N.sys.find(o => o.s.id === G.sys) || N.sys[0]).p;
      const dSun = Math.hypot(p[0], p[1], p[2]), dHere = Math.hypot(p[0] - cs[0], p[1] - cs[1], p[2] - cs[2]), M = NEAR.s[i * 5 + 3], app = M + 5 * Math.log10(dSun / 3.26156) - 5, sp = NEAR.sp[i] || '';
      const c = sp.replace(/^sd/, '')[0], kind = /^D/.test(sp) ? '白矮星（恒星死后留下的致密残骸）' : /III/.test(sp) ? '巨星（已经膨胀的老年恒星）' : { O: '蓝色超热恒星', B: '蓝白色热星', A: '白色恒星', F: '黄白色恒星', G: '黄色恒星，和太阳同类', K: '橙矮星', M: '红矮星' }[c] || '恒星', T = travel1g(dHere * LY);
      return `<h2>${StarMap.starName(i)}</h2><p class="dim">${kind}</p><table>${row('光谱型', sp || '未知')}${row('距太阳', fmtDist(dSun * LY))}${G.sys !== 'sol' ? row('距你', fmtDist(dHere * LY)) : ''}${row('从地球看', `${app.toFixed(1)} 等 · ${app <= 6 ? '肉眼可见' : '肉眼看不见'}`)}${row('光度', (Math.pow(10, (4.83 - M) / 2.5)).toPrecision(2) + ' 倍太阳')}${row('本船 1g 航行', `<b>${fmtDur(T.ship)}</b>（船上）/ ${fmtDur(T.earth)}（地球）`)}</table>
        <p class="dim">本船资料库里没有这个恒星系的行星数据，暂时不能前往。</p><button class="btn ghost" data-a="close">关闭</button>`;
    }
    if (navSel.startsWith('deep/')) {
      const f = DEEP.find(x => x.id === navSel.slice(5));
      if (f.kind === 'probe') {
        const au = f.au0 + f.rate * ((G.t + J2000_UNIX) / YEAR - 55);
        return `<h2>${f.name}</h2><p>${f.note}</p><table>${row('距太阳', '约 ' + au.toFixed(0) + ' AU（' + fmtDist(au * AU) + '）')}${row('信号单程', fmtDur(au * AU / CLIGHT))}${row('发射', f.launch + ' 年')}${row('飞离太阳的速度', f.v + ' km/s')}${row('以这个速度到比邻星', fmtDur(4.2465 * LY / (f.v * 1000)))}</table>
          <p class="dim">位置按公开的方向和速度推算，是近似值。</p><button class="btn ghost" data-a="close">关闭</button>`;
      }
      const T = travel1g(f.ly * LY);
      return `<h2>${f.name}</h2><p>${f.note}</p><table>${row('距离', fmtDist(f.ly * LY))}${row('光走过去', fmtDur(f.ly * YEAR))}${f.size ? row('直径', fmtDist(f.size * LY)) : ''}${row('1g 航行 · 船上时间', '<b>' + fmtDur(T.ship) + '</b>')}${row('1g 航行 · 地球时间', fmtDur(T.earth))}${row('峰值速度', fmtSpeed(T.vmax))}</table>
        <p class="dim">持续 1g 加速时，船上的人只要二三十年就能横跨银河甚至抵达仙女座星系——但地球上已经过去了几万到几百万年。这超出了本船的任务范围，无法前往。</p><button class="btn ghost" data-a="close">关闭</button>`;
    }
    const d = parseDest(navSel), def = d.def, here = isHere(d), dist = destDistance(d), T = travel1g(dist);
    let h = `<h2>${def ? def.name : '星环站'}</h2><p class="dim">${def ? def.sub : '近地轨道空间站 · 高度 408 km · 倾角 51.64°'}${d.sys !== 'sol' ? ' · ' + sysOf(d.sys).name : ''}</p><table>`;
    if (def) {
      const g = def.GM / (def.R * def.R), alt = parkingAlt(def), r = def.R + alt;
      h += row('半径', fmtDist(def.R) + (def.R > 2e6 ? `（${(def.R / RE).toFixed(2)} 个地球）` : '')) + row('表面重力', (g / G0).toFixed(2) + ' g') + (def.T ? row('有效温度', def.T + ' K') : '') + (def.P && def.kind !== 'star' ? row('公转周期', fmtDur(def.P * DAY)) : '')
        + row('停泊轨道', `高度 ${fmtDist(alt)} · ${fmtSpeed(Math.sqrt(def.GM / r))} · 周期 ${fmtDur(2 * Math.PI * Math.sqrt(r * r * r / def.GM))}`);
    }
    if (!here) {
      h += row('预计抵达 UTC',new Date((G.t+T.earth+J2000_UNIX)*1000).toISOString().replace('T',' ').slice(0,19)) + row('当前距离', fmtDist(dist)) + row('光走过去', fmtDur(dist / CLIGHT)) + row('本船 1g 航行', `<b>${fmtDur(T.ship)}</b>（船上）${T.earth / T.ship > 1.01 ? ' / ' + fmtDur(T.earth) + '（地球）' : ''}`) + row('峰值速度', fmtSpeed(T.vmax));
      if (d.sys === 'sol' && G.sys === 'sol' && def && def.kind === 'planet' && def.id !== 'earth') { const H = hohmann(AU, def.a, GMSUN); h += row('化学火箭 · 霍曼转移', `${fmtDur(H.T)}，日心 Δv ${((H.dv1 + H.dv2) / 1000).toFixed(1)} km/s`); }
      if (def && def.id === 'moon' && G.sys === 'sol') { const H = hohmann(RE + 4.08e5, 3.844e8, GME); h += row('化学火箭 · 霍曼转移', `${fmtDur(H.T)}，Δv ${((H.dv1 + H.dv2) / 1000).toFixed(1)} km/s（阿波罗走更快的轨道，约 3 天）`); }
      if (d.sys !== G.sys) h += row('旅行者 1 号的速度（17 km/s）', fmtDur(dist / 17000));
    }
    h += '</table>';
    if(def)h+=`<p>${G.scanned[def.id]?'✓ 已扫描':'○ 未扫描'} · 观测 ${Object.keys(G.observations?.[def.id]||{}).length}/3</p><button class="btn ghost" data-a="journal">探索日志</button>`;
    if (d.sys !== 'sol') h += `<p class="dim">${sysOf(d.sys).desc}</p>`;
    const why = here ? '你就在这里' : G.mode !== 'pilot' ? '需要先登上「远航者号」' : G.docked ? '需要先按 U 脱离对接' : '';
    h += `<div class="btns"><button class="btn" data-a="go" ${why ? 'disabled' : ''}>${why || '启动巡航'}</button><button class="btn ghost" data-a="close">关闭</button></div>`;
    return h;
  }

  /* ---------- 扫描 ---------- */
  const studies={jupiter:['云带与风暴','近距云顶观测','夜侧极光环境'],saturn:['行星环结构','近距环影观测','夜侧大气'],europa:['冰壳光谱','冰面裂纹','夜侧热环境'],callisto:['古老撞击地貌','密集陨石坑','夜侧热环境'],io:['火山地表','熔岩区光谱','夜侧火山环境']};
  function openJournal(){
    const records=G.observations||{},names=SYSTEMS.flatMap(s=>s.bodies);
    const entries=Object.entries(records).map(([id,items])=>`<h3>${names.find(b=>b.id===id)?.name||id}</h3><ul>${Object.values(items).map(r=>`<li>${r.title} · ${new Date((r.time+J2000_UNIX)*1000).toISOString().slice(0,10)} · 高度 ${fmtDist(r.altitude)}</li>`).join('')}</ul>`).join('');
    openPanel('journal',`<div class="card"><h2>探索日志</h2><p>已扫描 ${Object.keys(G.scanned).length} 个天体 · 已完成 ${Object.values(records).reduce((n,r)=>n+Object.keys(r).length,0)} 项观测</p>${entries||'<p>抵达天体附近后按 G 开始扫描。</p>'}<button class="btn" data-a="close">关闭</button></div>`);
  }
  function scan() {
    if (AF === stationFrame || !AF) return toast('先飞到一个天体附近再扫描');
    const near=nearestBody(),def=near.body.def;
    if(near.altitude>def.R*10)return toast('距离过远，请接近至目标半径的 10 倍以内');
    const first = !G.scanned[def.id], gain = G.sys === 'sol' ? 40 : 150;
    if (first) { G.scanned[def.id] = true; G.credits += gain; }
    const position=ship.group.position.clone().applyQuaternion(AF.group.quaternion).add(AF.group.position);
    const normal=position.clone().sub(near.body.pos).normalize(),sun=W.starBodies[0].pos.clone().sub(near.body.pos).normalize();
    const titles=studies[def.id]||['全局光谱','近距地貌','夜侧环境'];
    const conditions=[true,near.altitude<def.R*.25,normal.dot(sun)<-.15];
    G.observations ||= {};const records=G.observations[def.id] ||= {};let added=0;
    conditions.forEach((met,i)=>{if(met&&!records[i]){records[i]={title:titles[i],time:G.t,altitude:near.altitude};G.credits+=15;added++;}});
    const g = def.GM / (def.R * def.R);
    openPanel('scan', `<div class="card"><h2>${def.name} <small>${def.sub}</small></h2>
      <table>${row('半径', fmtDist(def.R))}${row('表面重力', (g / G0).toFixed(2) + ' g')}${row('逃逸速度', fmtSpeed(Math.sqrt(2 * def.GM / def.R)))}${def.rot ? row('自转周期', fmtDur(Math.abs(def.rot) * 3600)) : ''}</table>
      <ul>${def.facts.map(f => `<li>${f}</li>`).join('')}</ul>
      <h3>观测任务</h3><ul>${titles.map((title,i)=>`<li>${records[i]?'✓':'○'} ${title}：${['附近扫描','高度低于 '+fmtDist(def.R*.25),'飞到夜侧后扫描'][i]}</li>`).join('')}</ul>
      <p class="dim">观测为游戏探索任务；地貌细节与动态天气含艺术模拟。</p>
      ${first ? `<p class="gold">首次扫描：科研点 +${gain}</p>` : ''}${added?`<p class="gold">新增 ${added} 项观测，科研点 +${added*15}</p>`:''}
      <button class="btn" data-a="journal">探索日志</button> <button class="btn ghost" data-a="close">关闭</button></div>`);
    FlightAudio.cue();hud();save();
  }

  /* ---------- 空间站系统 ---------- */
  let gen = 0, load_ = 0, inc = 1;
  function sim(g) {
    const h = g / 3600, n = G.needs, r = G.res;
    if (!cruise) {
      n.energy -= 6.25 * h; n.food -= 5 * h; n.health -= 0.35 * h; n.mood -= 1.5 * h;
      if (n.food <= 0) n.health -= 2 * h;
      for (const k in n) n[k] = clamp(n[k], k === 'health' ? 5 : 0, 100);
      warn('food', n.food < 20, '你饿了。去居住舱吃点东西'); warn('energy', n.energy < 15, '你很困，回睡眠舱睡一觉吧');
      warn('health', n.health < 50, '骨密度和肌肉在流失，记得上跑步机'); warn('mood', n.mood < 25, '心情低落。去穹顶舱看看地球，或者照料一下作物');
    }
    if (!stationFrame) return;
    if (!atStation()) return;     // 离站期间空间站转入自动托管，资源不变化
    gen = 14 * W.sunFactor * inc * (G.damage >= 0 ? 0.5 : 1); load_ = 7.5 + (act && act.id === 'exp' ? 2.5 : 0);
    r.bat = clamp(r.bat + (gen - load_) * h, 0, 60);
    const powered = r.bat > 0.3;
    r.o2 -= 0.035 * h; r.water -= 0.0102 * h;
    if (powered && r.water > 0) { r.o2 += 0.04 * h; r.water -= 0.045 * h; }
    r.o2 = clamp(r.o2, 0, 40); r.water = clamp(r.water, 0, 120);
    if (r.o2 <= 0 || !powered) n.health = clamp(n.health - 20 * h, 5, 100);
    warn('bat', r.bat < 8, '电池即将耗尽！制氧机会停机'); warn('o2', r.o2 < 5, '氧气储量告急，去站务终端申请补给'); warn('meals', r.meals + r.fresh < 3, '食物快吃完了，去站务终端申请补给');
    G.plantG = clamp(G.plantG + h / 72 * (G.t - G.tendedAt < DAY ? 1 : 0.3), 0, 1);
    if (G.damage < 0 && G.step > 7 && G.t > G.nextFault && G.mode === 'iva') { G.damage = Math.floor(Math.random() * 4); toast('警报：微流星体击中太阳翼配电盒，发电量减半。请出舱维修', 'warn'); }
    if (G.supplyAt && G.t >= G.supplyAt) { G.supplyAt = 0; r.meals += 20; r.water = clamp(r.water + 30, 0, 120); r.o2 = clamp(r.o2 + 10, 0, 40); toast('货运飞船已对接并完成卸货：餐食 +20，水 +30 L，氧气 +10 kg'); }
  }
  function orderSupply() {
    if (G.supplyAt) return; if (G.credits < 30) return toast('科研点不足（需要 30）');
    G.credits -= 30; G.supplyAt = G.t + 6 * 3600; toast('补给申请已批准：货运飞船将在约 6 小时后对接'); openTerminal();
  }
  function statusRows() {
    const r = G.res, f = stationFrame;
    return [['发电 / 负载', `${gen.toFixed(1)} / ${load_.toFixed(1)} kW${G.damage >= 0 ? '（配电盒故障）' : ''}`], ['电池', `${r.bat.toFixed(1)} / 60 kWh　${W.sunFactor > 0.5 ? '日照充电' : '地影放电'}`],
      ['氧气储量', `${r.o2.toFixed(1)} kg（每人每天消耗 0.84 kg）`], ['水', `${r.water.toFixed(1)} L（尿液与冷凝水回收率 93%）`], ['餐食', `${r.meals} 份 + 鲜蔬 ${r.fresh} 份`],
      ['轨道', `高度 ${fmtDist(f.alt)} · ${fmtSpeed(f.speed)} · 周期 ${fmtDur(f.period)}`], ['每天日出', `${(DAY / f.period).toFixed(1)} 次`]];
  }
  function openTerminal() {
    openPanel('terminal', `<div class="card"><h2>星环站 · 站务终端</h2><table>${statusRows().map(([k, v]) => row(k, v)).join('')}${row('科研点', '<b class="gold">' + G.credits + '</b>')}${row('飞船航行时间', fmtDur(G.shipTime))}</table>
      <p class="dim">电解制氧机把水分解成氧气和氢气；太阳翼绕主桁架转动追踪太阳，进入地球阴影后靠电池供电。</p>
      <div class="btns"><button class="btn" data-a="supply" ${G.supplyAt || G.credits < 30 ? 'disabled' : ''}>${G.supplyAt ? '货运飞船在途，' + fmtDur(G.supplyAt - G.t) + '后到' : '申请货运补给（30 科研点）'}</button><button class="btn ghost" data-a="close">关闭</button><button class="btn ghost" data-a="reset">重新开始</button></div></div>`);
  }
  function drawScreen() {
    const s = station.screen, g = s.ctx; g.fillStyle = '#06101c'; g.fillRect(0, 0, 512, 320);
    g.fillStyle = '#5bc8ff'; g.font = 'bold 26px "PingFang SC",sans-serif'; g.fillText('星环站 · 系统状态', 18, 36);
    g.font = '20px "PingFang SC",monospace'; let y = 74;
    for (const [k, v] of statusRows().slice(0, 6)) { g.fillStyle = '#7f9bb8'; g.fillText(k, 18, y); g.fillStyle = '#d8f0ff'; g.fillText(v.replace(/（.*?）/g, '').replace(/ · /g, ' ').replace('高度 ', ''), 150, y); y += 36; }
    g.fillStyle = G.damage >= 0 ? '#ff5a4a' : '#39d98a'; g.fillText(G.damage >= 0 ? '● 故障：太阳翼配电盒' : '● 全部系统正常', 18, 300);
    s.tex.needsUpdate = true;
  }

  /* ---------- 任务引导 ---------- */
  const STEPS = [
    ['穿过前方的节点舱，从地板上的舱口下到「穹顶舱」，看看地球', () => G.flags.cupola],
    ['回到「居住舱」，在餐桌旁按 F 吃点东西', () => G.flags.ate],
    ['在居住舱的跑步机上锻炼', () => G.flags.exercised],
    ['去「实验舱」，在手套箱做一次实验', () => G.flags.exp],
    ['在实验舱查看站务终端（亮着的屏幕）', () => G.flags.terminal],
    ['去「温室舱」照料作物', () => G.flags.garden],
    ['回居住舱最里面的睡眠舱睡一觉', () => G.flags.slept],
    ['警报：太阳翼配电盒故障。从「气闸舱」出舱，飞到桁架上闪红灯处维修', () => G.flags.repaired],
    ['回到站内，穿过实验舱尽头的对接通道，登上「远航者号」', () => G.flags.boarded],
    ['按 U 脱离对接，再按 M 打开导航，前往月球', () => G.flags.v_moon],
    ['按 G 扫描月球', () => G.scanned.moon],
    ['前往火星并扫描', () => G.scanned.mars],
    ['前往任意一个别的恒星系', () => G.flags.interstellar],
    ['返航：导航回「星环站」，抵达后按 F 自动对接', () => G.flags.returned],
  ];
  function missions() {
    while (G.step < STEPS.length && STEPS[G.step][1]()) {
      G.step++; G.credits += 10;
      if (G.step === 7) G.damage = 2;
      toast(G.step < STEPS.length ? '✔ 完成，科研点 +10' : '✔ 引导全部完成。宇宙是你的了');
    }
    $('mission').textContent = G.step < STEPS.length ? `任务 ${G.step + 1}/${STEPS.length}　${STEPS[G.step][0]}` : '';
  }

  /* ---------- HUD ---------- */
  const bar = (name, v, c) => `<div class="bar"><span>${name}</span><div class="track"><div style="width:${v}%;background:${v < 25 ? '#ff5a4a' : c}"></div></div><span>${Math.round(v)}</span></div>`;
  function hud() {
    const date = new Date((G.t + J2000_UNIX) * 1000).toISOString().replace('T', ' ').slice(0, 19);
    let s = `<b>${date} UTC</b>　时间流速 ×${act ? Math.round(act.rate) : cruise ? '—' : WARPS[G.warp]}<br>`;
    const vicinity=G.mode==='pilot'&&!cruise&&!G.docked?nearestBody():null;
    if(cruise)s+='深空巡航';else if(AF){
      s+=`${W.sys.id==='sol'?'':W.sys.name+' · '}${vicinity?vicinity.body.def.name:AF.body.def.name}${G.mode==='pilot'&&!G.docked?'附近':`轨道 · 高度 ${fmtDist(AF.alt)} · ${fmtSpeed(AF.speed)} · 周期 ${fmtDur(AF.period)}`}<br>${W.sunFactor>.5?'☀ 日照区':'● 阴影区'}`;
    }
    if (G.mode === 'eva') s += `<br>舱外活动 · 相对速度 ${P.vel.length().toFixed(2)} m/s · 距气闸 ${P.pos.distanceTo(station.evaHatch).toFixed(0)} m`;
    if (G.mode === 'pilot' && !G.docked) {
      s += survey ? `<br>自由飞行 · 速度 ${fmtSpeed(SV.length())} · 距地表 ${fmtDist(vicinity.altitude)} · B 切回精细驾驶` : `<br>相对速度 ${fmtSpeed(SV.length())}`;
      if (AF === stationFrame) s += ` · 距对接口 ${fmtDist(tv.set(0, 0, -M.SHIP_NOSE).applyQuaternion(ship.group.quaternion).add(ship.group.position).distanceTo(station.port))}`;
    }
    if(vicinity&&survey){
      s+=`<br>${lockedBody?'锁定 '+lockedBody.def.name+' · A/D 环绕 · L 解除':'L 锁定附近天体'} · ${approachLimited?'接近辅助：正在限速':'接近辅助开启'}`;
      s+=`<br>辅助制动距离 ≈ ${fmtDist(SV.length()/14)} · 表面余量 ${fmtDist(surfaceMargin(vicinity.body))}`;
      if(vicinity.altitude<surfaceMargin(vicinity.body)+Math.max(500,SV.length()/3))s+='<br><span class="gold">接近表面 · 请减速或沿切向绕行</span>';
    }
    $('tl').innerHTML = s;flightHUD();
    const n = G.needs;
    $('needs').innerHTML = cruise ? '<div class="dim">乘员休眠中</div>' : bar('体力', n.energy, '#7ce0ff') + bar('饱腹', n.food, '#ffb86b') + bar('健康', n.health, '#7be3a1') + bar('心情', n.mood, '#ff9ecb');
    const r = G.res;
    $('res').innerHTML = `科研点 <b class="gold">${G.credits}</b>` + (atStation() ? `<br>电池 ${Math.round(r.bat / 60 * 100)}% ${gen > load_ ? '▲' : '▼'}<br>氧气 ${r.o2.toFixed(1)} kg<br>水 ${r.water.toFixed(0)} L<br>餐食 ${r.meals + r.fresh}` : '');
    const id = !panel && !act && !cruise ? target() : null;
    $('prompt').innerHTML = id ? `<kbd>F</kbd> ${label(id)}` : '';
  }

  /* ---------- 主循环 ---------- */
  let last = performance.now();
  function frame() {
    if (!FILM) requestAnimationFrame(frame);
    const now = performance.now(), dt = FILM ? 1 / 30 : clamp((now - last) / 1000, 0, 0.1); last = now;
    if(!DBG&&($('intro').style.display!=='none'||document.hidden)){FlightAudio.engine(false,0);return;}
    const cruising = !!cruise, gdt = cruise ? 0 : act ? act.rate * dt : dt * WARPS[G.warp];
    G.t += gdt;
    W.updateBodies(G.t);
    if (stationFrame) stationFrame.update(G.t);
    if (AF && AF !== stationFrame) AF.update(G.t);
    if (cruise) updCruise(dt);
    else if (act) { act.left -= gdt; $('actBar').style.width = (100 - act.left / act.total * 100) + '%'; mdx = mdy = 0; if (act.left <= 0) finishAct(); }
    else if (!panel) { if (photo) updPhoto(dt); if (G.mode === 'iva') updIVA(dt); else if (G.mode === 'eva') updEVA(dt); else if (G.mode === 'pilot' && !photo) updPilot(dt); }
    else mdx = mdy = 0;

    if(!cruise)updSurvey(dt);
    FlightAudio.engine(!panel&&!document.hidden&&burning,Math.min(1,SV.length()/1e6));

    // 把当前参考系钉在世界原点（巡航时改为跟随飞船）
    if (cruise || !AF || G.mode === 'sky') W.setRoot(null, cruise ? ship.group.position : cam.position); else {
      W.setRoot(AF.group);
      if(G.mode==='pilot'&&AF!==stationFrame){
        W.root.position.sub(ship.group.position);W.root.updateMatrix();W.root.updateMatrixWorld(true);
      }
    }
    cam.updateWorldMatrix(true, false);
    const focusW = cam.getWorldPosition(new V3()), focus = W.toSys(focusW.clone());
    if (focusW.length() < 160) W.shadowCenter.set(0, 0, 0); else W.shadowCenter.set(Math.round(focusW.x / 8) * 8, Math.round(focusW.y / 8) * 8, Math.round(focusW.z / 8) * 8);
    W.updateView(focus, cruise ? null : AF && AF.body, beta);
    if (stationFrame) {
      const inside = G.mode === 'iva' || filmDim;
      // 人在舱内时隐藏包着舱内空间的那几个真实舱段：它们的结构伸进了我们的房间，留着会挡住舱内的灯
      if (insideState !== inside) { insideState = inside; station.interior.visible = inside; for (const o of station.hideInside) o.visible = !inside; W.shineK = inside ? 0 : 1; for (const l of station.lights) l.shadow.needsUpdate = true; }
      // 太阳翼追日的入射角决定发电量
      const sl = tv.copy(W.toStar).applyQuaternion(tq.copy(stationFrame.group.quaternion).invert());
      inc = Math.hypot(sl.x, sl.y);
      station.marker.visible = G.damage >= 0 && (now % 900) < 500; if (G.damage >= 0) station.marker.position.copy(repairPos());
      const k = 0.3 + G.plantG * 0.9; for (const p of station.plants) p.scale.setScalar(k * p.userData.s);
    }
    ship.plume.visible = burning; ship.plume.scale.setScalar(1 + Math.sin(now * 0.05) * 0.03); ship.plumeLight.intensity = burning ? 2.5 : 0;
    ship.radMat.emissiveIntensity = lerp(ship.radMat.emissiveIntensity, burning ? 0.9 : 0.05, dt * 1.5);

    if (!cruising) sim(gdt);
    if ((hudT += dt) > 0.12) { hudT = 0; missions(); hud(); }
    if ((screenT += dt) > 0.6 && stationFrame) { screenT = 0; drawScreen(); }
    if (now - lastSave > 6000 && !act) { lastSave = now; save(); }
    if (stationFrame && (shadowT += dt) > 6) { shadowT = 0; for (const l of station.lights) l.shadow.needsUpdate = true; }   // 作物长大等变化后刷新舱内静态阴影
    W.render();
    W.updateLabels(G.mode !== 'iva' && G.mode !== 'film' && !photo, $('labels'), AF && AF.body);
  }

  /* ---------- 启动 ---------- */
  function init() {
    W.init(canvas); cam = W.camera;
    StarMap.init({ t: () => G.t, cur: () => ({ sys: G.sys, body: cruise ? null : AF === stationFrame ? 'station' : AF ? (G.mode==='pilot'?nearestBody().body.def.id:AF.body.def.id) : null }), shipPosition:()=>AF?ship.group.position.clone().applyQuaternion(AF.group.quaternion).add(AF.group.position):null, explored:id=>!!G.scanned[id], getSel: () => navSel, setSel: k => { navSel = k; }, detail: () => navDetail(), openPanel: html => openPanel('nav', html) });
    station = M.buildStation(); ship = M.buildShip();
    M.shadowize(station.group); M.shadowize(ship.group);
    W.labelOccluder=ship.group;
    $('start').disabled = true; $('start').textContent = '正在载入空间站模型……';
    M.loadISS(station, () => init2(), e => { $('start').textContent = '模型载入失败：' + (e && e.message || e); });
  }
  async function init2() {
    G = DBG&&!params.has('resume') ? newGame() : load();
    if (G.sys !== 'sol' && !sysOf(G.sys).bodies.some(b => b.id === G.shipBody)) G.shipBody = sysOf(G.sys).bodies[0].id;
    if (G.sys === 'sol' && G.shipBody && !sysOf('sol').bodies.some(b => b.id === G.shipBody)) G.shipBody = null;
    enterSystem(G.sys);
    setAF(frameFor(G.shipBody)); AF.update(G.t); AF.group.add(ship.group);
    if (AF === stationFrame) { ship.group.position.copy(DOCK_POS); ship.group.quaternion.copy(DOCK_Q); if (!G.docked) ship.group.position.x += 110; } else { G.docked = false; ship.group.quaternion.copy(ORBIT_Q); }
    G.warp = 0;
    survey=!G.docked&&AF!==stationFrame&&AF.body.def.kind!=='star';
    setMode(G.docked && G.mode !== 'pilot' ? 'iva' : 'pilot');
    if(G.mode==='pilot')restoreFlight(G.flight);
    $('start').textContent='正在准备当前星球与基础画面……';
    await TextureAssets.ready();
    TextureAssets.prefetch(AF.body.def,1);
    TextureAssets.request('milkyway',1);
    if (DBG) debugView(DBG);
    $('start').addEventListener('click', () => { $('intro').style.display = 'none'; canvas.requestPointerLock && canvas.requestPointerLock(); });
    $('start').disabled = false; $('start').textContent = G.step > 0 || DBG ? '继续' : '进入空间站';
    if (DBG) $('intro').style.display = 'none';
    if (!FILM) requestAnimationFrame(frame);
  }
  /* 把时间拨到空间站正飞在昼半球上空的时刻（录像和截图用） */
  function pickDay(off) {
    let best = 0, bd = -2; const sun = new V3();
    for (let o = 0; o < 5600; o += 100) { W.updateBodies(G.t + o); stationFrame.update(G.t + o); const d = stationFrame.rad.dot(sun.copy(W.byId.sun.pos).sub(stationFrame.group.position).normalize()); if (d > bd && d < 0.75) { bd = d; best = o; } }
    G.t += best + off;
  }
  /* 调试 / 截图用：index.html?dbg=cupola|lab|green|eva|ship|body:mars|sys:trappist1/trappist1_e|cruise:alphacen/alphacen_a */
  function debugView(d) {
    const [k, v] = d.split(':');
    if (params.get('t')) G.t += +params.get('t');
    if (params.get('day')) pickDay(+params.get('day'));
    if (k === 'cupola') { P.pos.set(0, -1.9, 0); P.pitch = -1.0; P.yaw = +(params.get('yaw') || 0); }
    else if (k === 'at') { P.pos.set(+params.get('x'), +(params.get('y') || 0), +params.get('z')); P.yaw = +(params.get('yaw') || 0); P.pitch = +(params.get('pitch') || 0); }
    else if (k === 'lab') { P.pos.set(1.6, 0.1, 0); P.yaw = -Math.PI / 2; }
    else if (k === 'hab') { P.pos.set(-1.8, 0.1, 0); P.yaw = Math.PI / 2; }
    else if (k === 'node') { P.pos.set(0.6, 0.2, -0.6); P.yaw = +(params.get('yaw') || 0.8); P.pitch = -0.3; }
    else if (k === 'green') { P.pos.set(0, 0, 1.6); P.yaw = Math.PI; }
    else if (k === 'eva') { G.damage = 2; P.pos.set(+(params.get('x') || 55), +(params.get('y') || 22), +(params.get('z') || 62)); setMode('eva'); P.q.setFromRotationMatrix(new THREE.Matrix4().lookAt(P.pos, new V3(8, 2, 0), new V3(0, 1, 0))); }
    else if (k === 'ship') { G.docked = false; ship.group.position.set(150, 20, 60); setMode('pilot'); ship.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(ship.group.position, new V3(0, 0, 0), new V3(0, 1, 0))); }
    else if (k === 'body' || k === 'sys') {
      let body = v; if (k === 'sys') { const [s, b] = v.split('/'); enterSystem(s); body = b; }
      G.docked = false; setAF(frameFor(body)); AF.group.add(ship.group); ship.group.position.set(0, 0, 0); ship.group.quaternion.copy(ORBIT_Q); G.shipBody = body; setMode('pilot');
    }
    else if (k === 'cruise') { G.docked = false; ship.group.position.x += 200; setMode('pilot'); startCruise(v); cruise.f = +(params.get('f') || 0.3); if (params.get('hold')) cruise.dur = 1e9; }
    else if (k === 'sky') { setMode('sky'); const d = W.eq2w(Math.cos(83 * DEG), Math.sin(83 * DEG), 0, new V3()); cam.position.copy(W.byId.earth.pos).addScaledVector(d, 1e9); cam.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(cam.position, cam.position.clone().add(d), new V3(0, 1, 0))); if (v === 'tex') { W.starPts.visible = false; W.skyBoost = 5; } else W.sky.visible = false; }
    else if (k === 'journey-test') {
      FILM=true;
      window.journeyTest={
        orbit(system,body){lockedBody=null;cruise=null;photo=null;survey=false;surveyInput.forward=surveyInput.side=surveyInput.height=0;document.body.classList.remove('photo');if(G.sys!==system)enterSystem(system);G.docked=false;setAF(frameFor(body));AF.update(G.t);AF.group.add(ship.group);ship.group.position.set(0,0,0);ship.group.quaternion.copy(ORBIT_Q);G.shipBody=body;setMode('pilot');},
        snapshot:captureFlight,restore:restoreFlight,persist(){G.flight=captureFlight();localStorage.setItem(SAVE_KEY,JSON.stringify(G));},
        key:onKey,photoHidden:()=>!ship.group.visible,
        placeNear(id,altitude){const body=W.byId[id];ship.group.position.copy(bodyLocal(body)).add(new V3(0,body.def.R+altitude,0));SV.set(0,0,0);},
        targetInCamera(){return lockedBody?bodyLocal(lockedBody).sub(ship.group.position).applyQuaternion(ship.group.quaternion.clone().invert()).applyQuaternion(cam.quaternion.clone().invert()).normalize().toArray():null;},
        scan,closePanel,journal:()=>G.observations,credits:()=>G.credits,lock:toggleLock,nearby:()=>nearestBody()?.body.def.id,
        collisionProbe(bodyId,span,offset=0){
          const body=W.byId[bodyId],center=body.pos.clone().sub(AF.group.position).applyQuaternion(AF.group.quaternion.clone().invert());
          const start=center.clone().add(new V3(-span,offset,0)),next=center.clone().add(new V3(span,offset,0)),velocity=new V3(span*60,0,0);
          const hit=protectFlight(start,next,velocity);
          return {hit:hit?.def.id,position:next.sub(center).toArray(),speed:velocity.length(),minimum:body.def.R+surfaceMargin(body)};
        },
        start:startCruise,step:frame,toggleSurvey,setKey(code,value){keys[code]=value;},aim(direction){cam.quaternion.identity();ship.group.quaternion.setFromUnitVectors(new V3(0,0,-1),new V3(...direction).normalize());},
        photo(yaw=.8,pitch=.8,dist=150){if(!photo)togglePhoto();photo.yaw=yaw;photo.pitch=pitch;photo.dist=dist;},
        state(){return {locked:lockedBody?.def.id,approachLimited,velocity:SV.toArray(),actualAltitude:ship.group.position.clone().add(new V3(0,AF?.r||0,0)).length()-(AF?.body.def.R||0),radius:AF?.body.def.R,survey,phase:AF?.th0,altitude:AF?.alt,orbitRadius:AF?.r,cameraLocalQ:cam.quaternion.toArray(),system:G.sys,body:AF?.body.def.id,mode:G.mode,photo:!!photo,cruising:!!cruise,f:cruise?.f||0,duration:cruise?.dur||0,time:G.t,ship:ship.group.position.toArray(),camera:cam.position.toArray(),worldCamera:cam.getWorldPosition(new V3()).toArray(),shipWorld:ship.group.getWorldPosition(new V3()).toArray(),shipInCamera:cam.worldToLocal(ship.group.getWorldPosition(new V3())).toArray(),cameraQ:cam.getWorldQuaternion(new Q()).toArray(),shipQ:ship.group.getWorldQuaternion(new Q()).toArray(),root:W.root.position.toArray(),textures:TextureAssets.status()};}
      };
    }
    else if (k === 'test') selfTest();
    else if (k === 'film') setupFilm();
    if (params.get('photo')) { togglePhoto(); const [y, pt, d, fv] = params.get('photo').split(',').map(Number); photo.yaw = y; photo.pitch = pt; photo.dist = d; if (fv) photo.fov = fv; }
    if (params.get('panel') === 'nav') { navSel = params.get('sel'); if (params.get('lin')) StarMap.setLog(false); setTimeout(() => StarMap.open(params.get('map'), params.get('mf')), 300); }
  }
  /* 自动走一遍主要流程，结果写进 <pre id="selftest">（index.html?dbg=test） */
  async function selfTest() {
    const log = [], wait = ms => new Promise(r => setTimeout(r, ms)), ok = (c, m) => log.push((c ? 'ok   ' : 'FAIL ') + m);
    addEventListener('error', e => log.push('FAIL exception: ' + e.message));
    for (const k in ACTS) ACTS[k].real = 0.2;
    W.render = () => { };   // 测试只验证逻辑，不渲染
    setInterval(() => frame(performance.now()), 30);   // 无头浏览器里 rAF 不可靠，测试时自己驱动主循环
    const until = async (f, ms = 6000) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < ms) await wait(50); return f(); };
    const doAt = async (x, y, z, id) => { P.pos.set(x, y, z); P.vel.set(0, 0, 0); await wait(120); const t = target(); if (t !== id) { log.push(`FAIL target at ${id}: got ${t}`); return; } interact(); if (!act) log.push('     (no act started for ' + id + ')'); const r = await until(() => !act); if (!r) log.push('     (act stuck: left=' + act.left + ' rate=' + act.rate + ')'); };
    try {
      await wait(300);
      P.pos.set(0, -1.9, 0); await wait(200); ok(G.flags.cupola, 'cupola');
      G.needs.food = 30; await doAt(-4.2, 0, 0.3, 'eat'); ok(G.flags.ate && G.needs.food > 60, 'eat');
      await doAt(-6.3, -0.3, 0, 'exercise'); ok(G.flags.exercised, 'exercise');
      await doAt(4, 0, -0.2, 'exp'); ok(G.flags.exp && G.credits >= 8, 'experiment');
      P.pos.set(6.8, 0.1, 0.5); await wait(120); ok(target() === 'terminal', 'terminal target'); interact(); ok(panel === 'terminal', 'terminal panel'); closePanel();
      await doAt(0, 0, 4.2, 'garden'); ok(G.flags.garden, 'garden');
      G.needs.energy = 20; await doAt(-8.6, 0, -0.2, 'sleep'); ok(G.flags.slept && G.needs.energy > 90, 'sleep');
      await wait(300); ok(G.step === 7 && G.damage === 2, 'missions advanced to EVA step, damage set: step=' + G.step);
      await doAt(0, 0, -4.0, 'airlock'); ok(G.mode === 'eva', 'EVA started');
      P.pos.copy(repairPos()); await wait(150); ok(target() === 'repair', 'repair target'); interact(); await until(() => !act); ok(G.damage < 0 && G.flags.repaired, 'repaired');
      P.pos.copy(station.evaHatch); await wait(150); ok(target() === 'hatch', 'hatch target'); interact(); await until(() => !act); ok(G.mode === 'iva', 'back inside');
      ok(inside(P.pos, 0.22), 'player inside collision volume after EVA');
      await doAt(10.3, 0, 0, 'dock'); ok(G.mode === 'pilot' && G.flags.boarded, 'boarded');
      undock(); await wait(500); ok(!G.docked && ship.group.position.x > DOCK_POS.x, 'undocked and drifting');
      const fly = async key => { navSel = key; openNav(); startCruise(key); if (!cruise) { log.push('FAIL cruise did not start: ' + key); return; } cruise.dur = 0.6; await until(() => !cruise, 8000); await wait(200); };
      await fly('sol/moon'); ok(AF.body.def.id === 'moon' && G.mode === 'pilot', 'arrived moon; sunFactor=' + W.sunFactor.toFixed(2));
      scan(); ok(G.scanned.moon && panel === 'scan', 'scan moon'); closePanel();
      await fly('sol/mars'); ok(AF.body.def.id === 'mars' && W.sunFactor > 0.9, 'arrived mars on day side'); scan(); closePanel();
      await fly('trappist1/trappist1_e'); ok(G.sys === 'trappist1' && AF.body.def.id === 'trappist1_e' && !stationFrame, 'arrived TRAPPIST-1e; ship local pos ' + ship.group.position.length().toFixed(1));
      await fly('trappist1/trappist1_s'); ok(AF.body.def.id === 'trappist1_s', 'in-system hop to star');
      await fly('sol/station'); ok(G.sys === 'sol' && AF === stationFrame && !G.docked, 'returned to station vicinity, dist ' + ship.group.position.distanceTo(DOCK_POS).toFixed(0));
      ok(target() === 'autodock', 'autodock offered'); interact(); auto.dur = 0.5; await until(() => G.docked); ok(G.docked && G.flags.returned, 'docked');
      await wait(300); ok(G.step === STEPS.length, 'all missions complete: ' + G.step + '/' + STEPS.length);
      interact(); await wait(100); ok(G.mode === 'iva' && inside(P.pos, 0.22), 'left ship into station');
      for (const k of ['energy', 'food', 'health', 'mood']) ok(Number.isFinite(G.needs[k]), 'need ' + k + '=' + G.needs[k].toFixed(1));
      for (const k in G.res) ok(Number.isFinite(G.res[k]) && G.res[k] >= 0, 'res ' + k + '=' + (+G.res[k]).toFixed(1));
      for (const s of SYSTEMS) for (const b of s.bodies) { const T = travel1g(1e12); if (!(b.R > 0 && b.GM > 0 && b.facts.length)) log.push('FAIL data ' + b.id); }
      const T = travel1g(4.37 * LY); ok(Math.abs(T.ship / YEAR - 3.58) < 0.05 && Math.abs(T.earth / YEAR - 5.97) < 0.08, `1g to 4.37 ly: ship ${(T.ship / YEAR).toFixed(2)} y, earth ${(T.earth / YEAR).toFixed(2)} y`);
      const H = hohmann(AU, 1.52368 * AU, GMSUN); ok(Math.abs(H.T / DAY - 259) < 2, 'Hohmann to Mars ' + (H.T / DAY).toFixed(0) + ' d, dv ' + ((H.dv1 + H.dv2) / 1000).toFixed(2));
    } catch (e) { log.push('FAIL threw: ' + e.stack); }
    document.title = log.some(l => l.startsWith('FAIL')) ? 'SELFTEST FAIL' : 'SELFTEST OK';
    const pre = document.createElement('pre'); pre.id = 'selftest'; pre.textContent = document.title + '\n' + log.join('\n'); document.body.appendChild(pre);
  }
  /* 录制宣传片（index.html?dbg=film）：不走实时循环，由 tools/make-video.mjs 逐帧调用 film.step(i) 并截图，每帧固定 1/30 秒。 */
  function setupFilm() {
    FILM = true; document.body.classList.add('film');
    const cap = document.createElement('div'); cap.id = 'caption'; document.body.appendChild(cap);
    const ease = t => smooth(clamp(t)), local = (x, y, z, tx, ty, tz) => { cam.position.set(x, y, z); cam.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(cam.position, new V3(tx, ty, tz), new V3(0, 1, 0))); };
    // 抵达后镜头脱离飞船，绕着它缓慢转动（和游戏里的观景模式一样）
    const orbitShip = (text, yaw, pitch, d) => {
      if (cruise) return;
      if (cam.parent !== AF.group) { G.mode = 'film'; AF.group.add(cam); $('cruise').style.display = 'none'; cap.textContent = text; }
      const c = ship.group.position, cp = Math.cos(pitch); local(c.x + d * cp * Math.sin(yaw), c.y + d * Math.sin(pitch), c.z + d * cp * Math.cos(yaw), c.x, c.y, c.z);
    };
    const inStation = dim => { G.mode = 'film'; stationFrame.group.add(cam); filmDim = dim; $('cruise').style.display = 'none'; };
    // 挑一个空间站正飞在昼半球上空的时刻开场
    pickDay(-250); G.warp = 1;
    const SHOTS = [
      [6, '星环站 · 近地轨道 408 公里 · 每 93 分钟绕地球一圈', () => inStation(false), u => { const a = 0.75 + u * 0.7; local(Math.cos(a) * 120 + 12, 40 - u * 10, Math.sin(a) * 120, 12, 2, 0); }],
      [6, '舱外采用 NASA 发布的国际空间站模型 · 真实比例', () => inStation(false), u => { const e = ease(u); local(lerp(-14, 22, e), lerp(11, 6, e), lerp(26, 13, e), lerp(-2, 12, e), 1, 0); }],
      [6.5, '居住舱 → 节点舱 → 实验舱', () => inStation(true), u => { const x = lerp(-8.4, 8.3, ease(u)); local(x, 0.05 + Math.sin(u * 9) * 0.04, Math.sin(u * 6) * 0.12, x + 3, 0.02, Math.sin(u * 6 + 1) * 0.5); }],
      [4, '穹顶舱 · 脚下是按真实日期与时刻计算的地球', () => inStation(true), u => local(0.1, -1.72, 0.05, 0.1 + Math.sin(u * 2) * 0.8, -3.2, 0.9 - u * 1.2)],
      [3.5, '温室舱 · 百日菊、生菜与红叶罗马生菜', () => inStation(true), u => { const z = lerp(1.7, 5.2, ease(u)); local(0.25, 0.3, z, -1.2, -0.25, z + 1.6); }],
      [3.5, '气闸舱 · 舱外航天服', () => inStation(true), u => { const z = lerp(-1.4, -2.3, ease(u)); local(0.05, 0.12, z, Math.sin(u * 3.2 - 1.6) * 0.9, 0.05, z - 1.2); }],
      [3.5, '实验舱 · 微重力科学手套箱', () => inStation(true), u => local(lerp(5.4, 4.0, ease(u)), 0.05, lerp(0.75, 0.25, ease(u)), 4.0, -0.02, -0.9)],
      [4.5, '「远航者号」脱离对接', () => { inStation(false); G.docked = false; }, u => { ship.group.position.set(DOCK_POS.x + u * u * 26, 0, 0); ship.group.quaternion.copy(DOCK_Q); local(DOCK_POS.x - 22 + u * 6, 13, 36, ship.group.position.x - 28, 0, 0); }],
      [9, '1g 聚变推进 · 前往月球', () => { filmDim = false; setMode('pilot'); startCruise('sol/moon'); cruise.dur = 4.2; }, u => orbitShip('月球停泊轨道 · 晨昏线上的环形山', 0.4 + u * 1.3, 0.42, 150)],
      [11, '加速、中点翻转、减速 · 前往土星', () => { setMode('pilot'); startCruise('sol/saturn'); cruise.dur = 5; }, u => orbitShip('土星停泊轨道 · 土星与土星环', 1.2 + u * 1.1, 0.85, 190)],
      [12.5, '相对论巡航 · 前往 40.7 光年外的 TRAPPIST-1（星空因光行差向前聚拢）', () => { setMode('pilot'); startCruise('trappist1/trappist1_e'); cruise.dur = 7.2; }, u => orbitShip('TRAPPIST-1 e · 一颗位于宜居带的岩质行星', 0.5 + u * 1.2, 0.5, 160)],
    ];
    let cur = -1; const starts = []; let acc = 0; for (const s of SHOTS) { starts.push(acc); acc += s[0]; }
    window.film = {
      frames: Math.round(acc * 30),
      step(i) {
        const t = i / 30; let k = SHOTS.length - 1; while (k > 0 && t < starts[k]) k--;
        if (k !== cur) { cur = k; cap.textContent = SHOTS[k][1]; SHOTS[k][2](); }
        SHOTS[k][3]((t - starts[k]) / SHOTS[k][0]);
        frame(); return i;
      },
    };
  }
  init();
})();
