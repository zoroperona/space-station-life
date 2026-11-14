'use strict';
/* 空间站与飞船的三维模型（全部由几何体拼装，单位米）。
   空间站本体坐标：X 朝飞行方向，Y 朝天顶，Z 沿主桁架。 */
const M = {};
(function () {
  const rng = W.rng;
  function ctex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
  }
  function normalFrom(tex, strength) {
    const src = tex.image, w = src.width, h = src.height, d = src.getContext('2d').getImageData(0, 0, w, h).data;
    const H = new Float32Array(w * h); for (let i = 0; i < w * h; i++) H[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765;
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'), img = g.createImageData(w, h), o = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const xl = (x + w - 1) % w, xr = (x + 1) % w, yu = (y + h - 1) % h, yd = (y + 1) % h;
      let nx = (H[y * w + xl] - H[y * w + xr]) * strength, ny = (H[yd * w + x] - H[yu * w + x]) * strength; const L = Math.hypot(nx, ny, 1), i = (y * w + x) * 4;
      o[i] = (nx / L * .5 + .5) * 255; o[i + 1] = (ny / L * .5 + .5) * 255; o[i + 2] = (1 / L * .5 + .5) * 255; o[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
  }
  const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.7, metalness: 0.1 }, o));
  const glow = (color, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) });

  /* ---------- 贴图 ---------- */
  const hullTex = ctex(512, 512, (g, w, h) => {
    const r = rng(3); g.fillStyle = '#d4d7db'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { const v = 200 + Math.floor(r() * 30); g.fillStyle = `rgb(${v},${v + 2},${v + 5})`; g.fillRect(Math.floor(r() * 8) * 64, Math.floor(r() * 8) * 64, 64 * (1 + Math.floor(r() * 2)), 64); }
    g.strokeStyle = 'rgba(40,45,55,.55)'; g.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
    for (let j = 0; j < 8; j++) for (let i = 0; i < 4; i++) { const x = i * 128 + (j % 2) * 64; g.beginPath(); g.moveTo(x, j * 64); g.lineTo(x, j * 64 + 64); g.stroke(); }
    g.fillStyle = 'rgba(30,30,40,.5)'; for (let i = 0; i < 260; i++) g.fillRect(Math.floor(r() * 64) * 8 + 3, Math.floor(r() * 8) * 64 + 5 + (r() < .5 ? 0 : 52), 2, 2);
    for (let i = 0; i < 10; i++) { g.fillStyle = r() < .5 ? '#3a4150' : '#8a8f98'; g.fillRect(r() * 480, r() * 480, 14 + r() * 30, 8 + r() * 14); }
  });
  const solarTex = ctex(256, 256, (g, w, h) => {
    const r = rng(9); g.fillStyle = '#0a1238'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const b = 44 + Math.floor(r() * 26); g.fillStyle = `rgb(${10 + b / 6},${18 + b / 3},${b + 40})`; g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30); }
    g.strokeStyle = 'rgba(190,200,230,.5)'; g.lineWidth = 1; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); }
    g.strokeStyle = 'rgba(215,170,80,.7)'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2);
  });
  /* 舱壁：以素净的面板为主，少量储物包、抽屉、扶手和屏幕。细节做得大而低对比，远看不会闪。 */
  function rackTex(seed, base, tint) {
    return ctex(1024, 1024, (g, w, h) => {
      const r = rng(seed); g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let c = 0; c < 2; c++) {
        const x0 = c * 512; let y = 10;
        while (y < 1000) {
          const hh = Math.min(150 + Math.floor(r() * 190), 1014 - y), k = r(), x = x0 + 14, ww = 484, v = (r() - .5) * .07;
          g.fillStyle = v < 0 ? `rgba(0,0,0,${-v})` : `rgba(255,255,255,${v})`; g.fillRect(x, y, ww, hh);
          g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 3; g.strokeRect(x, y, ww, hh);
          if (k < .22 && hh > 120) {            // 白色储物包
            g.fillStyle = 'rgba(255,253,244,.75)'; g.fillRect(x + 22, y + 16, ww - 44, hh - 32); g.strokeStyle = 'rgba(110,100,80,.35)'; g.strokeRect(x + 22, y + 16, ww - 44, hh - 32);
            g.fillStyle = 'rgba(120,125,135,.4)'; g.fillRect(x + 110, y + 16, 14, hh - 32); g.fillRect(x + ww - 124, y + 16, 14, hh - 32);
          } else if (k < .42) {                 // 抽屉
            g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x + ww / 2 - 70, y + hh / 2 - 8, 140, 16); g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(x + ww / 2 - 70, y + hh / 2 - 8, 140, 5);
          } else if (k < .48) {                 // 扶手
            g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + 90, y + hh / 2 - 2, ww - 180, 16); g.fillStyle = tint; g.fillRect(x + 90, y + hh / 2 - 8, ww - 180, 14);
          } else if (k < .53 && hh > 140) {     // 屏幕
            g.fillStyle = '#16202c'; g.fillRect(x + 60, y + 24, ww - 120, hh - 48);
            g.fillStyle = 'rgba(110,190,230,.55)'; for (let i = 0; i < 3; i++) g.fillRect(x + 84, y + 48 + i * 30, 120 + r() * 180, 10);
          } else if (k < .58) {                 // 通风格栅
            g.fillStyle = 'rgba(0,0,0,.22)'; for (let i = 0; i < 6; i++) g.fillRect(x + 80, y + hh / 2 - 54 + i * 18, ww - 160, 8);
          }
          if (r() < .5) { g.fillStyle = 'rgba(40,50,70,.45)'; g.fillRect(x + 18, y + 14, 70, 14); }   // 标签
          y += hh + 8;
        }
        g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 6; g.strokeRect(x0 + 3, 3, 506, 1018);
      }
    });
  }
  const interior = (t) => new THREE.MeshStandardMaterial({ map: t, normalMap: normalFrom(t, 5), normalScale: new THREE.Vector2(.9, .9), color: 0xa8a8a8, roughness: 0.85, metalness: 0.0, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.06, envMapIntensity: 0.2 });

  /* ---------- 几何辅助 ---------- */
  function boxUV(g, sx, sy, sz, t) {
    const uv = g.attributes.uv, d = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * d[f][0] / t, uv.getY(k) * d[f][1] / t); }
  }
  function box(parent, mat, sx, sy, sz, x, y, z, tile) {
    const g = new THREE.BoxGeometry(sx, sy, sz); if (tile) boxUV(g, sx, sy, sz, tile);
    const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); parent.add(m); return m;
  }
  /* 沿指定轴的圆柱 / 圆台。r1 在轴的正方向一端。 */
  function cyl(parent, mat, r1, r0, len, axis, x, y, z, o = {}) {
    const g = new THREE.CylinderGeometry(r1, r0, len, o.seg || 40, 1, !!o.open, o.t0 || 0, o.tl || Math.PI * 2);
    if (o.tile) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * Math.max(r0, r1) / o.tile, uv.getY(i) * len / o.tile); }
    const m = new THREE.Mesh(g, mat);
    if (axis === 'x') m.rotation.z = -Math.PI / 2; else if (axis === 'z') m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z); parent.add(m); return m;
  }
  function struts(parent, mat, list) {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, list.length), o = new THREE.Object3D(), up = new V3(0, 1, 0);
    list.forEach((s, i) => {
      const a = new V3(s[0], s[1], s[2]), b = new V3(s[3], s[4], s[5]);
      o.position.copy(a).add(b).multiplyScalar(.5); o.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
      o.scale.set(s[6], a.distanceTo(b), s[6]); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
    });
    m.frustumCulled = false; parent.add(m); return m;
  }
  /* 沿 Z 轴的桁架：四根纵梁 + 方框 + 斜撑 */
  function trussList(cx, cy, z0, z1, hw, bay, th) {
    const L = [], c = [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]];
    for (const [x, y] of c) L.push([cx + x, cy + y, z0, cx + x, cy + y, z1, th]);
    const n = Math.round((z1 - z0) / bay);
    for (let i = 0; i <= n; i++) {
      const z = z0 + (z1 - z0) * i / n;
      for (let k = 0; k < 4; k++) { const a = c[k], b = c[(k + 1) % 4]; L.push([cx + a[0], cy + a[1], z, cx + b[0], cy + b[1], z, th * .8]); if (i < n) L.push([cx + a[0], cy + a[1], z, cx + b[0], cy + b[1], z + (z1 - z0) / n, th * .6]); }
    }
    return L;
  }
  function holeRects(i0, i1, j0, j1, sp) {
    const ci = sp.c ? sp.c[0] : (i0 + i1) / 2, cj = sp.c ? sp.c[1] : (j0 + j1) / 2, hi = sp.s[0] / 2, hj = sp.s[1] / 2;
    return [[i0, ci - hi, j0, j1], [ci + hi, i1, j0, j1], [ci - hi, ci + hi, j0, cj - hj], [ci - hi, ci + hi, cj + hj, j1]].filter(r => r[1] - r[0] > 1e-3 && r[3] - r[2] > 1e-3);
  }
  /* 舱内的六面墙。spec['x+'] = 'open' 不建墙；= {s:[宽,高], c:[中心]} 开一个舱门 / 舷窗洞。
     s、c 的两个分量顺序：x 面为 (y,z)，y 面为 (z,x)，z 面为 (x,y)。 */
  function room(parent, mat, b, spec, rimMat) {
    const lo = [b[0], b[2], b[4]], hi = [b[1], b[3], b[5]], T = .25, names = 'xyz';
    for (let k = 0; k < 3; k++) for (let s = 0; s < 2; s++) {
      const sp = spec[names[k] + (s ? '+' : '-')]; if (sp === 'open') continue;
      const i = (k + 1) % 3, j = (k + 2) % 3, pk = s ? hi[k] + T / 2 : lo[k] - T / 2;
      const put = (r, m, th, at = pk) => { const size = [0, 0, 0], pos = [0, 0, 0]; size[k] = th; size[i] = r[1] - r[0]; size[j] = r[3] - r[2]; pos[k] = at; pos[i] = (r[0] + r[1]) / 2; pos[j] = (r[2] + r[3]) / 2; box(parent, m, size[0], size[1], size[2], pos[0], pos[1], pos[2], 2.2); };
      // 封角：y 面向 x、z 两个方向各多伸出一个板厚，z 面向 x 方向多伸出一个板厚（通向相邻舱段的开口一侧不伸）
      const ext = (ax, side) => (k === 1 || (k === 2 && ax === 0)) && spec[names[ax] + (side ? '+' : '-')] !== 'open' ? T : 0;
      for (const r of (sp ? holeRects(lo[i], hi[i], lo[j], hi[j], sp) : [[lo[i], hi[i], lo[j], hi[j]]])) {
        if (Math.abs(r[0] - lo[i]) < 1e-6) r[0] -= ext(i, 0); if (Math.abs(r[1] - hi[i]) < 1e-6) r[1] += ext(i, 1);
        if (Math.abs(r[2] - lo[j]) < 1e-6) r[2] -= ext(j, 0); if (Math.abs(r[3] - hi[j]) < 1e-6) r[3] += ext(j, 1);
        put(r, mat, T);
      }
      if (sp && rimMat) {
        const ci = sp.c ? sp.c[0] : (lo[i] + hi[i]) / 2, cj = sp.c ? sp.c[1] : (lo[j] + hi[j]) / 2, a = sp.s[0] / 2, c = sp.s[1] / 2, e = .07;
        const o = .02;
        for (const r of [[ci - a - e, ci - a + o, cj - c - e, cj + c + e], [ci + a - o, ci + a + e, cj - c - e, cj + c + e], [ci - a + o, ci + a - o, cj - c - e, cj - c + o], [ci - a + o, ci + a - o, cj + c - o, cj + c + e]]) put(r, rimMat, .16, s ? hi[k] + .04 : lo[k] - .04);
      }
    }
  }
  function sign(parent, text, x, y, z, rx, ry, w = 1.1, h = .2) {
    const t = ctex(512, 96, (g) => { g.fillStyle = '#12305e'; g.fillRect(0, 0, 512, 96); g.strokeStyle = '#9cc4ff'; g.lineWidth = 4; g.strokeRect(4, 4, 504, 88); g.fillStyle = '#fff'; g.font = 'bold 46px "PingFang SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 50); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ'); parent.add(m); return m;
  }

  /* ---------- 精细道具 ---------- */
  const _up = new V3(0, 1, 0);
  function limb(parent, mat, ax, ay, az, bx, by, bz, r) {
    const a = new V3(ax, ay, az), b = new V3(bx, by, bz), m = new THREE.Mesh(new THREE.CapsuleGeometry(r, a.distanceTo(b), 5, 16), mat);
    m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(_up, b.sub(a).normalize()); parent.add(m); return m;
  }
  function ball(parent, mat, r, x, y, z, sx = 1, sy = 1, sz = 1) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m; }
  function ring(parent, mat, R, t, x, y, z, axis) { const m = new THREE.Mesh(new THREE.TorusGeometry(R, t, 10, 32), mat); if (axis === 'y') m.rotation.x = Math.PI / 2; else if (axis === 'x') m.rotation.y = Math.PI / 2; m.position.set(x, y, z); parent.add(m); return m; }

  /* 舱外航天服（参考 EMU）：硬质上躯干、头盔与镀金面窗、胸前控制模块、背后的生命保障背包和 SAFER 喷气装置。
     本体朝 +Z。stripe：主出舱员的航天服腿上有红色条纹，用来在舱外分辨两个人。 */
  function buildSuit(stripe) {
    const g = new THREE.Group();
    const fab = std(0xefeee8, { roughness: .96, emissive: 0x1d1d1b }), hard = std(0xfbfbfb, { roughness: .42, emissive: 0x1b1b1b }), metal = std(0xaab0b8, { metalness: .9, roughness: .28 });
    const gray = std(0x878b92, { roughness: .9, emissive: 0x0c0c0c }), gold = std(0xe8b040, { metalness: .35, roughness: .18, emissive: 0x3a2808 }), dk = std(0x24272c, { roughness: .6 }), red = std(0xc8201c, { emissive: 0x300404 });
    ball(g, hard, .25, 0, .2, 0, 1, 1.12, .78);                                   // 硬质上躯干
    cyl(g, fab, .2, .215, .3, 'y', 0, -.1, 0, { seg: 24 }); ring(g, metal, .206, .02, 0, .04, 0, 'y');   // 腰部与腰轴承
    ball(g, fab, .215, 0, -.27, 0, 1, .62, .86);
    ring(g, metal, .15, .02, 0, .45, 0, 'y');                                      // 颈圈
    ball(g, hard, .176, 0, .6, -.02); ball(g, gold, .156, 0, .6, .038, 1, .96, 1); // 头盔与镀金面窗
    box(g, hard, .3, .035, .16, 0, .765, -.03); box(g, dk, .07, .05, .06, 0, .8, .03);   // 遮阳罩与头盔摄像机
    for (const sx of [-1, 1]) { box(g, dk, .05, .055, .08, sx * .195, .66, .05); box(g, glow(0xfff4d0, 1), .036, .036, .01, sx * .195, .66, .092); }   // 头盔灯
    box(g, hard, .5, .7, .2, 0, .22, -.27); box(g, hard, .44, .12, .17, 0, .63, -.27); box(g, gray, .42, .5, .02, 0, .22, -.375);   // 生命保障背包
    box(g, hard, .48, .2, .22, 0, -.25, -.26); for (const sx of [-1, 1]) for (const sy of [-1, 1]) box(g, dk, .04, .04, .04, sx * .25, -.25 + sy * .08, -.3);   // SAFER
    struts(g, metal, [[.18, .69, -.3, .18, .86, -.3, .012]]);
    box(g, hard, .27, .17, .1, 0, .2, .2); box(g, glow(0x39d98a, .8), .1, .035, .004, -.05, .245, .252);   // 胸前显示与控制模块
    for (const [x, y, c] of [[.07, .24, 0xd94a3a], [.07, .18, 0x3f7ae0], [-.08, .17, 0xe8b23a], [0, .17, 0x30343a]]) cyl(g, std(c), .016, .016, .02, 'z', x, y, .26, { seg: 12 });
    box(g, std(0x2a4fa8), .07, .045, .004, .13, .33, .178); box(g, red, .07, .02, .004, -.13, .34, .178);   // 任务章
    for (const sx of [-1, 1]) {
      ring(g, metal, .088, .017, sx * .262, .36, 0, 'x');                          // 肩轴承
      limb(g, fab, sx * .3, .36, 0, sx * .37, .1, .04, .078); ball(g, fab, .086, sx * .37, .1, .04);
      limb(g, fab, sx * .37, .1, .04, sx * .33, -.13, .2, .069);
      ring(g, metal, .06, .012, sx * .327, -.155, .217, 'y').rotation.x = 1.0;     // 腕环
      ball(g, gray, .058, sx * .322, -.2, .245, .85, 1.15, .8);                    // 手套
      for (let f = 0; f < 4; f++) limb(g, gray, sx * .322 + (f - 1.5) * .022, -.24, .262, sx * .322 + (f - 1.5) * .024, -.3, .285, .0095);
      limb(g, gray, sx * (.322 - .05), -.2, .26, sx * (.322 - .075), -.25, .29, .011);
      limb(g, fab, sx * .11, -.33, 0, sx * .12, -.6, .02, .098); ball(g, fab, .1, sx * .12, -.6, .02);   // 腿
      limb(g, fab, sx * .12, -.6, .02, sx * .12, -.86, 0, .088);
      ring(g, metal, .09, .012, sx * .12, -.89, 0, 'y');
      box(g, gray, .125, .085, .27, sx * .12, -.95, .045); box(g, dk, .13, .02, .28, sx * .12, -.995, .045);   // 靴
      if (stripe) { ring(g, red, .104, .011, sx * .113, -.42, .006, 'y'); ring(g, red, .093, .011, sx * .12, -.72, .01, 'y'); }
    }
    if (stripe) box(g, red, .5, .03, .005, 0, .5, -.373);
    return g;
  }

  /* 把若干带颜色的部件合并成一个几何体（每株植物只占一次绘制） */
  function mergeParts(parts) {
    let n = 0; const gs = parts.map(p => { const g = p.g.index ? p.g.toNonIndexed() : p.g; g.applyMatrix4(p.m); n += g.attributes.position.count; return g; });
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
    gs.forEach((g, i) => { const c = parts[i].c, k = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); for (let j = 0; j < k; j++) col.set(c, (o + j) * 3); o += k; });
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.computeVertexNormals(); return out;
  }
  /* 一片叶子：根部在原点，沿 +Y 生长；两侧上卷、叶尖外翻、边缘带波浪 */
  function leafGeo(w, l, cup, bend) {
    const g = new THREE.PlaneGeometry(1, 1, 4, 7), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), t = p.getY(i) + .5, wd = w * Math.pow(Math.sin(Math.PI * (t * .88 + .08)), .7), X = x * wd;
      p.setXYZ(i, X, t * l, X * X / w * cup * 4 - t * t * bend + Math.sin(t * 11 + x * 7) * w * .05);
    }
    return g;
  }
  const mat4 = (yaw, tilt, y = 0) => new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationX(tilt)).setPosition(0, y, 0);
  function plantGeo(kind, seed) {
    const r = rng(seed), parts = [], mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    if (kind === 'zinnia') {      // 百日菊：国际空间站上开出的第一批花之一
      const h = .17 + r() * .04;
      parts.push({ g: new THREE.CylinderGeometry(.005, .007, h, 6), m: new THREE.Matrix4().setPosition(0, h / 2, 0), c: [.1, .32, .08] });
      for (let i = 0; i < 6; i++) parts.push({ g: leafGeo(.045, .1, .25, .03), m: mat4(i * 2.4 + r(), 1.05 + r() * .3, .02 + i * h * .12), c: mix([.07, .3, .07], [.14, .42, .1], r()) });
      const pc = r() < .5 ? [.95, .38, .06] : [.9, .16, .3];
      for (let k = 0; k < 2; k++) for (let i = 0; i < 11; i++) parts.push({ g: leafGeo(.024, .05 - k * .012, .2, .01), m: mat4(i / 11 * 6.283 + k * .3, 1.25 - k * .35, h), c: mix(pc, [1, .7, .2], k * .4) });
      parts.push({ g: new THREE.SphereGeometry(.014, 10, 8), m: new THREE.Matrix4().setPosition(0, h + .006, 0), c: [.85, .62, .08] });
    } else {                      // 生菜：三圈叶片的莲座；red 为红叶罗马生菜（Veggie 实验种的品种）
      const red = kind === 'red';
      for (let ringI = 0; ringI < 3; ringI++) {
        const n = 5 + ringI * 2, size = .085 + ringI * .04;
        for (let j = 0; j < n; j++) {
          const t = ringI / 2, c = red ? mix([.3, .5, .12], [.34, .07, .13], t * .8 + r() * .2) : mix([.42, .66, .16], [.09, .36, .09], t * .8 + r() * .2);
          parts.push({ g: leafGeo(size * .78, size * 1.3, .45, .035), m: mat4(j / n * 6.283 + ringI * .7 + r() * .4, .22 + ringI * .42 + r() * .16, .005), c });
        }
      }
    }
    return mergeParts(parts);
  }

  /* 餐桌上的一餐：托盘、复水食品盒、软罐头、玉米饼（太空里用它代替会掉渣的面包）、饮料袋，还有几样飘着的水果和调料 */
  function buildMeal(I, x, y, z) {
    const T = new THREE.Group(); T.position.set(x, y, z); I.add(T);
    const foil = std(0xcfd3d8, { metalness: .85, roughness: .36, emissive: 0x121212 }), tray = std(0x9096a0, { metalness: .7, roughness: .45, emissive: 0x0c0c0c }), wht = std(0xf2f2ee, { emissive: 0x1a1a1a });
    const food = c => std(c, { roughness: .7, emissive: new THREE.Color(c).multiplyScalar(.14) });
    const tg = new THREE.Group(); tg.position.set(-.14, .012, -.02); tg.rotation.y = .14; T.add(tg);
    box(tg, tray, .38, .012, .26, 0, 0, 0);
    for (const [bx, bz, sx, sz] of [[0, .13, .38, .012], [0, -.13, .38, .012], [.19, 0, .012, .26], [-.19, 0, .012, .26]]) box(tg, tray, sx, .026, sz, bx, .008, bz);
    for (const [bx, bz, c] of [[-.115, -.055, 0xc9482e], [0, -.055, 0x5d9a3c], [.115, -.055, 0xe0b548]]) {      // 复水食品盒：透明盖下能看到食物
      box(tg, wht, .104, .012, .104, bx, .012, bz); box(tg, food(c), .088, .02, .088, bx, .024, bz); cyl(tg, wht, .009, .009, .02, 'z', bx, .024, bz - .058, { seg: 10 });
      box(tg, std(0x4a8a3a), .03, .002, .012, bx - .025, .035, bz + .03);
    }
    ball(tg, foil, .058, -.1, .022, .065, 1, .2, 1.3); box(tg, wht, .05, .002, .03, -.1, .034, .065);            // 软罐头
    for (let i = 0; i < 3; i++) cyl(tg, food(i ? 0xe3cc98 : 0xd9bd84), .06, .06, .005, 'y', .03 + i * .004, .012 + i * .006, .065, { seg: 28 });   // 玉米饼
    box(tg, foil, .012, .003, .11, .13, .011, .06); ball(tg, foil, .014, .13, .012, .005, 1, .25, 1.4);         // 勺子
    // 饮料袋：铝箔袋 + 吸管 + 夹子
    const dg = new THREE.Group(); dg.position.set(.2, .1, .05); dg.rotation.set(.2, .5, -.3); T.add(dg);
    ball(dg, foil, .05, 0, 0, 0, 1, 1.45, .32); box(dg, std(0xe07a2a), .06, .05, .002, 0, -.01, .017); limb(dg, wht, .01, .07, 0, .03, .15, 0, .0035); box(dg, std(0x3a6ae0), .016, .012, .012, .016, .1, 0);
    // 飘在桌面上方的东西（微重力下没人会把苹果“放”在桌上）
    const ap = ball(T, food(0xc8202a), .034, .33, .13, -.1, 1, .92, 1); limb(T, std(0x5a3a1a), .33, .16, -.1, .334, .178, -.1, .002);
    ball(T, food(0xf08a1a), .037, .1, .2, .12);
    for (const [bx, by, bz, c, rz] of [[.42, .1, .12, 0xc82a1a, .3], [.47, .16, -.06, 0xe6c22a, -.5]]) {         // 辣酱与芥末
      const b = new THREE.Group(); b.position.set(bx, by, bz); b.rotation.z = rz; T.add(b);
      cyl(b, food(c), .019, .021, .075, 'y', 0, 0, 0, { seg: 16 }); cyl(b, food(c), .008, .019, .02, 'y', 0, .047, 0, { seg: 16 }); cyl(b, wht, .008, .008, .014, 'y', 0, .064, 0, { seg: 10 }); cyl(b, wht, .0216, .0226, .034, 'y', 0, -.004, 0, { seg: 20, open: true, tl: 3.6 });   // 贴在瓶身上的标签
    }
    for (const [bx, bz, c] of [[-.4, .06, 0x2a5aa8], [-.4, -.06, 0x8a3a2a], [-.33, 0, 0x3a8a4a]]) { cyl(T, food(c), .034, .034, .032, 'y', bx, .028, bz, { seg: 20 }); cyl(T, foil, .035, .035, .003, 'y', bx, .0455, bz, { seg: 20 }); ring(T, foil, .01, .002, bx + .012, .048, bz, 'y'); }   // 罐头
    return T;
  }
  function buildLaptop(I, x, y, z, ry, open = 1.9) {
    const g = new THREE.Group(), dk = std(0x1c1e22, { roughness: .5, emissive: 0x060606 }); g.position.set(x, y, z); g.rotation.y = ry; I.add(g);
    box(g, dk, .32, .016, .22, 0, 0, 0); box(g, std(0x34383e), .28, .002, .1, 0, .009, -.04); box(g, std(0x2a2d32), .09, .002, .05, 0, .009, .07);
    const lid = new THREE.Group(); lid.position.set(0, .008, -.11); lid.rotation.x = -(open - Math.PI / 2); g.add(lid);
    box(lid, dk, .32, .21, .01, 0, .105, 0); box(lid, glow(0x9fd0ff, .75), .29, .18, .002, 0, .105, .006);
    for (let i = 0; i < 5; i++) box(lid, glow(0x1a3a6a, 1), .1 + (i * 37 % 11) * .012, .008, .001, -.06, .16 - i * .026, .008);
    return g;
  }
  function buildBag(I, x, y, z, s, ry) {      // 货物转运包（CTB）
    const g = new THREE.Group(), c = std(0xece6d6, { roughness: .97, emissive: 0x1c1b18 }), st = std(0x6a7078, { roughness: .9 }); g.position.set(x, y, z); g.rotation.y = ry; I.add(g);
    box(g, c, s, s * .62, s * .5, 0, 0, 0); for (const dx of [-.28, .28]) box(g, st, s * .07, s * .64, s * .52, dx * s, 0, 0);
    box(g, std(0xffffff, { emissive: 0x222222 }), s * .3, s * .16, .003, 0, s * .12, s * .252); box(g, std(0x2a2d32), s * .22, s * .02, .004, 0, s * .14, s * .253); box(g, st, s * .3, s * .04, s * .04, 0, s * .33, 0);
    return g;
  }

  /* ---------- 精细装置 ---------- */
  function tube(parent, mat, pts, r) { const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new V3(p[0], p[1], p[2]))), pts.length * 10, r, 8), mat); parent.add(m); return m; }
  function decal(parent, w, h, draw, x, y, z, rx = 0, ry = 0, res = 256) {
    const t = ctex(res, Math.max(16, Math.round(res * h / w)), draw), m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
    m.material.color.setScalar(.9); m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ'); parent.add(m); return m;
  }
  const FONT = '"PingFang SC","Microsoft YaHei",sans-serif';
  function switchPanel(g, w, h, seed) {       // 一块开关 / 指示灯面板
    const r = rng(seed); g.fillStyle = '#c9ccd0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#70757c'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
    const cols = Math.max(2, Math.floor(w / 44)), rows = Math.max(2, Math.floor(h / 52));
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const cx = (i + .5) * w / cols, cy = (j + .5) * h / rows, k = r();
      if (k < .45) { g.fillStyle = '#3a3e45'; g.fillRect(cx - 5, cy - 12, 10, 22); g.fillStyle = '#d8dce0'; g.fillRect(cx - 4, cy - (r() < .5 ? 11 : 0), 8, 10); }
      else if (k < .75) { g.fillStyle = r() < .7 ? '#35d07a' : '#f0a030'; g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.fill(); g.strokeStyle = '#444'; g.lineWidth = 2; g.stroke(); }
      else { g.fillStyle = '#22262b'; g.beginPath(); g.arc(cx, cy, 11, 0, 7); g.fill(); g.strokeStyle = '#e8e8e8'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(k * 40) * 10, cy + Math.sin(k * 40) * 10); g.stroke(); }
      g.fillStyle = '#555a62'; g.fillRect(cx - 12, cy + 16, 24, 3);
    }
  }

  /* 跑步机（参考 T2/COLBERT）：隔振支座、跑带与滚筒、扶手、控制屏，以及把人“拉”在跑带上的束缚带和弹力绳 */
  function buildTreadmill(I, x, z) {
    const g = new THREE.Group(); g.position.set(x, -1.1, z); I.add(g);
    const dk = std(0x2a2d32, { roughness: .6, emissive: 0x070707 }), al = std(0xaab0b8, { metalness: .85, roughness: .32, emissive: 0x0c0c0c }), rub = std(0x121315, { roughness: .95 }), blue = std(0x3a5fb0, { roughness: .85, emissive: 0x081226 });
    const beltTex = ctex(256, 64, (c, w, h) => { c.fillStyle = '#1a1c1f'; c.fillRect(0, 0, w, h); c.fillStyle = '#2b2e33'; for (let i = 0; i < w; i += 6) c.fillRect(i, 0, 2, h); c.fillStyle = '#c8ccd0'; for (let i = 8; i < w; i += 40) c.fillRect(i, 30, 16, 4); });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { cyl(g, rub, .055, .055, .05, 'y', sx * .62, .025, sz * .25, { seg: 16 }); cyl(g, al, .03, .03, .03, 'y', sx * .62, .062, sz * .25, { seg: 12 }); }   // 隔振支座
    box(g, dk, 1.5, .07, .56, 0, .11, 0);
    for (const sz of [-1, 1]) { box(g, al, 1.52, .055, .05, 0, .16, sz * .3); box(g, rub, 1.3, .012, .05, 0, .192, sz * .3); }
    for (const sx of [-1, 1]) cyl(g, al, .052, .052, .5, 'z', sx * .69, .145, 0, { seg: 20 });   // 前后滚筒
    box(g, new THREE.MeshStandardMaterial({ map: beltTex, roughness: .9 }), 1.38, .014, .5, 0, .155, 0);
    box(g, dk, .22, .1, .3, .86, .12, 0); cyl(g, al, .05, .05, .12, 'z', .86, .2, 0, { seg: 14 });   // 驱动电机
    for (const sz of [-1, 1]) {                  // 立柱与扶手
      limb(g, al, .72, .16, sz * .3, .8, 1.02, sz * .23, .02); limb(g, al, .78, .8, sz * .25, .3, .78, sz * .31, .016);
      limb(g, rub, .62, .78, sz * .27, .38, .78, sz * .3, .021); limb(g, al, .3, .78, sz * .31, .3, .2, sz * .31, .014);
    }
    limb(g, al, .8, 1.02, -.23, .8, 1.02, .23, .018); limb(g, rub, .8, 1.02, -.13, .8, 1.02, .13, .024);
    const cg = new THREE.Group(); cg.position.set(.84, 1.18, 0); cg.rotation.z = -.25; g.add(cg);   // 控制屏
    box(cg, dk, .05, .22, .34, 0, 0, 0); limb(g, al, .8, 1.02, 0, .84, 1.1, 0, .016);
    decal(cg, .3, .18, (c, w, h) => { c.fillStyle = '#07111c'; c.fillRect(0, 0, w, h); c.fillStyle = '#39d98a'; c.font = 'bold 44px ' + FONT; c.fillText('9.6', 16, 52); c.font = '18px ' + FONT; c.fillText('km/h', 96, 52); c.fillStyle = '#ff6a5a'; c.font = 'bold 30px ' + FONT; c.fillText('♥ 132', 150, 50); c.fillStyle = '#7f9bb8'; c.font = '18px ' + FONT; c.fillText('负荷 0.8 体重   00:24:16', 16, 86); c.strokeStyle = '#5bc8ff'; c.lineWidth = 3; c.beginPath(); for (let i = 0; i < 230; i += 6) c.lineTo(14 + i, 126 - Math.abs(Math.sin(i * .09)) * 22 - (i % 30 < 6 ? 14 : 0)); c.stroke(); }, -.027, 0, 0, 0, -Math.PI / 2);
    for (let i = 0; i < 4; i++) box(cg, glow([0x39d98a, 0xffb347, 0x5bc8ff, 0xff5a4a][i], .9), .012, .02, .03, -.027, -.125, -.09 + i * .06);
    // 束缚系统：腰带 + 肩带 + 弹力绳（微重力下没有它，人一蹬就飘走了）
    ring(g, blue, .17, .028, -.05, .98, 0, 'y'); box(g, al, .05, .04, .03, -.05, .98, .19); box(g, al, .05, .04, .03, -.05, .98, -.19);
    for (const sz of [-1, 1]) {
      tube(g, blue, [[-.05, .99, sz * .1], [-.02, 1.2, sz * .13], [-.09, 1.38, sz * .1], [-.2, 1.3, sz * .08], [-.19, 1.0, sz * .09]], .016);
      tube(g, std(0xd8b020, { roughness: .8, emissive: 0x201800 }), [[-.05, .97, sz * .19], [-.05, .62, sz * .27], [-.05, .22, sz * .3]], .009);
      box(g, al, .04, .05, .03, -.05, .21, sz * .3);
    }
    box(g, std(0xe8e4d8, { roughness: 1, emissive: 0x181816 }), .03, .3, .2, .62, .62, .32).rotation.x = .1;   // 搭在扶手上的毛巾
    return g;
  }

  /* 微重力科学手套箱（参考 MSG）：密闭工作腔、观察窗、一对手套口、侧面的物料气闸、控制面板；腔内是一个流体实验 */
  function buildGlovebox(I, x) {
    const g = new THREE.Group(); g.position.set(x, 0, -1.1); I.add(g);
    const wht = std(0xeceef0, { roughness: .55, emissive: 0x191919 }), dk = std(0x2a2d32, { roughness: .5, emissive: 0x060606 }), al = std(0xaab0b8, { metalness: .85, roughness: .3, emissive: 0x0c0c0c }), rub = std(0x101113, { roughness: 1 });
    box(g, wht, 1.4, 1.0, .12, 0, 0, .06); box(g, wht, 1.4, .09, .38, 0, .455, .31); box(g, wht, .09, .64, .38, -.655, .09, .31);
    box(g, wht, .25, .64, .38, .575, .09, .31); box(g, wht, 1.4, .28, .38, 0, -.36, .31);
    box(g, glow(0xcfe2ee, .55), 1.06, .62, .004, -.085, .09, .123); box(g, glow(0xffffff, 3), .9, .012, .05, -.085, .4, .3);   // 腔内背板与照明
    box(g, new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: .16, roughness: .05, metalness: .3, depthWrite: false }), 1.06, .62, .012, -.085, .09, .497);
    for (const [bx, by, sx, sy] of [[-.085, .415, 1.12, .03], [-.085, -.235, 1.12, .03], [-.63, .09, .03, .68], [.46, .09, .03, .68]]) box(g, dk, sx, sy, .03, bx, by, .505);
    for (const px of [-.32, .12]) {              // 手套口与橡胶手套
      ring(g, al, .088, .016, px, -.03, .505, 'z'); ring(g, rub, .07, .012, px, -.03, .5, 'z');
      limb(g, rub, px, -.03, .49, px + .07, .0, .3, .052); ball(g, rub, .05, px + .08, .01, .25, 1, .8, 1.2);
    }
    // 腔内实验：透明容器里悬浮着一团液体，旁边一台相机和注射器
    box(g, al, .7, .015, .22, .0, -.215, .3);
    cyl(g, new THREE.MeshStandardMaterial({ color: 0xcfeaff, transparent: true, opacity: .25, roughness: .05, depthWrite: false }), .075, .075, .17, 'y', -.1, -.12, .27, { seg: 24 });
    cyl(g, al, .08, .08, .012, 'y', -.1, -.208, .27, { seg: 24 }); cyl(g, al, .08, .08, .012, 'y', -.1, -.03, .27, { seg: 24 });
    ball(g, glow(0xff9a3a, .95), .034, -.1, -.115, .27, 1, 1.12, 1); ball(g, glow(0xffc070, .9), .012, -.07, -.07, .29);
    box(g, dk, .07, .06, .1, .3, -.15, .3); cyl(g, dk, .024, .028, .06, 'x', .235, -.15, .3, { seg: 14 }); cyl(g, glow(0x6fb8ff, .6), .02, .02, .004, 'x', .203, -.15, .3, { seg: 14 });
    limb(g, wht, -.3, -.2, .36, -.2, -.2, .33, .009); limb(g, al, -.2, -.2, .33, -.17, -.2, .32, .003);
    tube(g, rub, [[.33, -.13, .3], [-.02, .1, .2], [.2, .3, .16], [.44, .32, .16]], .006);
    cyl(g, wht, .14, .14, .12, 'x', -.76, .05, .31, { seg: 24 }); cyl(g, al, .15, .15, .03, 'x', -.83, .05, .31, { seg: 24 }); ring(g, dk, .06, .012, -.85, .05, .31, 'x');   // 物料气闸
    decal(g, .21, .5, (c, w, h) => { switchPanel(c, w, h, 31); c.fillStyle = '#07111c'; c.fillRect(14, 14, w - 28, 70); c.fillStyle = '#39d98a'; c.font = '20px ' + FONT; c.fillText('腔压 −0.4 kPa', 20, 40); c.fillStyle = '#5bc8ff'; c.fillText('22.4°C', 20, 68); }, .575, .11, .501, 0, 0, 220);
    cyl(g, std(0xd8281c, { emissive: 0x400808 }), .03, .03, .03, 'z', .575, -.2, .51, { seg: 16 });
    decal(g, .9, .06, (c, w, h) => { c.fillStyle = '#12305e'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 24px ' + FONT; c.textBaseline = 'middle'; c.fillText('微重力科学手套箱 MSG   ·   流体物理实验柜', 14, h / 2 + 1); }, -.1, .455, .501, 0, 0, 640);
    decal(g, .5, .16, (c, w, h) => switchPanel(c, w, h, 12), -.35, -.37, .501, 0, 0, 400); decal(g, .3, .16, (c, w, h) => { c.fillStyle = '#e8c020'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; for (let i = -h; i < w; i += 28) { c.beginPath(); c.moveTo(i, h); c.lineTo(i + 14, h); c.lineTo(i + 14 + h, 0); c.lineTo(i + h, 0); c.fill(); } c.fillStyle = '#e8c020'; c.fillRect(20, 20, w - 40, h - 40); c.fillStyle = '#111'; c.font = 'bold 24px ' + FONT; c.fillText('操作前确认负压', 34, h / 2 + 8); }, .2, -.37, .501, 0, 0, 300);
    for (const sx of [-1, 1]) { limb(g, al, sx * .74, -.3, .53, sx * .74, .3, .53, .015); limb(g, al, sx * .74, -.3, .53, sx * .7, -.3, .47, .012); limb(g, al, sx * .74, .3, .53, sx * .7, .3, .47, .012); }
    const bl = std(0x4a6fc0, { emissive: 0x0a1430 }); limb(g, bl, -.4, -.98, .62, .4, -.98, .62, .02); for (const sx of [-.4, .4]) limb(g, bl, sx, -.98, .62, sx, -1.09, .62, .016);   // 脚限位杆
    return g;
  }

  /* 站务终端：屏幕（内容由游戏实时绘制）、键盘托架、开关面板、便签和耳机 */
  function buildTerminal(I, screenTex, x, y) {
    const g = new THREE.Group(); g.position.set(x, y, 1.1); g.rotation.y = Math.PI; I.add(g);
    const dk = std(0x24272c, { roughness: .5, emissive: 0x070707 }), al = std(0xaab0b8, { metalness: .85, roughness: .3, emissive: 0x0c0c0c }), wht = std(0xeceef0, { roughness: .6, emissive: 0x191919 });
    box(g, wht, 1.5, .86, .05, .1, 0, .025); box(g, dk, 1.0, .68, .05, 0, 0, .06);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(.9, .56), new THREE.MeshBasicMaterial({ map: screenTex })); scr.position.set(0, .015, .0865); g.add(scr);
    for (let i = 0; i < 5; i++) box(g, glow([0x39d98a, 0x39d98a, 0xffb347, 0x39d98a, 0x5bc8ff][i], .9), .02, .012, .004, -.4 + i * .05, -.3, .087);
    decal(g, .36, .7, (c, w, h) => switchPanel(c, w, h, 5), .7, 0, .052, 0, 0, 240);
    const kg = new THREE.Group(); kg.position.set(0, -.5, .2); kg.rotation.x = .38; g.add(kg);     // 键盘托架
    box(kg, dk, .62, .02, .24, 0, 0, 0);
    decal(kg, .56, .16, (c, w, h) => { c.fillStyle = '#1c1f23'; c.fillRect(0, 0, w, h); for (let j = 0; j < 5; j++) for (let i = 0; i < 16; i++) { if (j === 4 && i > 3 && i < 11) continue; c.fillStyle = '#3d4249'; c.fillRect(6 + i * 24.6 + (j % 2) * 5, 6 + j * 22, 20, 17); } c.fillStyle = '#3d4249'; c.fillRect(110, 94, 168, 17); }, -.02, .011, -.02, -Math.PI / 2, 0, 400);
    ball(kg, std(0xc8281c, { emissive: 0x300606 }), .018, .27, .015, .06);
    for (const sx of [-1, 1]) limb(g, al, sx * .26, -.5, .12, sx * .26, -.42, .03, .012);
    for (const [nx, ny, c, rz] of [[-.62, .28, 0xf2dc5a, .08], [-.62, .12, 0xf2a0c0, -.1], [-.6, -.04, 0xa8e0a0, .04]]) { const n = box(g, std(c, { roughness: 1, emissive: new THREE.Color(c).multiplyScalar(.2) }), .1, .1, .002, nx, ny, .052); n.rotation.z = rz; }   // 便签
    const hs = new THREE.Mesh(new THREE.TorusGeometry(.085, .012, 8, 20, Math.PI), dk); hs.position.set(-.62, -.24, .08); g.add(hs);   // 耳机
    for (const sx of [-1, 1]) cyl(g, dk, .036, .036, .03, 'x', -.62 + sx * .085, -.25, .08, { seg: 14 }); limb(g, al, -.62, -.155, .03, -.62, -.155, .1, .006);
    tube(g, std(0x1a1c1f, { roughness: .9 }), [[.4, -.34, .06], [.52, -.6, .1], [.5, -.95, .05], [.3, -1.16, .03]], .012);
    return g;
  }

  /* 舱门：门板、加强筋、观察窗、中央手轮和四周的锁闩。本体朝 +Z（朝向舱内） */
  function buildHatch(I, r, x, y, z, ry, text) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; I.add(g);
    const plate = std(0xc4c8cc, { roughness: .5, metalness: .4, emissive: 0x101010 }), al = std(0x8d939b, { metalness: .85, roughness: .32, emissive: 0x0a0a0a }), ylw = std(0xd8b020, { roughness: .5, emissive: 0x2a2000 }), dk = std(0x202327, { roughness: .5 });
    cyl(g, plate, r, r, .04, 'z', 0, 0, .02, { seg: 40 }); ring(g, al, r - .02, .028, 0, 0, .04, 'z'); ring(g, al, r * .55, .014, 0, 0, .045, 'z');
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8, m = box(g, al, .035, r * .42, .035, Math.sin(a) * r * .76, Math.cos(a) * r * .76, .05); m.rotation.z = -a; }
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, lg = new THREE.Group(); lg.position.set(Math.sin(a) * (r - .09), Math.cos(a) * (r - .09), .05); lg.rotation.z = -a; g.add(lg); box(lg, al, .1, .07, .05, 0, 0, 0); box(lg, ylw, .1, .02, .052, 0, .03, 0); cyl(lg, dk, .014, .014, .06, 'z', 0, -.01, 0, { seg: 10 }); }   // 锁闩
    cyl(g, dk, .075, .075, .02, 'z', 0, r * .33, .045, { seg: 24 }); ring(g, al, .078, .012, 0, r * .33, .055, 'z'); cyl(g, glow(0x1a2a48, 1), .066, .066, .004, 'z', 0, r * .33, .057, { seg: 24 });   // 观察窗
    cyl(g, al, .05, .06, .08, 'z', 0, -r * .12, .08, { seg: 18 }); ring(g, ylw, .15, .016, 0, -r * .12, .13, 'z');   // 手轮
    for (let i = 0; i < 3; i++) { const a = i * 2.094; limb(g, ylw, 0, -r * .12, .125, Math.sin(a) * .15, -r * .12 + Math.cos(a) * .15, .13, .01); }
    decal(g, r * .9, r * .16, (c, w, h) => { c.fillStyle = '#c8281c'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 30px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 1); }, 0, -r * .66, .043, 0, 0, 512);
    return g;
  }

  /* 厨房设备：食品加热器（公文箱式，开盖放入餐包）和饮水分配器（冷 / 热水口，给复水食品注水） */
  function buildGalley(I) {
    const g = new THREE.Group(); g.position.set(-3.3, .25, 1.1); g.rotation.y = Math.PI; I.add(g);
    const body = std(0xd8dce0, { roughness: .45, metalness: .5, emissive: 0x141414 }), dk = std(0x2a2d32, { roughness: .5, emissive: 0x060606 }), al = std(0xaab0b8, { metalness: .85, roughness: .3, emissive: 0x0c0c0c });
    box(g, body, .5, .3, .3, 0, .12, .15); box(g, body, .5, .02, .3, 0, .28, .15); box(g, dk, .44, .012, .26, 0, .292, .15);
    limb(g, al, -.12, .2, .31, .12, .2, .31, .012); for (const sx of [-.12, .12]) limb(g, al, sx, .2, .31, sx, .2, .3, .008);
    for (const sx of [-.2, .2]) box(g, al, .04, .05, .02, sx, .27, .3);
    decal(g, .2, .07, (c, w, h) => { c.fillStyle = '#07111c'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffb347'; c.font = 'bold 40px ' + FONT; c.fillText('82°C 加热中', 12, 60); }, 0, .08, .301, 0, 0, 256);
    box(g, glow(0xff5a3a, .9), .02, .02, .004, .2, .08, .301);
    box(g, body, .5, .22, .22, 0, -.2, .11);                                                    // 饮水分配器
    decal(g, .26, .12, (c, w, h) => { c.fillStyle = '#e8eaec'; c.fillRect(0, 0, w, h); c.fillStyle = '#222'; c.font = 'bold 30px ' + FONT; c.fillText('饮用水  mL', 10, 36); c.fillStyle = '#07111c'; c.fillRect(10, 50, 110, 56); c.fillStyle = '#39d98a'; c.font = 'bold 44px ' + FONT; c.fillText('150', 20, 94); c.fillStyle = '#c8281c'; c.beginPath(); c.arc(170, 78, 22, 0, 7); c.fill(); c.fillStyle = '#2a6ae0'; c.beginPath(); c.arc(224, 78, 22, 0, 7); c.fill(); }, -.08, -.18, .221, 0, 0, 256);
    for (const [sx, c] of [[.12, 0xc8281c], [.2, 0x2a6ae0]]) { cyl(g, al, .012, .012, .05, 'z', sx, -.2, .245, { seg: 10 }); cyl(g, al, .003, .003, .03, 'z', sx, -.2, .28, { seg: 6 }); ring(g, std(c), .014, .004, sx, -.2, .225, 'z'); }
    cyl(g, dk, .03, .03, .02, 'z', .16, -.13, .23, { seg: 16 });
    tube(g, std(0xe8ecf0, { roughness: .6, emissive: 0x161616 }), [[-.2, -.31, .1], [-.3, -.42, .14], [-.32, -.6, .1], [-.2, -.72, .04]], .011);
    return g;
  }

  /* 睡眠舱内部：折叠门、挂在墙上的笔记本、照片、阅读灯、通风口、个人物品包 */
  function buildBunkDetails(I) {
    const al = std(0xaab0b8, { metalness: .85, roughness: .3, emissive: 0x0c0c0c }), wht = std(0xf0f0ec, { roughness: .9, emissive: 0x1a1a1a });
    for (let i = 0; i < 5; i++) box(I, wht, .012, 1.9, .1, -8.1 - i * .014, 0, -.26 + (i % 2) * .03).rotation.y = (i % 2 ? .5 : -.5);   // 推到一侧的折叠门
    struts(I, al, [[-9.18, .98, -.2, -8.07, .98, -.2, .025], [-9.18, -1.08, -.2, -8.07, -1.08, -.2, .025]]);
    buildLaptop(I, -9.05, .12, -.62, Math.PI / 2, 1.7); limb(I, al, -9.19, .1, -.62, -9.1, .1, -.62, .01);
    const pics = [[0x6fa8d8, 0x3a7a3a], [0xe8b070, 0x8a5a3a], [0x9ad0f0, 0xf0f0f0]];
    pics.forEach(([a, b], i) => decal(I, .13, .1, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#' + a.toString(16).padStart(6, '0'); c.fillRect(8, 8, w - 16, h - 16); c.fillStyle = '#' + b.toString(16).padStart(6, '0'); c.beginPath(); c.moveTo(8, h - 8); c.lineTo(w * .4, h * .45); c.lineTo(w * .65, h * .7); c.lineTo(w * .8, h * .5); c.lineTo(w - 8, h - 8); c.fill(); c.fillStyle = '#fff6c0'; c.beginPath(); c.arc(w * .75, h * .28, 9, 0, 7); c.fill(); }, -8.3 + (i % 2) * .15, .78 - Math.floor(i / 2) * .13 - i * .01, -1.094, 0, 0, 128).rotation.z = (i - 1) * .07);
    tube(I, al, [[-8.95, .95, -1.08], [-8.93, .88, -.98], [-8.85, .8, -.92]], .008); cyl(I, wht, .035, .02, .05, 'y', -8.84, .78, -.91, { seg: 14 }); ball(I, glow(0xffe6b0, 1), .018, -8.84, .755, -.91);   // 阅读灯
    decal(I, .3, .12, (c, w, h) => { c.fillStyle = '#b8bcc2'; c.fillRect(0, 0, w, h); c.fillStyle = '#3a3e45'; for (let i = 8; i < h - 6; i += 12) c.fillRect(8, i, w - 16, 6); }, -8.62, -.95, -1.094, 0, 0, 200);   // 通风口
    buildBag(I, -8.4, -.85, -.92, .34, .15);
    box(I, std(0x8a3a2a, { roughness: .9, emissive: 0x140806 }), .1, .14, .025, -8.22, .2, -1.08); box(I, std(0x2a4a7a, { roughness: .9, emissive: 0x060a14 }), .1, .14, .02, -8.22, .2, -1.055);   // 两本书
  }

  /* 小物件：灭火器、相机 */
  function buildExtinguisher(I, x, y, z) {
    const g = new THREE.Group(), red = std(0xc8201c, { roughness: .4, emissive: 0x2a0404 }), dk = std(0x202327), al = std(0xaab0b8, { metalness: .85, roughness: .3 }); g.position.set(x, y, z); I.add(g);
    limb(g, red, 0, -.14, 0, 0, .12, 0, .055); cyl(g, dk, .022, .03, .05, 'y', 0, .2, 0, { seg: 12 }); box(g, dk, .09, .02, .03, .03, .235, 0); box(g, al, .08, .012, .025, .035, .21, 0);
    tube(g, dk, [[0, .2, .02], [.02, .1, .075], [.0, -.08, .08]], .009); cyl(g, dk, .012, .02, .06, 'y', 0, -.11, .08, { seg: 10 });
    for (const yy of [-.08, .08]) ring(g, al, .058, .006, 0, yy, 0, 'y'); box(g, std(0xffffff, { emissive: 0x222222 }), .06, .07, .002, 0, 0, .056);
    return g;
  }
  function buildCamera(I, x, y, z) {
    const g = new THREE.Group(), dk = std(0x17191c, { roughness: .55, emissive: 0x050505 }); g.position.set(x, y, z); g.rotation.set(.9, .6, .3); I.add(g);
    box(g, dk, .14, .095, .07, 0, 0, 0); box(g, dk, .05, .03, .05, 0, .06, -.005); box(g, dk, .03, .1, .08, -.06, 0, .01);
    cyl(g, dk, .036, .04, .09, 'z', .01, -.005, .08, { seg: 20 }); cyl(g, std(0x8a8f96, { metalness: .8, roughness: .3 }), .041, .041, .012, 'z', .01, -.005, .075, { seg: 20 }); cyl(g, glow(0x2a3a6a, 1), .03, .03, .003, 'z', .01, -.005, .126, { seg: 20 });
    box(g, glow(0x9fd0ff, .5), .07, .05, .002, .01, -.005, -.036); cyl(g, std(0xc8201c), .008, .008, .01, 'y', .05, .05, .01, { seg: 8 });
    tube(g, std(0x1a1a1a, { roughness: 1 }), [[-.07, .04, 0], [-.16, .12, -.05], [-.02, .2, -.12], [.12, .1, -.05], [.07, .04, 0]], .005);
    return g;
  }

  /* ================= 空间站 ================= */
  M.buildStation = function () {
    const S = { group: new THREE.Group(), inter: [], plants: [], arrays: [] };
    const G = S.group, hull = std(0xffffff, { map: hullTex, roughness: .62, metalness: .25 }), metal = std(0x8a8f98, { roughness: .45, metalness: .8 });
    const dark = std(0x23262c, { roughness: .6, metalness: .5 }), white = std(0xeeeeee), foil = std(0xc9a040, { roughness: .4, metalness: .85 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x223355, roughness: .05, metalness: .9, transparent: true, opacity: .28, depthWrite: false });
    const HT = 2.6;

    /* ----- 外部 -----
       舱外是 NASA 发布的国际空间站模型，由 M.loadISS 异步载入（见下）。这里只放出舱维修任务的故障指示灯。 */
    S.marker = new THREE.Mesh(new THREE.SphereGeometry(.22, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a1a).multiplyScalar(4) })); S.marker.visible = false; G.add(S.marker);

    /* ----- 舱内 ----- */
    const I = new THREE.Group(); G.add(I); S.interior = I;
    const mLab = interior(rackTex(1, '#d9dbd6', '#5878b8')), mHab = interior(rackTex(2, '#ded6c4', '#5878b8')), mNode = interior(rackTex(4, '#cfd4da', '#5878b8')), mGreen = interior(rackTex(6, '#e6e8e2', '#5a9a70')), mLock = interior(rackTex(8, '#c9ccd0', '#d8b020'));
    const rim = std(0x3a4048, { roughness: .5, metalness: .6, emissive: 0x111418 }), H = { s: [1.3, 1.3] };
    room(I, mNode, [-1.2, 1.2, -1.1, 1.1, -1.2, 1.2], { 'x+': H, 'x-': H, 'z+': H, 'z-': H, 'y-': H }, rim);
    room(I, mLab, [1.23, 9.2, -1.1, 1.1, -1.1, 1.1], { 'x-': 'open', 'x+': { s: [.95, .95] }, 'y-': { s: [.8, .8], c: [0, 5.4] } }, rim);
    room(I, mLock, [9.23, 10.9, -.55, .55, -.55, .55], { 'x-': 'open' });
    room(I, mHab, [-9.2, -1.23, -1.1, 1.1, -1.1, 1.1], { 'x+': 'open', 'z+': { s: [.7, .7], c: [-8.6, .1] } }, rim);
    room(I, mGreen, [-1.1, 1.1, -1.1, 1.1, 1.23, 7.2], { 'z-': 'open' });
    room(I, mLock, [-.9, .9, -.9, .9, -4.7, -1.23], { 'z+': 'open' });
    room(I, mNode, [-.8, .8, -2.6, -1.13, -.8, .8], { 'y+': 'open', 'x+': { s: [1.05, 1.1] }, 'x-': { s: [1.05, 1.1] }, 'z+': { s: [1.1, 1.05] }, 'z-': { s: [1.1, 1.05] }, 'y-': { s: [1.15, 1.15] } }, rim);
    S.boxes = [[-1.2, 1.2, -1.1, 1.1, -1.2, 1.2], [0.7, 9.2, -1.1, 1.1, -1.1, 1.1], [8.7, 10.8, -.55, .55, -.55, .55], [-9.2, -0.7, -1.1, 1.1, -1.1, 1.1],
      [-1.1, 1.1, -1.1, 1.1, 0.7, 7.2], [-.9, .9, -.9, .9, -4.6, -0.7], [-.8, .8, -2.55, -0.6, -.8, .8]];
    sign(I, '实验舱 · 对接口 →', 1.16, .9, 0, 0, -Math.PI / 2); sign(I, '← 居住舱', -1.16, .9, 0, 0, Math.PI / 2);
    sign(I, '温室舱', 0, .9, 1.16, 0, Math.PI); sign(I, '气闸舱 · 出舱', 0, .9, -1.16, 0, 0); sign(I, '▼ 穹顶舱（观景）', 0, -1.06, .92, -Math.PI / 2, 0, .9, .16);
    // 顶灯
    const lamp = glow(0xfff6e0, 3);
    const lh = std(0x8d939b, { metalness: .6, roughness: .4, emissive: 0x0c0c0c });
    for (const x of [-8, -6, -4, -2.4, 0, 2.4, 4, 6, 8]) { box(I, lamp, .9, .03, .22, x, 1.08, 0); box(I, lh, .98, .022, .3, x, 1.088, 0); for (const sx of [-1, 1]) box(I, lh, .03, .04, .26, x + sx * .465, 1.078, 0); }
    for (const z of [2.4, 4.2, 6]) { box(I, lamp, .22, .03, .9, 0, 1.08, z); box(I, lh, .3, .022, .98, 0, 1.088, z); for (const sz of [-1, 1]) box(I, lh, .26, .04, .03, 0, 1.078, z + sz * .465); }
    box(I, lamp, .2, .03, .8, 0, .88, -3); box(I, lh, .28, .022, .88, 0, .888, -3);
    S.lights = [];
    for (const [x, y, z, c, k, d] of [[-7.0, .72, 0, 0xfff0d8, .62, 8.5], [-3.3, .72, 0, 0xfff0d8, .62, 8.5], [3.3, .72, 0, 0xf2f6ff, .62, 8.5], [7.0, .72, 0, 0xf2f6ff, .62, 8.5], [0, .7, 0, 0xffffff, .5, 6], [0, .55, 4.2, 0xffd0ee, .62, 8], [0, .55, -3, 0xffffff, .6, 6]]) {
      const l = new THREE.PointLight(c, k, d, 1.4); l.position.set(x, y, z); l.castShadow = true; l.shadow.mapSize.set(1024, 1024); l.shadow.camera.near = .04; l.shadow.camera.far = d + 1; l.shadow.bias = -0.004; l.shadow.radius = 3;
      l.shadow.autoUpdate = false; l.shadow.needsUpdate = true; I.add(l); S.lights.push(l);
    }

    // 居住舱：睡眠舱
    const cloth = std(0x2f5fb0, { roughness: .95 }), prop = std(0xdddddd, { roughness: .8, emissive: 0x222222 }), dk = std(0x30343a, { emissive: 0x08090a });
    box(I, prop, .05, 2.0, .9, -8.05, 0, -.65); box(I, prop, 1.1, .05, .9, -8.6, 1.0, -.65);
    const bag = new THREE.Mesh(new THREE.CapsuleGeometry(.27, 1.15, 6, 14), cloth); bag.position.set(-8.62, -.12, -.82); I.add(bag);
    for (const y of [-.5, .1]) ring(I, std(0x8a9098, { roughness: .9 }), .275, .012, -8.62, y, -.82, 'y');
    ball(I, std(0x1a2a50, { roughness: 1 }), .17, -8.62, .52, -.66, 1, 1.25, .5); ball(I, std(0xdfe6f2, { roughness: 1, emissive: 0x181818 }), .12, -8.62, .5, -.72, 1, 1.2, .5);
    box(I, std(0xf2f2f2), .3, .2, .08, -8.62, .62, -1.02); box(I, glow(0xffd9a0, .9), .12, .05, .05, -8.9, .85, -1.0);
    box(I, glow(0x7fb6ff, .7), .22, .16, .01, -8.3, .5, -1.06);
    buildBunkDetails(I);
    S.inter.push({ id: 'sleep', pos: new V3(-8.6, 0, -.55) });
    // 居住舱：厨房（餐桌、饮水机、食品加热器）
    box(I, prop, .95, .04, .55, -4.2, -.2, .82); for (const dx of [-.4, .4]) box(I, std(0x9aa0aa, { metalness: .7, roughness: .4 }), .03, .03, .3, -4.2 + dx, -.235, .95);
    buildGalley(I);
    buildMeal(I, -4.2, -.18, .82);
    buildLaptop(I, -4.95, .25, .98, Math.PI, 1.75);
    for (let i = 0; i < 4; i++) box(I, std([0xd8dce0, 0xc9a040, 0xd8dce0, 0x8a9a6a][i], { metalness: .6, roughness: .4, emissive: 0x101010 }), .16, .11, .012, -4.5 + i * .2, .45, 1.09);   // 贴在墙上的备用餐包
    S.inter.push({ id: 'eat', pos: new V3(-4.2, -.1, .8) });
    // 居住舱：跑步机
    buildTreadmill(I, -6.3, 0);
    S.inter.push({ id: 'exercise', pos: new V3(-6.3, -.75, 0) });
    // 实验舱：手套箱
    buildGlovebox(I, 4);
    S.inter.push({ id: 'exp', pos: new V3(4, 0, -.6) });
    // 实验舱：站务终端（屏幕内容实时绘制）
    const sc = document.createElement('canvas'); sc.width = 512; sc.height = 320;
    S.screen = { canvas: sc, ctx: sc.getContext('2d'), tex: new THREE.CanvasTexture(sc) }; S.screen.tex.encoding = THREE.sRGBEncoding;
    buildTerminal(I, S.screen.tex, 6.8, .1);
    S.inter.push({ id: 'terminal', pos: new V3(6.8, .1, 1.0) });
    buildBag(I, 8.4, -.72, -.78, .55, .2); buildBag(I, 8.5, .62, .8, .45, 3.0); buildBag(I, 2.3, -.75, .8, .5, 2.9); buildBag(I, 8.85, -.74, .1, .5, 1.5);
    buildLaptop(I, 5.1, -.05, -.84, 0, 1.85);
    // 温室舱：水培架（红蓝 LED 混成品红色光）。上层百日菊，中层绿叶生菜，下层红叶罗马生菜
    const leaf = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x0b160c }), tray = std(0xcfd4d8, { emissive: 0x151515 }), pillow = std(0x2c2f33, { roughness: .95 });
    const kinds = { '-0.75': 'red', '-0.05': 'green', '0.65': 'zinnia' }, geos = {};
    for (const k of ['red', 'green', 'zinnia']) geos[k] = [0, 1, 2].map(i => plantGeo(k, 77 + i * 13 + k.length));
    for (const sx of [-1, 1]) for (const y of [-.75, -.05, .65]) {
      box(I, tray, .5, .05, 5.2, sx * .84, y, 4.2); box(I, std(0xaab0b6, { emissive: 0x101010 }), .03, .1, 5.2, sx * .6, y + .03, 4.2);
      box(I, glow(0xff5ad0, 2.6), .34, .02, 5.0, sx * .86, y + .42, 4.2); box(I, std(0xd8dce0, { emissive: 0x181818 }), .4, .03, 5.1, sx * .86, y + .445, 4.2);
      for (let i = 0; i < 10; i++) {
        const px = sx * (.8 + (i % 2) * .07), pz = 1.9 + i * .51;
        box(I, pillow, .17, .035, .17, px, y + .042, pz);                                    // 植物“枕”：装着培养基的小袋
        const p = new THREE.Mesh(geos[kinds[y]][i % 3], leaf); p.position.set(px, y + .06, pz); p.rotation.y = i * 1.7; p.userData.s = .8 + ((i * 7) % 5) * .07; I.add(p); S.plants.push(p);
      }
    }
    limb(I, std(0xe8ecf0, { emissive: 0x181818 }), -.5, -.4, 6.9, -.5, -.28, 6.9, .045); box(I, std(0x3a6ae0), .03, .05, .03, -.5, -.2, 6.9);   // 浇水用的注射器瓶
    S.inter.push({ id: 'garden', pos: new V3(0, 0, 4.2), r: 3.2 });
    // 气闸舱：两套舱外航天服（挂在两侧的穿脱架上，其中一套带红条纹）+ 外舱门
    for (const sx of [-1, 1]) {
      const g = buildSuit(sx > 0); g.scale.setScalar(.86); g.position.set(sx * .52, .1, -3.1); g.rotation.y = -sx * Math.PI / 2; I.add(g);
      struts(I, std(0x9aa0aa, { metalness: .8, roughness: .35 }), [[sx * .88, .75, -3.4, sx * .88, -.75, -3.4, .03], [sx * .88, .75, -2.8, sx * .88, -.75, -2.8, .03], [sx * .88, .5, -3.4, sx * .88, .5, -2.8, .03], [sx * .88, .5, -3.1, sx * .8, .5, -3.1, .025]]);
    }
    for (const [x, c] of [[-.3, 0xffffff], [.3, 0xffffff]]) { const t = ball(I, std(0xf4f4f0, { emissive: 0x1c1c1c }), .06, x, -.8, -4.3, 1, 1.25, .8); for (let f = 0; f < 4; f++) limb(I, std(0x8c9096), x + (f - 1.5) * .022, -.74, -4.3, x + (f - 1.5) * .024, -.67, -4.3, .0095); }   // 备用手套
    buildHatch(I, .62, 0, 0, -4.7, 0, '外舱门 · 开启前确认已泄压');
    S.inter.push({ id: 'airlock', pos: new V3(0, 0, -4.4) });
    // 对接通道舱门
    buildHatch(I, .5, 10.9, 0, 0, -Math.PI / 2, '对接口 · 远航者号');
    buildExtinguisher(I, 1.02, -.55, -.95); buildExtinguisher(I, -1.6, -.6, 1.0); buildCamera(I, .35, -1.75, .3);
    const cab = std(0x2a2d32, { roughness: .9 }); for (const z of [-1.03, 1.03]) { tube(I, cab, [[1.4, 1.0, z], [3.5, 1.03, z * .99], [6, 1.0, z], [9.1, 1.03, z * .99]], .014); tube(I, std(0xd8dce0, { roughness: .8 }), [[1.4, .96, z], [4, .98, z], [7, .95, z], [9.1, .97, z]], .01); }
    S.inter.push({ id: 'dock', pos: new V3(10.5, 0, 0) });
    // 舱内蓝色扶手
    const br = std(0x4a6fc0, { emissive: 0x0a1430 }), bl = [];
    for (const x of [-7.5, -3, 3, 7.5]) for (const z of [-1.04, 1.04]) bl.push([x - .3, 1.02, z, x + .3, 1.02, z, .03]);
    struts(I, br, bl);

    S.hullMat = hull;
    // 以下位置对应 NASA 模型上的真实部位（空间站本体坐标：X 前进方向，Y 天顶，Z 右舷）
    S.port = new V3(21.0, -0.1, 0);            // 和谐号节点舱前端的 PMA-2 对接口
    S.evaHatch = new V3(-0.1, -0.2, 9.0);      // 寻求号气闸舱外
    S.repair = [-43, -30, 30, 43].map(z => new V3(4.8, 9.5, z));   // 主桁架上、太阳翼之间的配电设备
    S.blockers = []; S.hideInside = [];
    return S;
  };

  /* ================= 飞船「远航者号」 =================
     本体坐标：机头朝 −Z。持续 1g 推进时“下”就是船尾方向，所以舱段像塔楼一样沿轴线层叠；
     聚变发动机在最后端，中间隔着屏蔽盘和长桁架；两片大散热翼用来排掉废热。 */
  /* 给模型打开阴影：发光体、透明体不参与；skip 指定的材质只接收不投射 */
  M.shadowize = function (root, skip) {
    root.traverse(o => { if (!o.isMesh) return; const m = o.material; if (m.isMeshBasicMaterial || m.transparent || m.isShaderMaterial) return; o.receiveShadow = true; o.castShadow = m !== skip; });
  };
  /* 载入 NASA 的国际空间站模型并对齐到游戏坐标：模型以团结号节点舱为原点、+Z 朝前、+Y 朝天顶、−X 为右舷。
     我们的舱内场景与团结号 / 命运号重合；人在舱内时，把包住舱内空间的那几个舱段隐藏（否则会穿帮），其余部分透过舷窗仍然可见。 */
  M.loadISS = function (S, done, fail) {
    const HIDE = ['02 Unity', '09 Destiny', '12 Quest', '03 (PMA)', '01 Zarya', '40 Leonardo', '37 Tranquility', '39 Rassvet', 'Destiny Window', '10 (ESP)', '18 ESP'];
    const SOLID = /^(0[1-579]|1[23]|26|27|30|34|37|39|40) |^(14 S0|16 S1 Truss$|17 P1 Truss$|19 P3|22 S3|06 Z1)/;
    fetch(ISS_GLB).then(r => r.arrayBuffer()).then(buf => new THREE.GLTFLoader().parse(buf, '', gltf => {
      const iss = S.iss = gltf.scene; iss.rotation.y = Math.PI / 2; S.group.add(iss); iss.updateMatrixWorld(true);
      const max = W.renderer.capabilities.getMaxAnisotropy();
      iss.traverse(o => {
        if (!o.isMesh) return;
        const m = o.material; m.envMapIntensity = 0.7; for (const k of ['map', 'normalMap', 'aoMap', 'roughnessMap', 'metalnessMap']) if (m[k]) m[k].anisotropy = max;
        o.castShadow = o.receiveShadow = true;
        // 载入器会把名字里的空格换成下划线；多材质的部件会拆成子网格，所以沿父级向上找到带编号的部件名
        let name = ''; for (let q = o; q && q !== iss; q = q.parent) { const n = (q.name || '').replace(/_/g, ' '); if (/^\d\d |^Destiny Window/.test(n)) { name = n; break; } }
        if (HIDE.some(h => name.startsWith(h))) S.hideInside.push(o);
        if (SOLID.test(name)) { const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new V3()); if (Math.max(sz.x, sz.y, sz.z) < 16.5) S.blockers.push(b); }
      });
      console.log('ISS loaded: hideInside=' + S.hideInside.length + ' blockers=' + S.blockers.length);
      done();
    }, fail)).catch(fail);
  };
  M.SHIP_NOSE = 32.2;
  M.buildShip = function () {
    const S = { group: new THREE.Group() }, G = S.group;
    const hull = std(0xffffff, { map: hullTex, normalMap: normalFrom(hullTex, 4), roughness: .5, metalness: .35 }), metal = std(0x7d838c, { roughness: .4, metalness: .85 }), dark = std(0x1c1f24, { roughness: .5, metalness: .6 });
    const foil = std(0xc9a040, { roughness: .38, metalness: .9 }), win = glow(0xffe8b0, .9), cockpit = std(0x0a1420, { roughness: .05, metalness: 1 });
    cyl(G, metal, 1.05, 1.05, .2, 'z', 0, 0, -32.1, { open: true }); cyl(G, dark, .9, 1.05, .02, 'z', 0, 0, -32.2, { open: true });   // 对接环
    cyl(G, hull, 2.3, .95, 2.0, 'z', 0, 0, -31, { tile: 2.6 });                                 // 机头
    cyl(G, hull, 2.3, 2.3, 8, 'z', 0, 0, -26, { tile: 2.6 });                                   // 指令舱
    for (let i = -2; i <= 2; i++) { const m = box(G, cockpit, .62, .5, .1, i * .72, 1.25 + (2 - Math.abs(i)) * .22, -30.72); m.rotation.x = -.62; m.rotation.z = -i * .16; }
    cyl(G, hull, 3.2, 2.3, 1.2, 'z', 0, 0, -21.4, { tile: 2.6 });
    cyl(G, hull, 3.2, 3.2, 8.5, 'z', 0, 0, -16.55, { tile: 2.6 });                              // 居住舱段
    cyl(G, hull, 1.2, 3.2, 1.5, 'z', 0, 0, -11.55, { tile: 2.6 });
    for (const z of [-19.5, -17, -14.5]) for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + z; box(G, win, .3, .22, .04, Math.cos(a) * 3.2, Math.sin(a) * 3.2, z).lookAt(Math.cos(a) * 9, Math.sin(a) * 9, z); }
    for (const z of [-22.05, -12.3, -28]) cyl(G, metal, z === -28 ? 2.36 : 3.26, z === -28 ? 2.36 : 3.26, .14, 'z', 0, 0, z, { open: true });
    struts(G, metal, trussList(0, 0, -10.8, 21, 1.0, 2.65, .1));                                 // 脊梁桁架
    for (const z of [-6.5, 1.2]) for (const [x, y] of [[3.6, 0], [-3.6, 0], [0, 3.6], [0, -3.6]]) {                                             // 推进剂储罐
      const t = new THREE.Mesh(new THREE.SphereGeometry(2.6, 28, 20), foil); t.position.set(x, y, z); G.add(t);
    }
    for (const z of [-6.5, 1.2]) cyl(G, metal, 1.5, 1.5, .5, 'z', 0, 0, z, { open: true });
    // 散热翼（发动机工作时发红）
    S.radMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: .8, metalness: .3, side: THREE.DoubleSide, emissive: 0xff4a10, emissiveIntensity: 0 });
    for (const sx of [-1, 1]) { box(G, S.radMat, 13, .08, 13, sx * 8.2, 0, 13); struts(G, metal, [[sx * 1.2, 0, 6.6, sx * 14.6, 0, 6.6, .14], [sx * 1.2, 0, 19.4, sx * 14.6, 0, 19.4, .14], [sx * 14.6, 0, 6.6, sx * 14.6, 0, 19.4, .14]]); }
    cyl(G, std(0x555a62, { roughness: .35, metalness: .9 }), 3.6, 3.6, .5, 'z', 0, 0, 21.6, {});  // 辐射屏蔽盘
    cyl(G, dark, 2.3, 2.3, 5.5, 'z', 0, 0, 24.9, {});                                            // 聚变反应堆
    for (const z of [23, 25, 27]) { const t = new THREE.Mesh(new THREE.TorusGeometry(2.45, .2, 10, 36), foil); t.position.z = z; G.add(t); }
    cyl(G, std(0x3a3d44, { roughness: .3, metalness: .9, side: THREE.DoubleSide }), 4.6, 1.6, 4.6, 'z', 0, 0, 29.9, { open: true });   // 磁喷管
    for (const z of [28.4, 30.2, 32]) { const r = 1.9 + (z - 28) * .66; const t = new THREE.Mesh(new THREE.TorusGeometry(r, .14, 8, 36), metal); t.position.z = z; G.add(t); }
    // 尾焰
    // Navigation labels are occluded by the hull, never the animated exhaust.
    G.updateWorldMatrix(true,true);
    G.userData.labelHullBounds = new THREE.Box3().setFromObject(G);
    S.plume = new THREE.Group(); G.add(S.plume);
    const pm = (c, o) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(5), transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    cyl(S.plume, pm(0x6fb8ff, .35), .3, 3.6, 60, 'z', 0, 0, 61, { open: true, seg: 24 }); cyl(S.plume, pm(0xcfe8ff, .55), .1, 1.8, 34, 'z', 0, 0, 48, { open: true, seg: 20 });
    const core = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12), pm(0xffffff, .8)); core.position.z = 31; S.plume.add(core);
    S.plumeLight = new THREE.PointLight(0x9fd0ff, 0, 160); S.plumeLight.position.z = 36; G.add(S.plumeLight);
    S.plume.visible = false;
    // 姿控喷口、高增益天线、航行灯
    for (const z of [-27.5, 20]) for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const r = z < 0 ? 2.45 : 1.5; box(G, dark, .5, .5, .7, x * r, y * r, z); }
    const dish = new THREE.Mesh(new THREE.SphereGeometry(2.4, 28, 10, 0, Math.PI * 2, 0, .8), std(0xe8e8e8, { side: THREE.DoubleSide, metalness: .4 })); dish.position.set(0, 7.2, -9); dish.rotation.x = Math.PI * .92; G.add(dish);
    struts(G, metal, [[0, 1, -9, 0, 4.9, -9, .16], [0, 4.9, -9, 0, 6.6, -9.3, .06]]);
    for (const [x, y, z, c] of [[3.3, 0, -16, 0x30ff60], [-3.3, 0, -16, 0xff3030], [0, 3.7, 21.6, 0xffffff]]) { const l = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), glow(c)); l.position.set(x, y, z); G.add(l); }
    const name = ctex(512, 96, g => { g.clearRect(0, 0, 512, 96); g.fillStyle = '#1a2a4a'; g.font = 'bold 60px "PingFang SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('远航者 VOYAGER', 256, 50); });
    for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(5, .95), new THREE.MeshBasicMaterial({ map: name, transparent: true })); m.position.set(sx * 3.23, .4, -16.5); m.rotation.y = sx * Math.PI / 2; G.add(m); }
    return S;
  };
})();
