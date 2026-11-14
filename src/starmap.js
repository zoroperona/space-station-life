'use strict';
/* 多级星图（M 键）。五个层级，由小到大：
     行星系（行星和它的卫星）→ 恒星系 → 太阳邻域（55 光年内的全部恒星，三维）→ 银河系 → 本星系群。
   单击选择，双击进入下一层，滚轮缩放（缩到最小再往外滚回到上一层），拖动平移 / 旋转，退格键或“上一层”按钮返回。
   距离都是真实的：恒星系与行星系默认用对数比例（否则内行星挤成一个点），可切换为真实比例。 */
const StarMap = (function () {
  const LEVELS = ['planet', 'system', 'local', 'galaxy', 'group'];
  const TITLE = { group: '本星系群', galaxy: '银河系', local: '太阳邻域' };
  const LYPC = 3.26156, R0 = 26.67;                       // 每秒差距的光年数；太阳到银心的距离（千光年）
  const GAL = [[-0.0548755604, -0.8734370902, -0.4838350155], [0.4941094279, -0.4448296300, 0.7469822445], [-0.8676661490, -0.1980763734, 0.4559837762]];
  const eq2gal = (x, y, z) => GAL.map(r => (r[0] * x + r[1] * y + r[2] * z) * LYPC);   // 赤道坐标（秒差距）→ 银道坐标（光年）：x 指向银心，y 指向银河旋转方向，z 指向北银极
  let lastGo = 0, H, cv, g, W2, H2, dpr, level, focus, logScale = true, view, hits = [], hover = null, trans = null, wheelAcc = 0, near = null, galImg = null, glyphs = {};
  // 星名中文对照（HYG 星表里的 IAU 专名）
  const CN = { Sol: '太阳', 'Proxima Centauri': '比邻星', 'Rigil Kentaurus': '南门二 A', Toliman: '南门二 B', "Barnard's Star": '巴纳德星', 'Wolf 359': '沃尔夫 359', 'Lalande 21185': '拉兰德 21185', Sirius: '天狼星',
    'Ross 154': '罗斯 154', 'Ross 248': '罗斯 248', Ran: '天苑四', 'Lacaille 9352': '拉卡伊 9352', 'Ross 128': '罗斯 128', 'EZ Aqr': '宝瓶座 EZ', Procyon: '南河三', 'Struve 2398 A': '斯特鲁维 2398 A', 'Struve 2398 B': '斯特鲁维 2398 B',
    'Groombridge 34': '格鲁姆布里奇 34', "Luyten's Star": '鲁坦星', "Kapteyn's Star": '卡普坦星', 'Lacaille 8760': '拉卡伊 8760', 'Kruger 60': '克鲁格 60', 'Ross 614': '罗斯 614', "Van Maanen's Star": '范玛南星', 'Wolf 1061': '沃尔夫 1061',
    Keid: '波江座 40', Altair: '牛郎星（河鼓二）', Alsafi: '天龙座 σ', Achird: '仙后座 η', Guniibuu: '蛇夫座 36', '82 G. Eri': '波江座 82', Vega: '织女星', Fomalhaut: '北落师门', 'p Eridani': '波江座 p', Tabit: '参旗六', Chara: '常陈一',
    Rana: '天苑三', 'Groombridge 1830': '格鲁姆布里奇 1830', Pollux: '北河三', 'Alula Australis': '下台二', Zavijava: '右执法', Denebola: '五帝座一', Arcturus: '大角星', Muphrid: '右摄提一', Porrima: '东上相', 'Deneb Algedi': '垒壁阵四',
    Copernicus: '巨蟹座 55', Capella: '五车二', Titawin: '仙女座 υ', Alshain: '河鼓三', Chalawan: '大熊座 47', Errai: '少卫增八', Dalim: '天炉座 α', Talitha: '上台一', Rasalhague: '候', Alchiba: '右辖', Alderamin: '天钩五',
    Cervantes: '天坛座 μ', Castor: '北河二', Helvetios: '飞马座 51', Caph: '王良一' };
  const GREEK = { Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ', Eta: 'η', The: 'θ', Iot: 'ι', Kap: 'κ', Lam: 'λ', Mu: 'μ', Nu: 'ν', Xi: 'ξ', Omi: 'ο', Pi: 'π', Rho: 'ρ', Sig: 'σ', Tau: 'τ', Ups: 'υ', Phi: 'φ', Chi: 'χ', Psi: 'ψ', Ome: 'ω' };
  const CON = { Aql: '天鹰座', Aur: '御夫座', Boo: '牧夫座', Cap: '摩羯座', Cas: '仙后座', Cep: '仙王座', Cet: '鲸鱼座', Cir: '圆规座', Com: '后发座', Cyg: '天鹅座', Dor: '剑鱼座', Dra: '天龙座', Eri: '波江座', Gem: '双子座', Her: '武仙座',
    Hyi: '水蛇座', Ind: '印第安座', LMi: '小狮座', Lep: '天兔座', Lup: '豺狼座', Men: '山案座', Oph: '蛇夫座', Ori: '猎户座', Pav: '孔雀座', Peg: '飞马座', Per: '英仙座', Phe: '凤凰座', Psc: '双鱼座', Pup: '船尾座', Ret: '网罟座',
    Sco: '天蝎座', Ser: '巨蛇座', Tau: '金牛座', TrA: '南三角座', Tri: '三角座', Tuc: '杜鹃座', UMa: '大熊座', Vir: '室女座' };
  function starName(i) {
    const n = NEAR.n[i]; if (CN[n]) return CN[n];
    if (n.includes('|')) { const [a, c] = n.split('|'), [g, k] = a.split('-'); return (CON[c] || c) + ' ' + (GREEK[g] || g) + (k ? '¹²³⁴⁵'[k - 1] || k : ''); }
    return n.replace(/^Gl /, 'GJ ').replace(/^NN /, 'GJ ') || '无名恒星';
  }

  const sysOf = id => SYSTEMS.find(s => s.id === id);
  const fmtLy = ly => ly < 0.1 ? (ly * 63241).toFixed(0) + ' AU' : ly < 1e4 ? (ly < 100 ? ly.toFixed(1) : Math.round(ly).toLocaleString()) + ' 光年' : ly < 1e6 ? (ly / 1e4).toFixed(ly < 1e5 ? 2 : 1) + ' 万光年' : (ly / 1e6).toFixed(2) + ' 百万光年';
  const fmtAU = au => au < 0.01 ? fmtDist(au * AU) : au < 10 ? au.toFixed(au < 0.1 ? 4 : 2) + ' AU' : au.toFixed(0) + ' AU';
  const fmtKm = m => m < 1e7 ? Math.round(m / 1e3).toLocaleString() + ' km' : (m / 1e7).toFixed(m < 1e8 ? 2 : 1) + ' 万 km';
  const hex = c => '#' + c.toString(16).padStart(6, '0');
  const starRGB = T => { const c = W.tempColor(T); return `rgb(${c[0] * 255 | 0},${c[1] * 255 | 0},${c[2] * 255 | 0})`; };
  const bvRGB = bv => starRGB(4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)));

  /* ---------- 数据 ---------- */
  function nearData() {
    if (near) return near;
    const n = NEAR.n.length, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = eq2gal(NEAR.s[i * 5], NEAR.s[i * 5 + 1], NEAR.s[i * 5 + 2]); p[i * 3] = v[0]; p[i * 3 + 1] = v[1]; p[i * 3 + 2] = v[2]; }
    const sys = SYSTEMS.map(s => ({ s, p: eq2gal(s.pc[0], s.pc[1], s.pc[2]) }));
    // 和本船资料库里的恒星系重合的星表恒星不再单独标注
    const dup = new Uint8Array(n);
    for (let i = 0; i < n; i++) for (const q of sys) if (Math.hypot(p[i * 3] - q.p[0], p[i * 3 + 1] - q.p[1], p[i * 3 + 2] - q.p[2]) < 0.35) { dup[i] = 1; break; }
    return (near = { n, p, sys, dup });
  }
  function bodyAngle(def, t) { return (def.L0 + 360 * (t / DAY) / def.P) * DEG; }
  function probeAU(d, t) { return d.au0 + d.rate * ((t + J2000_UNIX) / YEAR - (2025 - 1970)); }
  function probeXY(d, t) { const v = W.eq2w(Math.cos(d.dec * DEG) * Math.cos(d.ra * DEG), Math.cos(d.dec * DEG) * Math.sin(d.ra * DEG), Math.sin(d.dec * DEG), new THREE.Vector3()), r = probeAU(d, t); return [v.x * r, -v.z * r, r]; }
  function galXY(l, b, ly) { const c = Math.cos(b * DEG) * ly / 1000; return [-c * Math.sin(l * DEG), -R0 + c * Math.cos(l * DEG)]; }   // 银河系俯视图（千光年，银心为原点，从北银极往下看）
  function groupXY(l, b, ly) { const c = Math.cos(b * DEG) * ly; return [-c * Math.sin(l * DEG), c * Math.cos(l * DEG)]; }

  /* ---------- 绘图辅助 ---------- */
  function ball(x, y, r, col, lx = -0.4, ly = -0.4) {
    const gr = g.createRadialGradient(x + lx * r, y + ly * r, r * 0.1, x, y, r);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, col); gr.addColorStop(1, 'rgba(0,0,0,0.85)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  function glow(x, y, r, col, a = 1) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.15, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over';
  }
  function label(x, y, text, sub, o = {}) {
    g.font = `${o.bold ? '600 ' : ''}${o.size || 12}px "PingFang SC","Microsoft YaHei",sans-serif`; g.textBaseline = 'middle'; g.textAlign = o.align || 'left';
    g.lineWidth = 3; g.strokeStyle = 'rgba(2,4,10,0.85)'; g.strokeText(text, x, y); g.fillStyle = o.color || '#d6e4ff'; g.fillText(text, x, y);
    if (sub) { g.font = '10.5px "PingFang SC",sans-serif'; g.strokeText(sub, x, y + 14); g.fillStyle = o.subColor || '#7f93b8'; g.fillText(sub, x, y + 14); }
  }
  let Q = [];
  function tag(x, y, r, text, sub, o = {}, pri = 50) { Q.push({ x, y, r, text, sub, o, pri }); }
  function flushTags() {
    const boxes = hits.filter(h => h.obst !== false).map(h => [h.x - h.r + 3, h.y - h.r + 3, h.x + h.r - 3, h.y + h.r - 3]).concat([[0, 0, W2, 44], [W2 - 470, H2 - 26, W2, H2]]), over = b => b[0] < 4 || b[2] > W2 - 4 || b[1] < 4 || b[3] > H2 - 4 || boxes.some(q => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]);
    Q.sort((a, b) => b.pri - a.pri);
    for (const t of Q) {
      g.font = `${t.o.bold ? '600 ' : ''}${t.o.size || 12}px "PingFang SC","Microsoft YaHei",sans-serif`; let w = g.measureText(t.text).width;
      if (t.sub) { g.font = '10.5px "PingFang SC",sans-serif'; w = Math.max(w, g.measureText(t.sub).width); }
      const h = t.sub ? 26 : 13, R = t.r + 5, cands = { r: [t.x + R, t.y, 'left', t.x + R, t.y - 7], l: [t.x - R, t.y, 'right', t.x - R - w, t.y - 7], a: [t.x, t.y - R - h + 4, 'center', t.x - w / 2, t.y - R - h - 3], b: [t.x, t.y + R + 9, 'center', t.x - w / 2, t.y + R + 2] };
      let done = false;
      for (const k of t.o.pos || 'rlab') {
        const c = cands[k], b = [c[3] - 2, c[4] - 1, c[3] + w + 2, c[4] + h];
        if (!over(b) || (t.o.force && k === (t.o.pos || 'r')[0] && !done && false)) { label(c[0], c[1], t.text, t.sub, Object.assign({}, t.o, { align: c[2] })); boxes.push(b); done = true; break; }
      }
      if (!done && t.o.force) { const c = cands[(t.o.pos || 'r')[0]]; label(c[0], c[1], t.text, t.sub, Object.assign({}, t.o, { align: c[2] })); boxes.push([c[3], c[4], c[3] + w, c[4] + h]); }
    }
    Q = [];
  }
  function ring(x, y, r, color, w = 1, dash) { g.strokeStyle = color; g.lineWidth = w; g.setLineDash(dash || []); g.beginPath(); g.arc(x, y, Math.max(0.5, r), 0, 7); g.stroke(); g.setLineDash([]); }
  function band(x, y, r1, r2, color) { g.fillStyle = color; g.beginPath(); g.arc(x, y, Math.max(0, r2), 0, Math.PI * 2); g.moveTo(x + Math.max(0, r1), y); g.arc(x, y, Math.max(0, r1), 0, Math.PI * 2); g.fill('evenodd'); }
  function hit(x, y, r, key, o = {}) { hits.push(Object.assign({ x, y, r: Math.max(r, 7), key }, o)); }
  function selRing(x, y, r, t) { const k = 1 + 0.12 * Math.sin(t * 4); ring(x, y, (r + 7) * k, 'rgba(120,220,255,0.95)', 1.6); }
  function hereMark(x, y, r, t) { const k = (t * 0.8) % 1; ring(x, y, r + 6 + k * 22, `rgba(255,214,107,${(1 - k) * 0.9})`, 1.5); tag(x, y, r + 4, '你在这里', null, { size: 11, color: '#ffd66b', pos: 'ab', force: true }, 95); }
  function shipMarker(x,y){
    if(x<0||x>W2||y<0||y>H2)return;
    g.fillStyle='#ffd66b';g.beginPath();g.moveTo(x,y-6);g.lineTo(x-4,y+5);g.lineTo(x+4,y+5);g.closePath();g.fill();
    tag(x,y,7,'飞船',null,{size:11,color:'#ffd66b',force:true},180);
  }
  function distLine(x1, y1, x2, y2, text) {
    g.strokeStyle = 'rgba(120,220,255,0.6)'; g.lineWidth = 1; g.setLineDash([5, 5]); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]);
  }
  function scaleBar(unitPerPx, unit, fmt) {
    const target = 120 * unitPerPx, p = Math.pow(10, Math.floor(Math.log10(target))), v = [1, 2, 5, 10].map(k => k * p).filter(k => k <= target).pop(), w = v / unitPerPx;
    const x = 24, y = H2 - 26; g.strokeStyle = '#9fb4d8'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y - 5); g.stroke();
    label(x, y - 14, fmt ? fmt(v) : v + ' ' + unit, null, { size: 11, color: '#9fb4d8' });
  }

  /* ---------- 层级：恒星系 ---------- */
  function sysMapping(sys, minR) {
    const top = sys.bodies.filter(b => b.kind !== 'moon'), as = top.filter(b => b.a).map(b => b.a / AU);
    if (sys.id === 'sol') as.push(50);                                      // 柯伊伯带外缘；更远的日球层顶和探测器画在边缘外侧
    let amin = Math.min(...as), amax = Math.max(...as);
    if (!as.length) { amin = 0.01; amax = 1; }
    const lo = Math.log10(amin) - 0.35, hi = Math.log10(amax) + 0.08, rOut = Math.min(W2, H2) * 0.45 * view.z, rIn = minR * view.z;
    return { top, amax, f: a => logScale ? rIn + (Math.log10(Math.max(a, 1e-9)) - lo) / (hi - lo) * (rOut - rIn) : a / amax * rOut, lo, hi };
  }
  function drawSystem(t, now) {
    const sys = sysOf(focus.sys), cx = W2 / 2 + view.px, cy = H2 / 2 + view.py, M = sysMapping(sys, 26), f = M.f, cur = H.cur(), sel = H.getSel();
    const stars = sys.bodies.filter(b => b.kind === 'star'), Lsum = stars.reduce((s, b) => s + b.lum, 0);
    // 参考圈：对数比例时按 10 的幂次，真实比例时按整齐的间隔
    if (logScale) for (let k = Math.ceil(M.lo); k <= Math.floor(M.hi); k++) { const r = f(Math.pow(10, k)); ring(cx, cy, r, 'rgba(110,140,200,0.18)', 1, [2, 6]); label(cx + r * 0.71 + 4, cy + r * 0.71, fmtAU(Math.pow(10, k)), null, { size: 10, color: '#5f7398' }); }
    else { const step = Math.pow(10, Math.floor(Math.log10(M.amax / view.z))); for (let a = step; a <= M.amax * 1.3; a += step) { const r = f(a); ring(cx, cy, r, 'rgba(110,140,200,0.14)', 1, [2, 6]); } scaleBar(M.amax / (Math.min(W2, H2) * 0.44 * view.z), 'AU', v => fmtAU(v)); }
    // 宜居带（保守估计：恒星光度 L，内外边界约为 √(L/1.1) 和 √(L/0.53) AU）
    const hz1 = Math.sqrt(Lsum / 1.1), hz2 = Math.sqrt(Lsum / 0.53);
    band(cx, cy, f(hz1), f(hz2), 'rgba(80,200,120,0.11)'); tag(cx, cy - (f(hz1) + f(hz2)) / 2, 2, '宜居带', null, { size: 10, color: '#6fcf8f', pos: 'ab' }, 26);
    if (sys.id === 'sol') {
      band(cx, cy, f(2.2), f(3.3), 'rgba(170,150,120,0.10)'); tag(cx - f(2.75), cy, 2, '小行星带', null, { size: 10, color: '#9a8c74', pos: 'lab' }, 25);
      band(cx, cy, f(30), f(50), 'rgba(140,160,200,0.08)'); tag(cx, cy + f(40), 2, '柯伊伯带', null, { size: 10, color: '#7f8fb0', pos: 'ab' }, 25);
      ring(cx, cy, f(121), 'rgba(120,170,255,0.35)', 1.2, [8, 4]); tag(cx, cy - f(121), 2, '日球层顶 · 太阳风的边界（≈120 AU）', null, { size: 10, color: '#7fa6e0', pos: 'ba' }, 20);
    }
    // 轨道与天体
    const pos = {}, curBody = cur.sys === sys.id ? (cur.body === 'station' ? 'earth' : cur.body) : null, curMoonParent = curBody && sys.bodies.find(b => b.id === curBody && b.kind === 'moon');
    for (const b of M.top) {
      let x = cx, y = cy;
      if (b.a) { const r = f(b.a / AU), L = bodyAngle(b, t); x = cx + r * Math.cos(L); y = cy - r * Math.sin(L); ring(cx, cy, r, b.kind === 'star' ? 'rgba(255,220,150,0.25)' : sel === sys.id + '/' + b.id ? 'rgba(124,224,255,0.55)' : 'rgba(150,175,230,0.28)', 1, b.kind === 'star' ? [3, 4] : null); }
      pos[b.id] = [x, y];
    }
    for (const b of M.top) {
      const [x, y] = pos[b.id], key = sys.id + '/' + b.id, moons = sys.bodies.filter(m => m.parent === b.id && m.kind === 'moon');
      let r;
      if (b.kind === 'star') { r = clamp(7 + 2.5 * Math.log10(b.R / RSUN + 0.05), 4, 13); glow(x, y, r * 4.5, starRGB(b.T)); ball(x, y, r, starRGB(b.T), 0, 0); }
      else {
        r = clamp(3 + 3.2 * Math.log10(b.R / 1e6), 2.2, 11);
        const lx = (cx - x), ly = (cy - y), d = Math.hypot(lx, ly) || 1;
        if (b.ring) { g.strokeStyle = 'rgba(220,200,160,0.7)'; g.lineWidth = 1.4; g.beginPath(); g.ellipse(x, y, r * 2.1, r * 0.75, -0.35, 0, 7); g.stroke(); }
        ball(x, y, r, hex(b.color), lx / d * 0.45, ly / d * 0.45);
        if (moons.length) { for (let i = 0; i < Math.min(moons.length, 4); i++) { const a = now * 0.4 + i * 1.7; g.fillStyle = 'rgba(200,210,230,0.7)'; g.beginPath(); g.arc(x + Math.cos(a) * (r + 5 + i * 2.5), y + Math.sin(a) * (r + 5 + i * 2.5), 1.1, 0, 7); g.fill(); } }
      }
      hit(x, y, r, key, { enter: moons.length ? { level: 'planet', focus: { sys: sys.id, body: b.id } } : null });
      const dist = b.a ? fmtAU(b.a / AU) : '';
      tag(x, y, r, b.name+(H.explored?.(b.id)?' ✓':''), b.kind === 'star' ? b.sub : dist + (moons.length ? ` · ${moons.length} 颗卫星` : ''), { size: b.kind === 'star' ? 13 : 12, bold: b.kind === 'star', force: key === sel || b.id === curBody }, (b.kind === 'star' ? 90 : 60) + (key === sel ? 100 : 0) + (b.id === curBody ? 50 : 0) + Math.log10(b.R));
      if (key === sel) selRing(x, y, r, now);
      if (!H.shipPosition && (b.id === curBody || (curMoonParent && curMoonParent.parent === b.id))) hereMark(x, y, r, now);
    }
    // 深空探测器（只在太阳系）
    if (sys.id === 'sol') for (const d of DEEP.filter(d => d.level === 'system')) {
      const [px, py, au] = probeXY(d, t), lim = Math.min(W2, H2) * 0.47 * view.z, rr = Math.min(f(au), lim), a = Math.atan2(py, px), x = cx + rr * Math.cos(a), y = cy - rr * Math.sin(a);
      g.save(); g.translate(x, y); g.rotate(-a + Math.PI / 2); g.fillStyle = '#e8eef8'; g.beginPath(); g.moveTo(0, -5); g.lineTo(3.5, 3); g.lineTo(-3.5, 3); g.closePath(); g.fill(); g.restore();   // 箭头指向它飞离的方向
      tag(x, y, 4, d.name, '约 ' + au.toFixed(0) + ' AU' + (f(au) > lim ? '（在图外）' : ''), { size: 11, color: '#c8d4ea' }, 30 + ('deep/' + d.id === sel ? 100 : 0)); hit(x, y, 5, 'deep/' + d.id);
      if (sel === 'deep/' + d.id) selRing(x, y, 4, now);
    }
    // 从当前位置到所选天体的连线
    const sb = sel && sel.startsWith(sys.id + '/') && sel.split('/')[1];
    if (curBody && sb && pos[sb]) {
      const from = pos[curMoonParent ? curMoonParent.parent : curBody], b = sys.bodies.find(q => q.id === sb), c2 = sys.bodies.find(q => q.id === (curMoonParent ? curMoonParent.parent : curBody));
      if (from && b && c2 && b.id !== c2.id) { const pa = planar(b, t), pc = planar(c2, t); distLine(from[0], from[1], pos[sb][0], pos[sb][1], '当前距离 ' + fmtAU(Math.hypot(pa[0] - pc[0], pa[1] - pc[1]))); }
    }
    const ship=cur.sys===sys.id&&H.shipPosition?.();
    if(ship){
      const radius=Math.hypot(ship.x,ship.z),angle=Math.atan2(-ship.z,ship.x),r=radius>0?Math.max(0,f(radius/AU)):0;
      const x=cx+r*Math.cos(angle),y=cy-r*Math.sin(angle);shipMarker(x,y);
      if(sb&&pos[sb])distLine(x,y,pos[sb][0],pos[sb][1]);
    }
    hint(logScale ? '对数比例 · 对准行星滚轮放大或双击，可展开卫星轨道' : '真实比例 · 对准行星滚轮放大或双击，可展开卫星轨道');
  }
  const planar = (b, t) => { if (!b.a) return [0, 0]; const L = bodyAngle(b, t), r = b.a / AU; return [r * Math.cos(L), r * Math.sin(L)]; };

  /* ---------- 层级：行星系 ---------- */
  function drawPlanet(t, now) {
    const sys = sysOf(focus.sys), P = sys.bodies.find(b => b.id === focus.body), moons = sys.bodies.filter(b => b.parent === P.id && b.kind === 'moon'), cur = H.cur(), sel = H.getSel();
    const cx = W2 / 2 + view.px, cy = H2 / 2 + view.py, rOut = Math.min(W2, H2) * 0.44 * view.z;
    const extra = P.id === 'earth' ? [{ id: 'station', name: '星环站', a: RE + 4.08e5, P: 92.7 / 1440, L0: 0, key: 'sol/station', sub: '高度 408 km · 每 93 分钟一圈' }] : [];
    const all = moons.concat(extra), amax = Math.max(...all.map(m => m.a)) * 1.15, lo = Math.log10(P.R) - 0.35, hi = Math.log10(amax);
    const f = a => logScale ? (Math.log10(a) - lo) / (hi - lo) * rOut : a / amax * rOut;
    const sun = sys.bodies.find(b => b.kind === 'star'), sa = P.a ? bodyAngle(P, t) + Math.PI : 0, lx = Math.cos(sa) * 0.5, ly = -Math.sin(sa) * 0.5;   // 光从恒星方向照来
    if (logScale) for (let k = Math.ceil(lo); k <= Math.floor(hi); k++) { const r = f(Math.pow(10, k)); ring(cx, cy, r, 'rgba(110,140,200,0.16)', 1, [2, 6]); label(cx + r * 0.71 + 4, cy + r * 0.71, fmtKm(Math.pow(10, k)), null, { size: 10, color: '#5f7398' }); }
    else scaleBar(amax / rOut, 'm', v => fmtKm(v));
    if (P.id === 'earth') { ring(cx, cy, f(4.2164e7), 'rgba(255,190,120,0.35)', 1, [4, 4]); label(cx, cy - f(4.2164e7) - 9, '地球同步轨道 · 35,786 km', null, { align: 'center', size: 10, color: '#d8a870' }); }
    if (P.ring) { band(cx, cy, f(P.ring[0]), f(P.ring[1]), 'rgba(220,200,160,0.28)'); label(cx + f(P.ring[1]) + 4, cy + 12, '主环', null, { size: 10, color: '#c8b48a' }); }
    const pr = Math.max(f(P.R), 5);
    if (P.atmo) glow(cx, cy, pr * 1.25, 'rgba(120,170,255,0.25)', 0.0);
    ball(cx, cy, pr, hex(P.color), lx, ly);
    tag(cx, cy, pr, P.name, logScale ? '圆盘大小与轨道距离同一比例' : '真实大小', { size: 13, bold: true, pos: 'bral', force: true }, 90);
    hit(cx, cy, pr, sys.id + '/' + P.id); if (sel === sys.id + '/' + P.id) selRing(cx, cy, pr, now);
    const curId = cur.sys === sys.id ? cur.body : null; if (!H.shipPosition && curId === P.id) hereMark(cx, cy, pr, now);
    for (const m of all) {
      const r = f(m.a), L = bodyAngle(m, t), x = cx + r * Math.cos(L), y = cy - r * Math.sin(L), key = m.key || sys.id + '/' + m.id;
      ring(cx, cy, r, key === sel ? 'rgba(124,224,255,0.55)' : m.id === 'station' ? 'rgba(255,214,107,0.4)' : 'rgba(150,175,230,0.28)', 1);
      const rr = m.id === 'station' ? 3 : clamp(2.5 + 3 * Math.log10(m.R / 1e6), 2, 8);
      if (m.id === 'station') { g.fillStyle = '#ffd66b'; g.fillRect(x - 3, y - 1, 6, 2); g.fillRect(x - 1, y - 3, 2, 6); } else ball(x, y, rr, hex(m.color), lx, ly);
      tag(x, y, rr, m.name+(H.explored?.(m.id)?' ✓':''), m.id === 'station' ? m.sub : fmtKm(m.a) + ' · ' + fmtDur(Math.abs(m.P) * DAY) + (m.P < 0 ? ' · 逆行' : ''), { size: 12, force: key === sel }, 60 + (key === sel ? 100 : 0));
      hit(x, y, rr, key); if (key === sel) selRing(x, y, rr, now);
      if (!H.shipPosition && curId === m.id) hereMark(x, y, rr, now);
    }
    const ship=cur.sys===sys.id&&H.shipPosition?.(),parent=W.byId[P.id];
    if(ship&&parent){
      const relative=ship.clone().sub(parent.pos).applyQuaternion(parent.tilt.quaternion.clone().invert());
      const angle=Math.atan2(-relative.z,relative.x),r=Math.max(0,f(Math.max(P.R,Math.hypot(relative.x,relative.z))));
      const x=cx+r*Math.cos(angle),y=cy-r*Math.sin(angle);shipMarker(x,y);
      const selected=hits.find(h=>h.key===sel);if(selected)distLine(x,y,selected.x,selected.y);
    }
    hint(P.id === 'earth' ? '空间站离地面只有 408 公里——放在这张图上几乎贴着地球。月球远在 38 万公里外' : logScale ? '对数比例 · 卫星按当前真实位置绘制' : '真实比例');
  }

  /* ---------- 层级：太阳邻域（三维） ---------- */
  function proj(p, out) {
    const cy_ = Math.cos(view.yaw), sy_ = Math.sin(view.yaw), ct = Math.cos(view.tilt), st = Math.sin(view.tilt);
    const h1 = -p[1], h2 = p[0], r = h1 * cy_ - h2 * sy_, fw = h1 * sy_ + h2 * cy_, up = fw * ct + p[2] * st, depth = p[2] * ct - fw * st;
    const F = Math.min(W2, H2) * 0.44 / 58 * 190 * view.z, k = F / (190 - depth);
    out[0] = W2 / 2 + view.px + r * k; out[1] = H2 / 2 + view.py - up * k; out[2] = depth; out[3] = k; return out;
  }
  function drawLocal(t, now) {
    const N = nearData(), cur = H.cur(), sel = H.getSel(), q = [0, 0, 0, 0], q2 = [0, 0, 0, 0];
    // 银道面网格：每 10 光年一圈，每 30° 一条经线
    g.lineWidth = 1;
    for (let R = 10; R <= 50; R += 10) {
      g.strokeStyle = R === 50 ? 'rgba(110,150,220,0.32)' : 'rgba(110,150,220,0.16)'; g.beginPath();
      for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2; proj([R * Math.cos(a), R * Math.sin(a), 0], q); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }
      g.stroke(); proj([0, -R, 0], q); label(q[0] + 3, q[1] + 8, R + ' 光年', null, { size: 10, color: '#5f7398' });
    }
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; proj([0, 0, 0], q); proj([50 * Math.cos(a), 50 * Math.sin(a), 0], q2); g.strokeStyle = 'rgba(110,150,220,0.10)'; g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q2[0], q2[1]); g.stroke(); }
    proj([56, 0, 0], q); label(q[0], q[1], '→ 银心方向（2.67 万光年外）', null, { align: 'center', size: 11, color: '#8fa8d8' });
    proj([0, 56, 0], q); label(q[0], q[1], '银河旋转方向', null, { align: 'center', size: 10, color: '#6f86b0' });
    // 恒星：由远到近绘制
    const order = []; for (let i = 0; i < N.n; i++) { proj([N.p[i * 3], N.p[i * 3 + 1], N.p[i * 3 + 2]], q); order.push([q[2], i, q[0], q[1], q[3]]); }
    order.sort((a, b) => a[0] - b[0]);
    const curSys = N.sys.find(o => o.s.id === cur.sys);
    for (const [, i, x, y, k] of order) {
      if (i === 0 || N.dup[i]) continue;
      const M = NEAR.s[i * 5 + 3], named = !!CN[NEAR.n[i]], r = clamp(0.6 + (8 - M) * 0.17, 0.5, 3.6) * Math.sqrt(k / 2.2), col = bvRGB(NEAR.s[i * 5 + 4]);
      if (named) { proj([N.p[i * 3], N.p[i * 3 + 1], 0], q2); g.strokeStyle = 'rgba(140,170,230,0.22)'; g.beginPath(); g.moveTo(x, y); g.lineTo(q2[0], q2[1]); g.stroke(); g.fillStyle = 'rgba(140,170,230,0.35)'; g.fillRect(q2[0] - 1, q2[1] - 1, 2, 2); }
      if (M < 4) glow(x, y, r * 5, col, 0.6);
      g.fillStyle = col; g.globalAlpha = clamp(0.35 + (10 - M) * 0.07, 0.35, 1); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.globalAlpha = 1;
      const key = 'star/' + i; hit(x, y, r + 2, key, { obst: named });
      if (named) tag(x, y, r, starName(i), null, { size: 10.5, color: '#a8b8d8' }, 20 - M);
      if (key === sel || key === hover) { selRing(x, y, r, now); if (!named || key === sel) tag(x, y, r, starName(i), null, { size: 11.5, color: '#e6efff', force: true }, 150); }
    }
    // 本船资料库中的恒星系（可前往）
    for (const o of N.sys) {
      const p = o.p; proj(p, q); proj([p[0], p[1], 0], q2);
      g.strokeStyle = 'rgba(124,224,255,0.45)'; g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q2[0], q2[1]); g.stroke(); ring(q2[0], q2[1], 2.5, 'rgba(124,224,255,0.5)');
      const st = o.s.bodies.find(b => b.kind === 'star'), r = o.s.id === 'sol' ? 4.5 : 3.8;
      glow(q[0], q[1], r * 4, starRGB(st.T), 0.8); ball(q[0], q[1], r, starRGB(st.T), 0, 0);
      const key = o.s.id + '/' + st.id, d = Math.hypot(p[0], p[1], p[2]);
      tag(q[0], q[1], r + 2, o.s.name, o.s.id === 'sol' ? null : fmtLy(d), { size: 12.5, bold: true, color: '#7ce0ff', force: !!(sel && sel.startsWith(o.s.id + '/')) }, 85 + (sel && sel.startsWith(o.s.id + '/') ? 100 : 0));
      hit(q[0], q[1], r + 3, key, { enter: { level: 'system', focus: { sys: o.s.id } } });
      if (sel && sel.startsWith(o.s.id + '/')) selRing(q[0], q[1], r, now);
      if (o === curSys) hereMark(q[0], q[1], r, now);
    }
    // 从当前位置到所选目标的连线
    let tp = null, tname = '';
    if (sel && sel.startsWith('star/')) { const i = +sel.slice(5); tp = [N.p[i * 3], N.p[i * 3 + 1], N.p[i * 3 + 2]]; }
    else if (sel) { const o = N.sys.find(o => sel.startsWith(o.s.id + '/')); if (o) tp = o.p; }
    if (tp && curSys && Math.hypot(tp[0] - curSys.p[0], tp[1] - curSys.p[1], tp[2] - curSys.p[2]) > 0.3) { proj(curSys.p, q); proj(tp, q2); distLine(q[0], q[1], q2[0], q2[1], fmtLy(Math.hypot(tp[0] - curSys.p[0], tp[1] - curSys.p[1], tp[2] - curSys.p[2]))); }
    hint('以太阳为中心、半径 55 光年内的全部 1315 颗已知恒星（多数是肉眼看不见的红矮星）。拖动旋转 · 竖线连到银道面，表示恒星在银河盘面上方还是下方');
  }

  /* ---------- 层级：银河系 ---------- */
  function galaxyImage() {
    if (galImg) return galImg;
    const S = 2048, E = 60, k = S / (2 * E), c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d'), rnd = W.rng(42), gauss = () => { let u = 0; for (let i = 0; i < 4; i++) u += rnd(); return (u - 2) / 0.577; };
    const P = (X, Y) => [S / 2 + X * k, S / 2 - Y * k];
    x.globalCompositeOperation = 'lighter';
    const dots = (n, fn, col, sz) => { x.fillStyle = col; for (let i = 0; i < n; i++) { const v = fn(); if (!v) continue; const [px, py] = P(v[0], v[1]); x.fillRect(px, py, sz, sz); } };
    // 旋臂：对数螺线 ln(R/Rref) = -(β-βref)·tanψ（参数取自 Reid 等 2019 年的脉泽视差测量，远端为外推），β 为银心方位角，0 指向太阳，沿银河旋转方向增大
    const ARMS = [['perseus', 8.87, 40, 10.3, -170, 150, 1], ['scucen', 4.91, 23, 14.1, -150, 200, 1], ['sgrcar', 6.04, 24, 13.1, -130, 170, 0.8], ['norma', 4.46, 18, 12.5, -160, 230, 0.7], ['local', 8.26, 9, 11.4, -35, 45, 0.4]];
    const armPt = (a, beta) => { const R = a[1] * Math.exp(-(beta - a[2]) * DEG * Math.tan(a[3] * DEG)) * LYPC, b = beta * DEG; return [-R * Math.sin(b), -R * Math.cos(b), R]; };
    W.galArms = { ARMS, armPt };
    // 盘面弥散星光（指数盘，标长约 8.5 千光年）
    dots(220000, () => { const R = -8.5 * Math.log(1 - rnd() * 0.997), a = rnd() * 7; return R > 56 ? null : [R * Math.cos(a), R * Math.sin(a)]; }, 'rgba(150,160,200,0.05)', 2);
    // 核球与棒（棒半长约 1.6 万光年，与日心-银心连线夹角约 27°）
    const bar = 27 * DEG;
    dots(90000, () => { const u = gauss() * 5.5, v = gauss() * 1.7; return [-u * Math.sin(bar) + v * Math.cos(bar), -u * Math.cos(bar) - v * Math.sin(bar)]; }, 'rgba(255,205,140,0.07)', 2);
    dots(70000, () => { const r = Math.abs(gauss()) * 2.6, a = rnd() * 7; return [r * Math.cos(a), r * Math.sin(a)]; }, 'rgba(255,225,175,0.10)', 2);
    for (const a of ARMS) {
      const n = 160000 * a[6], w = a[0] === 'local' ? 0.8 : 1.7, rng2 = a[5] - a[4];
      dots(n, () => { const be = a[4] + rnd() * rng2, p = armPt(a, be); if (p[2] < 10 || p[2] > 56) return null; const s = gauss() * w * (0.55 + p[2] / 45), al = gauss() * 1.2; return [p[0] + s * -Math.sin(be * DEG) * 0 + s * Math.cos(be * DEG) * 0.0 + (s * p[0] / p[2]) + al * Math.cos(be * DEG), p[1] + (s * p[1] / p[2]) - al * Math.sin(be * DEG)]; }, 'rgba(160,190,255,0.075)', 2);
      // 恒星形成区：一团团的年轻亮星和电离氢区
      for (let k = 0; k < 260 * a[6]; k++) {
        const be = a[4] + rnd() * rng2, p = armPt(a, be); if (p[2] < 11 || p[2] > 52) continue;
        const ox = p[0] + gauss() * 0.9 * w, oy = p[1] + gauss() * 0.9 * w, pink = rnd() < 0.45;
        dots(26, () => [ox + gauss() * 0.28, oy + gauss() * 0.28], pink ? 'rgba(255,120,185,0.22)' : 'rgba(210,228,255,0.25)', 2);
      }
    }
    // 辉光
    const blur = (px, a) => { const c2 = document.createElement('canvas'); c2.width = c2.height = S; const y = c2.getContext('2d'); y.filter = `blur(${px}px)`; y.drawImage(c, 0, 0); x.globalAlpha = a; x.drawImage(c2, 0, 0); x.globalAlpha = 1; };
    blur(3, 0.55); blur(16, 0.5);
    // 尘埃带：沿旋臂内侧把星光“擦”暗
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = 'rgba(0,0,0,0.11)';
    for (const a of ARMS) for (let i = 0; i < 26000 * a[6]; i++) { const be = a[4] + rnd() * (a[5] - a[4]), p = armPt(a, be); if (p[2] < 17 || p[2] > 48) continue; const s = 0.955 + gauss() * 0.018, [px, py] = P(p[0] * s + gauss() * 0.35, p[1] * s + gauss() * 0.35); x.fillRect(px, py, 3, 3); }
    x.globalCompositeOperation = 'source-over';
    return (galImg = { c, E, S });
  }
  function drawGalaxy(t, now) {
    const G = galaxyImage(), sel = H.getSel(), s = Math.min(W2, H2) * 0.47 / 55 * view.z, cx = W2 / 2 + view.px, cy = H2 / 2 + view.py;
    const P = (X, Y) => [cx + X * s, cy - Y * s];
    g.globalCompositeOperation = 'lighter'; g.drawImage(G.c, cx - G.E * s, cy - G.E * s, 2 * G.E * s, 2 * G.E * s); g.globalCompositeOperation = 'source-over';
    // 旋臂名称（标在靠近太阳的一段）
    const { ARMS, armPt } = W.galArms, NAMES = { perseus: ['英仙臂', 20], scucen: ['盾牌-半人马臂', -60], sgrcar: ['人马-船底臂', 5], norma: ['矩尺臂 → 外臂', -100], local: ['猎户臂（本地臂）', 22] };
    for (const a of ARMS) { const p = armPt(a, NAMES[a[0]][1]), [x, y] = P(p[0], p[1]); tag(x, y, 1, NAMES[a[0]][0], null, { size: 11, color: 'rgba(200,215,255,0.8)', pos: 'abrl' }, 30); }
    const [gx, gy] = P(0, 0); tag(gx, gy, 14, '银心 · 中央棒', null, { size: 11, color: '#ffd9a0', pos: 'ba' }, 35);
    for (const d of DEEP.filter(d => d.level === 'galaxy')) {
      const [X, Y] = galXY(d.l, d.b, d.ly), [x, y] = P(X, Y), key = 'deep/' + d.id, col = { bh: '#ff9a5a', nebula: '#ff8ac8', cluster: '#bfe0ff', star: '#ffb080' }[d.kind];
      g.fillStyle = col; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); ring(x, y, 5.5, col, 1);
      tag(x, y, 5, d.name, fmtLy(d.ly), { size: 11.5, force: key === sel }, 40 + (key === sel ? 100 : 0) - d.ly / 1e5);
      hit(x, y, 6, key); if (key === sel) { selRing(x, y, 4, now); const [sx, sy] = P(0, -R0); distLine(sx, sy, x, y, fmtLy(d.ly)); }
    }
    // 太阳与太阳邻域
    const [sx, sy] = P(0, -R0), rn = Math.max(0.055 * s, 5);
    ring(sx, sy, rn, 'rgba(124,224,255,0.9)', 1.3); glow(sx, sy, 10, 'rgba(255,230,150,0.9)', 1);
    tag(sx, sy, rn + 2, '太阳 · 太阳邻域', '距银心 2.67 万光年 · 双击进入', { size: 12.5, bold: true, color: '#7ce0ff', pos: 'lrb', force: true }, 120);
    hereMark(sx, sy, rn, now);
    hit(sx, sy, rn + 4, 'sol/sun', { enter: { level: 'local' } });
    scaleBar(1 / s, 'kly', v => fmtLy(v * 1000));
    hint('银河系俯视图（从北银极往下看，顺时针旋转）。直径约 10 万光年，太阳绕银心一圈约 2.3 亿年。圆圈里就是上一层的“太阳邻域”——在这张图上只是一个点');
  }

  /* ---------- 层级：本星系群 ---------- */
  function spiralGlyph(seed, tint) {
    if (glyphs[seed]) return glyphs[seed];
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), rnd = W.rng(seed);
    x.translate(S / 2, S / 2);
    for (let i = 0; i < 9000; i++) {
      const arm = i % 2, t2 = rnd() * 2.6, R = 12 + t2 * 42, a = arm * Math.PI + t2 * 2.4 + (rnd() - 0.5) * 0.6, rr = R + (rnd() - 0.5) * 14;
      x.fillStyle = rnd() < 0.03 ? 'rgba(255,140,200,0.7)' : tint; x.fillRect(Math.cos(a) * rr, Math.sin(a) * rr, 1.6, 1.6);
    }
    for (let i = 0; i < 5000; i++) { const r = Math.abs((rnd() + rnd() + rnd() - 1.5)) * 30, a = rnd() * 7; x.fillStyle = 'rgba(255,225,170,0.35)'; x.fillRect(Math.cos(a) * r, Math.sin(a) * r, 1.5, 1.5); }
    const c2 = document.createElement('canvas'); c2.width = c2.height = S; const y = c2.getContext('2d'); y.filter = 'blur(3px)'; y.drawImage(c, 0, 0); y.filter = 'none'; y.globalCompositeOperation = 'lighter'; y.drawImage(c, 0, 0);
    return (glyphs[seed] = c2);
  }
  function blobGlyph(seed) {
    if (glyphs[seed]) return glyphs[seed];
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), rnd = W.rng(seed);
    x.filter = 'blur(2px)';
    for (let i = 0; i < 2500; i++) { const r = Math.pow(rnd(), 0.7) * 50, a = rnd() * 7; x.fillStyle = rnd() < 0.05 ? 'rgba(255,150,200,0.7)' : 'rgba(200,215,255,0.35)'; x.fillRect(64 + Math.cos(a) * r * 1.2, 64 + Math.sin(a) * r * 0.7, 2, 2); }
    return (glyphs[seed] = c);
  }
  function drawGroup(t, now) {
    const sel = H.getSel(), cx = W2 / 2 + view.px, cy = H2 / 2 + view.py, rOut = Math.min(W2, H2) * 0.44 * view.z, dmax = 3.2e6, rIn = 46 * view.z, lo = Math.log10(5e4), hi = Math.log10(dmax);
    const f = d => logScale ? rIn + (Math.log10(Math.max(d, 5e4)) - lo) / (hi - lo) * (rOut - rIn) : d / dmax * rOut;
    if (logScale) for (const d of [1e5, 3e5, 1e6, 3e6]) { ring(cx, cy, f(d), 'rgba(110,140,200,0.16)', 1, [2, 6]); label(cx + f(d) * 0.71 + 4, cy + f(d) * 0.71, fmtLy(d), null, { size: 10, color: '#5f7398' }); }
    else { for (let d = 5e5; d <= dmax; d += 5e5) ring(cx, cy, f(d), 'rgba(110,140,200,0.14)', 1, [2, 6]); scaleBar(dmax / rOut, 'ly', fmtLy); }
    // 银河系
    const mwR = logScale ? rIn * 0.85 : Math.max(5e4 / dmax * rOut, 6);
    g.globalCompositeOperation = 'lighter'; g.drawImage(galaxyImage().c, cx - mwR * 1.15, cy - mwR * 1.15, mwR * 2.3, mwR * 2.3); g.globalCompositeOperation = 'source-over';
    tag(cx, cy, mwR, '银河系', '双击进入', { size: 13, bold: true, color: '#7ce0ff', pos: 'brl', force: true }, 90);
    hit(cx, cy, mwR, 'mw', { enter: { level: 'galaxy' } }); hereMark(cx, cy, mwR * 0.4, now);
    for (const d of DEEP.filter(d => d.level === 'group')) {
      const [X, Y] = groupXY(d.l, d.b, d.ly), a = Math.atan2(Y, X), r = f(d.ly), x = cx + r * Math.cos(a), y = cy - r * Math.sin(a), key = 'deep/' + d.id;
      const sz = logScale ? clamp(Math.log10(d.size) * 9 - 22, 5, 30) : Math.max(d.size / 2 / dmax * rOut, 3);
      g.globalCompositeOperation = 'lighter';
      if (d.kind === 'spiral') { g.save(); g.translate(x, y); g.rotate(d.pa * DEG); g.scale(1, Math.cos(d.incl * DEG)); g.drawImage(spiralGlyph(d.id === 'm31' ? 7 : 9, 'rgba(200,215,255,0.4)'), -sz * 1.3, -sz * 1.3, sz * 2.6, sz * 2.6); g.restore(); }
      else if (d.kind === 'irregular') g.drawImage(blobGlyph(d.id.length * 13), x - sz, y - sz, sz * 2, sz * 2);
      else glow(x, y, sz, 'rgba(200,210,240,0.5)', 0.5);
      g.globalCompositeOperation = 'source-over';
      tag(x, y, sz, d.name, fmtLy(d.ly), { size: 12, force: key === sel }, 50 + (key === sel ? 100 : 0));
      hit(x, y, sz, key); if (key === sel) { selRing(x, y, sz * 0.6, now); distLine(cx, cy, x, y, fmtLy(d.ly)); }
    }
    hint('本星系群：80 多个星系，直径约 1000 万光年。银河系和仙女座星系是其中最大的两个。再往外是室女座超星系团和拉尼亚凯亚超星系团——那是几亿光年的尺度，星图到此为止');
  }

  /* ---------- 框架 ---------- */
  let hintText = '';
  const hint = s => { hintText = s; };
  const DRAW = { system: drawSystem, planet: drawPlanet, local: drawLocal, galaxy: drawGalaxy, group: drawGroup };
  function resetView() { view = { z: 1, px: 0, py: 0, yaw: 0.35, tilt: 0.95 }; }
  function frame() {
    if (!cv || !cv.isConnected || document.getElementById('panel').classList.contains('hidden')) { cv = null; return; }
    requestAnimationFrame(frame); draw();
  }
  function draw() {
    const now = performance.now() / 1000, t = H.t();
    const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    W2 = w; H2 = h; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7); bg.addColorStop(0, '#0a1024'); bg.addColorStop(1, '#03050c'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    hits = [];
    // 层级切换动画：进入时从小放大，返回时从大缩小
    let a = 1;
    if (trans) { const k = (now - trans.t0) / 0.35; if (k >= 1) trans = null; else { const e = 1 - Math.pow(1 - k, 3), sc = trans.dir > 0 ? 0.55 + 0.45 * e : 1.8 - 0.8 * e; a = e; g.translate(w / 2, h / 2); g.scale(sc, sc); g.translate(-w / 2, -h / 2); } }
    g.globalAlpha = a; Q = []; DRAW[level](t, now); flushTags(); g.globalAlpha = 1; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (trans) {
      if(trans.previous){const k=clamp((now-trans.t0)/.35),fade=1-k;g.globalAlpha=fade;g.drawImage(trans.previous,0,0,W2,H2);g.globalAlpha=1;}
      hits = [];
    }
    document.getElementById('smapHint').textContent = hintText;
  }
  function crumbs() {
    const sys = focus.sys && sysOf(focus.sys), list = [['group', '本星系群'], ['galaxy', '银河系'], ['local', '太阳邻域']];
    if (LEVELS.indexOf(level) <= 1) list.push(['system', sys.name]);
    if (level === 'planet') list.push(['planet', sys.bodies.find(b => b.id === focus.body).name + '系']);
    document.getElementById('smapCrumbs').innerHTML = list.map(([lv, n], i) => `<button class="crumb ${lv === level ? 'on' : ''}" data-lv="${lv}">${n}</button>`).join('<span class="sep">›</span>');
    document.getElementById('smapUp').disabled = level === 'group';
    const sc = document.getElementById('smapScale'); sc.style.visibility = ['system', 'planet', 'group'].includes(level) ? 'visible' : 'hidden';
    sc.textContent = logScale ? '比例：对数' : '比例：真实';
  }
  function go(lv, f, dir) {
    if (!f) f = {};
    if (lv === 'system' || lv === 'planet') focus = { sys: f.sys || focus.sys, body: f.body || (f.sys ? null : focus.body) }; 
    const previous=document.createElement('canvas');previous.width=cv.width;previous.height=cv.height;previous.getContext('2d').drawImage(cv,0,0);
    level = lv; resetView(); trans = { t0: performance.now() / 1000, dir, previous }; lastGo = trans.t0; wheelAcc = 0; crumbs();
  }
  function up() {
    const i = LEVELS.indexOf(level); if (i >= LEVELS.length - 1) return;
    go(LEVELS[i + 1], null, -1);
  }
  function side() { document.getElementById('smapSide').innerHTML = H.detail(); }
  function select(key) { H.setSel(key); side(); }
  function pick(e) {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = 1e9;
    for (const h of hits) { const d = Math.hypot(h.x - x, h.y - y); if (d < Math.max(h.r + 6, 12) && d < bd) { bd = d; best = h; } }
    return best;
  }

  function open(lv, f) {
    const cur = H.cur();
    focus = { sys: cur.sys, body: null };
    if (f) { const [s, b] = f.split('/'); focus = { sys: s, body: b || null }; }
    level = lv && LEVELS.includes(lv) ? lv : 'system';
    if (level === 'planet' && !focus.body) level = 'system';
    resetView(); trans = { t0: performance.now() / 1000, dir: 1 };
    H.openPanel(`<div class="smap"><div class="smap-top"><div id="smapCrumbs" class="crumbs"></div><div class="smap-tools"><button id="smapScale" class="btn ghost sm"></button><button id="smapUp" class="btn ghost sm">↑ 上一层</button><button class="btn ghost sm" data-a="close">关闭 M</button></div></div>
      <div class="smap-main"><canvas id="smapCv"></canvas><div id="smapHint" class="smap-hint"></div><div class="smap-keys">单击选择 · 双击进入 · 滚轮缩放（缩到底回到上一层） · 拖动${'平移'} · 退格键返回上一层</div></div><div id="smapSide" class="smap-side"></div></div>`);
    cv = document.getElementById('smapCv'); g = cv.getContext('2d'); dpr = Math.min(window.devicePixelRatio || 1, 2);
    crumbs(); side();
    document.getElementById('smapCrumbs').onclick = e => { const b = e.target.closest('[data-lv]'); if (b && b.dataset.lv !== level) go(b.dataset.lv, null, LEVELS.indexOf(b.dataset.lv) > LEVELS.indexOf(level) ? -1 : 1); };
    document.getElementById('smapUp').onclick = up;
    document.getElementById('smapScale').onclick = () => { logScale = !logScale; view.z = 1; view.px = view.py = 0; crumbs(); };
    let drag = null;
    cv.onpointerdown = e => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = e => {
      const h = pick(e); hover = h ? h.key : null; cv.style.cursor = h ? 'pointer' : drag ? 'grabbing' : 'grab';
      if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      if (level === 'local' && !e.shiftKey) { view.yaw -= dx * 0.006; view.tilt = clamp(view.tilt + dy * 0.006, 0.05, 1.5); } else { view.px += dx; view.py += dy; }
    };
    cv.onpointerup = e => { const d = drag; drag = null; if (d && d.moved < 5) { const h = pick(e); if (h) select(h.key); } };
    cv.ondblclick = e => { const h = pick(e); if (h && h.enter) { select(h.key); go(h.enter.level, h.enter.focus, 1); } };
    cv.onwheel = e => {
      e.preventDefault(); if (trans || performance.now() / 1000 - lastGo < 0.8) return;   // 切换层级后短暂冷却，避免一次滚动连跳两层
      const k = Math.exp(-e.deltaY * 0.0015), zmax = level === 'local' ? 5 : logScale ? 6 : 80;
      if (k < 1 && view.z <= 1.001) { wheelAcc += -e.deltaY; if (wheelAcc < -300) up(); return; }
      // Zooming into a planet reveals its satellite system. Require proximity
      // to the pointer so zooming empty space never chooses an unrelated planet.
      if(level==='system' && k>1 && view.z*k>=2.2){
        const rect=cv.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
        const target=hits.filter(h=>h.enter?.level==='planet'&&h.x>=0&&h.x<=W2&&h.y>=0&&h.y<=H2)
          .map(h=>({h,d:Math.hypot(h.x-x,h.y-y)})).filter(q=>q.d<80).sort((a,b)=>a.d-b.d)[0];
        if(target){select(target.h.key);go(target.h.enter.level,target.h.enter.focus,1);return;}
      }
      wheelAcc = 0; const r = cv.getBoundingClientRect(), mx = e.clientX - r.left - W2 / 2 - view.px, my = e.clientY - r.top - H2 / 2 - view.py, nz = clamp(view.z * k, 1, zmax), q = nz / view.z;
      if (level !== 'local') { view.px -= mx * (q - 1); view.py -= my * (q - 1); }
      view.z = nz; if (view.z <= 1.001) { view.px = view.py = 0; }
    };
    requestAnimationFrame(frame); draw();
  }
  return { init(h) { H = h; }, open, up, select, refresh: side, isOpen: () => !!cv, starName, nearData, eq2gal, setLog(v) { logScale = v; }, debug: () => ({ level, focus, hits: hits.map(h => ({ x: h.x, y: h.y, key: h.key, enter: !!h.enter })) }) };
})();
