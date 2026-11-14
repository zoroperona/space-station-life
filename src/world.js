'use strict';
/* 宇宙环境：星空、恒星、行星、光照。
   世界坐标 = 以当前恒星系原点为中心的黄道坐标，单位米：X 指向春分点，Y 指向北黄极，Z = −黄道 Y。 */
const V3 = THREE.Vector3;
const W = { bodies: [], byId: {}, starBodies: [], sunFactor: 1, toStar: new V3(1, 0, 0), shadowCenter: new V3(), exposure: 1.0 };

(function () {
  const COSE = Math.cos(OBLIQ), SINE = Math.sin(OBLIQ);
  // 赤道直角坐标 → 世界坐标
  W.eq2w = (x, y, z, o) => o.set(x, -y * SINE + z * COSE, -(y * COSE + z * SINE));
  const raDec = (raDeg, decDeg, o) => { const r = raDeg * DEG, d = decDeg * DEG; return W.eq2w(Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d), o); };

  function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  W.rng = mulberry;

  function tempColor(T) {
    const t = T / 100; let r, g, b;
    if (t <= 66) { r = 255; g = 99.4708 * Math.log(t) - 161.1196; b = t <= 19 ? 0 : 138.5177 * Math.log(t - 10) - 305.0448; }
    else { r = 329.6987 * Math.pow(t - 60, -0.1332); g = 288.1222 * Math.pow(t - 60, -0.0755); b = 255; }
    return [clamp(r / 255), clamp(g / 255), clamp(b / 255)];
  }
  W.tempColor = tempColor;

  const tex = (key, srgb = true) => TextureAssets.get(key, srgb);

  /* ---------- 程序生成的星球表面（给没有真实影像的系外天体用） ---------- */
  function makeNoise(seed) {
    const r = mulberry(seed), p = new Uint8Array(512);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 256; i++) p[i + 256] = p[i];
    const h = (x, y, z) => p[p[p[x & 255] + (y & 255)] + (z & 255)] / 255;
    const n3 = (x, y, z) => {
      const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
      let u = x - X, v = y - Y, w = z - Z; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); w = w * w * (3 - 2 * w);
      return lerp(lerp(lerp(h(X, Y, Z), h(X + 1, Y, Z), u), lerp(h(X, Y + 1, Z), h(X + 1, Y + 1, Z), u), v),
        lerp(lerp(h(X, Y, Z + 1), h(X + 1, Y, Z + 1), u), lerp(h(X, Y + 1, Z + 1), h(X + 1, Y + 1, Z + 1), u), v), w);
    };
    return (x, y, z, oct = 5) => { let s = 0, a = 0.5, n = 0; for (let i = 0; i < oct; i++) { s += a * n3(x, y, z); n += a; a *= 0.5; x *= 2.03; y *= 2.03; z *= 2.03; } return clamp((s / n - 0.5) * 1.9 + 0.5); };
  }
  function grad(pal, t, o) { const f = clamp(t) * (pal.length - 1), i = Math.min(pal.length - 2, Math.floor(f)), k = f - i; for (let c = 0; c < 3; c++) o[c] = lerp(pal[i][c], pal[i + 1][c], k); return o; }
  function procTexture(kind, seed, pal) {
    // Rocky/ocean surfaces are shaded continuously on the GPU. A tiny shared
    // base avoids generating unused CPU maps during an interstellar handover.
    if(['rock','ocean','ice','lava'].includes(kind)){
      const cv=document.createElement('canvas');cv.width=cv.height=2;
      const g=cv.getContext('2d'),c=pal[Math.floor(pal.length/2)];
      g.fillStyle=`rgb(${c.join(',')})`;g.fillRect(0,0,2,2);
      const texture=new THREE.CanvasTexture(cv);texture.encoding=THREE.sRGBEncoding;return texture;
    }
    const Wd = 512, Hd = 256, cv = document.createElement('canvas'); cv.width = Wd; cv.height = Hd;
    const g = cv.getContext('2d'), img = g.createImageData(Wd, Hd), d = img.data, fbm = makeNoise(seed), c = [0, 0, 0];
    for (let y = 0; y < Hd; y++) {
      const lat = (0.5 - (y + 0.5) / Hd) * Math.PI, cl = Math.cos(lat), sy = Math.sin(lat);
      for (let x = 0; x < Wd; x++) {
        const lon = x / Wd * 2 * Math.PI, px = cl * Math.cos(lon) + 3, py = sy + 3, pz = cl * Math.sin(lon) + 3;
        if (kind === 'gas') grad(pal, fbm(px * 1.2, py * 7 + fbm(px * 2.5, py * 2.5, pz * 2.5, 3) * 1.4, pz * 1.2), c);
        else if (kind === 'star') { const v = fbm(px * 18, py * 18, pz * 18, 3); grad(pal, 0.35 + v * 0.65, c); }
        else if (kind === 'ocean') {
          const h = fbm(px * 2.2, py * 2.2, pz * 2.2);
          if (h > 0.55) grad(pal.slice(2), (h - 0.55) / 0.3, c); else grad(pal.slice(0, 2), h / 0.55, c);
          const cloud = smooth((fbm(px * 4 + 9, py * 4, pz * 4) - 0.56) / 0.2), cap = smooth((Math.abs(lat) - 1.2) / 0.15), wv = Math.max(cloud * 0.85, cap);
          for (let k = 0; k < 3; k++) c[k] = lerp(c[k], 240, wv);
        } else {
          const h = fbm(px * 3.2, py * 3.2, pz * 3.2); grad(pal, h, c);
          if (kind === 'lava') { const crack = 1 - smooth(Math.abs(fbm(px * 5, py * 5, pz * 5) - 0.5) / 0.03); c[0] = lerp(c[0], 255, crack * 0.9); c[1] = lerp(c[1], 120, crack * 0.8); c[2] = lerp(c[2], 30, crack * 0.6); }
          if (kind === 'ice') { const crack = 1 - smooth(Math.abs(fbm(px * 7, py * 7, pz * 7) - 0.5) / 0.012); for (let k = 0; k < 3; k++) c[k] *= 1 - crack * 0.35; }
        }
        const i = (y * Wd + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t;
  }

  function glowTexture() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.08, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.35)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(cv);
  }

  /* ---------- 着色器 ---------- */
  const VERT = `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vObj; varying vec3 vPole;
void main(){ vUv=uv; vObj=position; vPole=normalize(normalMatrix*vec3(0.0,1.0,0.0)); vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vP=mv.xyz; gl_Position=projectionMatrix*mv;
#include <logdepthbuf_vertex>
}`;
  const BODY_FRAG = `
${SurfaceDetail.glsl}
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map; uniform sampler2D nightMap; uniform sampler2D specMap; uniform sampler2D cloudMap; uniform sampler2D ringMap;
uniform float weatherTime; uniform float gasWorld;
uniform float hasNight; uniform float hasSpec; uniform float hasCloud; uniform float cloudShift; uniform float hasRing; uniform float ringIn; uniform float ringOut; uniform float spin;
uniform float bump; uniform float detail; uniform float texel; uniform vec3 sunLocal;
uniform vec3 lightDir[2]; uniform vec3 lightCol[2]; uniform vec3 atmo; uniform float atmoK; uniform float gain;
varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vObj; varying vec3 vPole;
float lum(vec2 uv){ return dot(texture2D(map,uv).rgb,vec3(0.3333)); }
float hash(vec2 p){ p=fract(p*vec2(0.1031,0.1030)); p+=dot(p,p.yx+33.33); return fract((p.x+p.y)*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y); }
void main(){
#include <logdepthbuf_fragment>
  vec3 N=normalize(vN), V=normalize(-vP);
  // 贴图分辨率不够用时（凑近看）：先用噪声把取样位置轻微扰动，让被放大的像素边界（比如海岸线）变成自然的曲折形状，再叠加多层细节
  float foot=max(fwidth(vUv.x),fwidth(vUv.y)); float nearK=1.0-smoothstep(0.00003,0.0008,foot);
  vec2 wq=vUv*vec2(2.0,1.0); vec2 uvw=vUv+(vec2(vnoise(wq*1400.0)+0.5*vnoise(wq*4200.0),vnoise(wq*1400.0+19.0)+0.5*vnoise(wq*4200.0+7.0))-0.75)*texel*1.6*nearK*step(0.0001,detail);
  // Bounded differential cloud motion preserves the source map and storm shape.
  uvw.x+=gasWorld*.003*sin(weatherTime*.06+vUv.y*60.0)*sin(vUv.y*3.14159);
  vec3 base=texture2D(map,uvw).rgb*gain;
  if(detail>0.0 && procKind==0.0){ vec2 q=vUv*vec2(2.0,1.0); float n=vnoise(q*900.0)*0.3+vnoise(q*2700.0)*0.27+vnoise(q*8000.0)*0.23+vnoise(q*24000.0)*0.2;
    float k=detail; if(hasSpec>0.5) k*=mix(3.2,0.5,texture2D(specMap,uvw).r);      // 陆地粗糙，海面平滑
    base*=1.0+(n-0.5)*k*nearK*2.0; }
  float ocean=0.0;
  if(procKind>0.0) {
    float height; base=terrainColor(normalize(vObj),height,ocean)*gain;
    vec3 dx=dFdx(vP),dy=dFdy(vP),r1=cross(dy,N),r2=cross(N,dx);
    float det=dot(dx,r1);float physicalHeight=height*length(vObj);
    vec3 gradient=sign(det)*(dFdx(physicalHeight)*r1+dFdy(physicalHeight)*r2);
    N=normalize(max(abs(det),1e-12)*N-gradient);
  }
  // 用贴图明暗推出地形起伏，晨昏线附近的环形山和山脉会投下明暗
  if(bump>0.0 && procKind==0.0){ vec3 pole=normalize(vPole); vec3 T=normalize(cross(pole,N)+1e-5); vec3 B=cross(N,T);
    float hx=lum(vUv+vec2(texel,0.0))-lum(vUv-vec2(texel,0.0)); float hy=lum(vUv+vec2(0.0,texel))-lum(vUv-vec2(0.0,texel));
    float fine=(vnoise(vUv*vec2(2.0,1.0)*5000.0+3.7)-vnoise(vUv*vec2(2.0,1.0)*5000.0))*0.04*nearK;
    N=normalize(N-bump*((hx+fine)*T+(hy-fine)*B)); }
  // 行星环投在行星表面的影子
  float ringSh=1.0;
  if(hasRing>0.5 && abs(sunLocal.y)>1e-4){ float c=cos(spin), s=sin(spin); vec3 p=vec3(c*vObj.x+s*vObj.z,vObj.y,-s*vObj.x+c*vObj.z); float t=-p.y/sunLocal.y;
    if(t>0.0){ vec3 h=p+sunLocal*t; float u=(length(h.xz)-ringIn)/(ringOut-ringIn); if(u>0.0&&u<1.0) ringSh=1.0-texture2D(ringMap,vec2(u,0.5)).a*0.85; } }
  vec3 col=base*0.003; float day=0.0;
  for(int i=0;i<2;i++){
    vec3 L=normalize((viewMatrix*vec4(lightDir[i],0.0)).xyz); float nl=dot(N,L), gl=dot(normalize(vN),L);
    float d = atmoK>0.0 ? smoothstep(-0.12,0.5,nl)*(0.35+0.65*max(nl,0.0)) : max(nl,0.0)*smoothstep(-0.02,0.06,gl);
    vec3 lc=lightCol[i]; if(i==0) lc*=ringSh;
    if(atmoK>0.0) lc*=mix(vec3(1.0,0.48,0.22),vec3(1.0),smoothstep(-0.08,0.32,gl));   // 晨昏线上的日出 / 日落色
    float w = max(max(lightCol[i].r,lightCol[i].g),lightCol[i].b);
    col += base*lc*d; day = max(day,d*min(w,1.0));
    if(procKind==2.0){vec3 H=normalize(L+V);col+=lc*pow(max(dot(N,H),0.0),140.0)*ocean*.38*max(nl,0.0);}
    if(hasSpec>0.5){ vec3 H=normalize(L+V); col += lc*pow(max(dot(N,H),0.0),260.0)*texture2D(specMap,uvw).r*0.5*step(0.0,nl); }
  }
  if(hasCloud>0.5){ float c; if(procKind==2.0){float a=cloudShift*6.283185;vec3 p=normalize(vObj);p=vec3(cos(a)*p.x-sin(a)*p.z,p.y,sin(a)*p.x+cos(a)*p.z);c=weather(normalize(p+sunLocal*.008));}else c=texture2D(cloudMap,vec2(vUv.x-cloudShift-0.0015,vUv.y)).r; col*=1.0-c*c*0.42; }   // 云影
  if(hasNight>0.5) col += texture2D(nightMap,vUv,1.3).rgb*vec3(1.0,0.8,0.5)*(1.0-smoothstep(0.0,0.2,day))*1.7;
  float f=pow(1.0-max(dot(normalize(vN),V),0.0),5.0); col=mix(col,atmo*day*1.3,f*atmoK*0.6);
  if(gasWorld>0.5){
    float latitude=abs(normalize(vObj).y);
    float oval=exp(-pow((latitude-.965)/.012,2.0));
    float curtains=.55+.45*sin(vUv.x*150.0+weatherTime*.5+sin(vUv.x*37.0)*3.0);
    col+=vec3(.04,.35,.22)*oval*curtains*(1.0-day*.8);
  }
  gl_FragColor=vec4(col,1.0);
#include <encodings_fragment>
}`;
  const RING_FRAG = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map; uniform vec3 sunLocal; uniform vec3 lightCol[2]; uniform float planetR;
varying vec2 vUv; varying vec3 vObj;
void main(){
#include <logdepthbuf_fragment>
  vec4 t=texture2D(map,vUv); vec3 p=vec3(vObj.x,0.0,-vObj.y); float al=dot(p,sunLocal); float perp=sqrt(max(0.0,dot(p,p)-al*al));
  float sh = al<0.0 ? smoothstep(planetR*0.985,planetR*1.01,perp) : 1.0;       // 行星投在环上的影子
  gl_FragColor=vec4(t.rgb*lightCol[0]*(0.04+0.96*sh)*0.85,t.a);
#include <encodings_fragment>
}`;
  const CLOUD_FRAG = `
${SurfaceDetail.glsl}
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map; uniform vec3 lightDir[2]; uniform vec3 lightCol[2];
varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vObj;
float hash(vec2 p){ p=fract(p*vec2(0.1031,0.1030)); p+=dot(p,p.yx+33.33); return fract((p.x+p.y)*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.3,9.1); a*=0.5; } return s/0.97; }
void main(){
#include <logdepthbuf_fragment>
  vec3 N=normalize(vN);
  // 云图每个像素约 10 公里。从轨道高度往下看时远远不够，所以凑近后用分形噪声把模糊的云团“雕”出絮状边缘和云块
  vec2 q=vUv*vec2(2.0,1.0); float foot=max(fwidth(vUv.x),fwidth(vUv.y)); float nearK=1.0-smoothstep(0.00004,0.0004,foot);
  vec2 warp=(vec2(fbm(q*260.0),fbm(q*260.0+31.7))-0.5)*0.0009*nearK;
  float c=texture2D(map,vUv+warp).r;
  float n=fbm(q*800.0)*0.6+fbm(q*3200.0+5.0)*0.4;
  float e=c+(n-0.5)*1.15*smoothstep(0.03,0.3,c);
  float a=mix(c*c*1.1,smoothstep(0.3,0.62,e),nearK);
  if(procKind==2.0){c=weather(normalize(vObj));a=c*.9;e=c;}
  float body=mix(1.0,0.72+0.28*smoothstep(0.35,0.8,e),nearK);          // 云顶亮、云缝暗
  vec3 col=vec3(0.0);
  for(int i=0;i<2;i++){ vec3 L=normalize((viewMatrix*vec4(lightDir[i],0.0)).xyz); float nl=dot(N,L);
    vec3 lc=lightCol[i]*mix(vec3(1.0,0.5,0.25),vec3(1.0),smoothstep(-0.05,0.3,nl));
    col+=lc*smoothstep(-0.1,0.45,nl)*(0.4+0.6*max(nl,0.0)); }
  gl_FragColor=vec4(col*0.9*body+vec3(0.010,0.012,0.017)*body, a);   // 夜半球留一点月光 / 气辉下的微光，云的形状仍然看得见
#include <encodings_fragment>
}`;
  const ATMO_FRAG = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 lightDir[2]; uniform vec3 lightCol[2]; uniform vec3 atmo; uniform float atmoK;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main(){
#include <logdepthbuf_fragment>
  vec3 N=normalize(vN), V=normalize(-vP); float rim=1.0-max(dot(N,V),0.0); float day=0.0;
  for(int i=0;i<2;i++){ vec3 L=normalize((viewMatrix*vec4(lightDir[i],0.0)).xyz); day=max(day,smoothstep(-0.3,0.35,dot(N,L))*min(1.0,max(lightCol[i].r,lightCol[i].b))); }
  gl_FragColor=vec4(atmo*pow(rim,4.5)*day*atmoK*1.7,1.0);
#include <encodings_fragment>
}`;
  const STAR_VERT = `
attribute float size; attribute vec3 scolor; varying vec3 vC; uniform vec3 uBeta; uniform float uPx;
void main(){
  vec3 n=normalize(position); float b=length(uBeta); float boost=1.0;
  if(b>0.0005){ vec3 bh=uBeta/b; float c=dot(n,bh); vec3 perp=n-c*bh; float g=sqrt(1.0-b*b);
    n=normalize((c+b)*bh+perp*g);                     // 相对论光行差：星光向前进方向聚拢
    float dop=g/(1.0-b*dot(n,bh)); boost=clamp(dop*dop,0.05,6.0); // 多普勒增亮 / 变暗
    vC=scolor*mix(vec3(1.3,0.55,0.35),vec3(0.75,0.9,1.4),clamp((dop-0.4)/1.4,0.0,1.0))*mix(vec3(1.0),vec3(1.0),0.0);
  } else vC=scolor;
  vC*=min(boost,2.5);
  gl_PointSize=size*uPx*clamp(sqrt(boost),0.5,1.8);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(n*900.0,1.0);
}`;
  const STAR_FRAG = `varying vec3 vC; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.05,d); gl_FragColor=vec4(vC*a,1.0); }`;

  /* ---------- 后期处理：HDR 渲染 → 泛光 → ACES 色调映射 → 暗角与胶片颗粒 ---------- */
  function initPost() {
    const r = W.renderer, quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)), qs = new THREE.Scene(), qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    quad.frustumCulled = false; qs.add(quad);
    const VS = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }';
    const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    const down = mk(`uniform sampler2D t; uniform vec2 px; uniform float thr; varying vec2 vUv;
      void main(){ vec3 c=(texture2D(t,vUv+px*vec2(-1.0,-1.0)).rgb+texture2D(t,vUv+px*vec2(1.0,-1.0)).rgb+texture2D(t,vUv+px*vec2(-1.0,1.0)).rgb+texture2D(t,vUv+px*vec2(1.0,1.0)).rgb)*0.25;
        c=min(max(c,vec3(0.0)),vec3(40.0)); if(thr>0.0){ float l=max(c.r,max(c.g,c.b)); c*=smoothstep(thr,thr*2.2,l); } gl_FragColor=vec4(c,1.0); }`, { t: { value: null }, px: { value: new THREE.Vector2() }, thr: { value: 0 } });
    const blur = mk(`uniform sampler2D t; uniform vec2 dir; varying vec2 vUv;
      void main(){ vec3 c=texture2D(t,vUv).rgb*0.227; c+=(texture2D(t,vUv+dir*1.385).rgb+texture2D(t,vUv-dir*1.385).rgb)*0.316; c+=(texture2D(t,vUv+dir*3.231).rgb+texture2D(t,vUv-dir*3.231).rgb)*0.070; gl_FragColor=vec4(c,1.0); }`, { t: { value: null }, dir: { value: new THREE.Vector2() } });
    const final = mk(`uniform sampler2D t; uniform sampler2D b0; uniform sampler2D b1; uniform sampler2D b2; uniform sampler2D b3; uniform sampler2D b4; uniform float exposure; uniform float time; uniform sampler2D ao; varying vec2 vUv;
      vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
      void main(){ vec3 c=max(texture2D(t,vUv).rgb,vec3(0.0)); float o=texture2D(ao,vUv).r; c*=mix(1.0,o*o,0.9);
        vec3 bl=texture2D(b0,vUv).rgb*0.55+texture2D(b1,vUv).rgb*0.45+texture2D(b2,vUv).rgb*0.4+texture2D(b3,vUv).rgb*0.35+texture2D(b4,vUv).rgb*0.3;
        c=(c+bl*0.3)*exposure; c=aces(c);
        vec2 q=vUv-0.5; c*=1.0-0.38*smoothstep(0.35,0.95,length(q*vec2(1.0,0.82))*1.25);
        c=pow(c,vec3(1.0/2.2)); c+=(fract(sin(dot(vUv*vec2(1973.0,9277.0)+time,vec2(12.9898,78.233)))*43758.5453)-0.5)*0.022;
        gl_FragColor=vec4(c,1.0); }`, { t: { value: null }, b0: { value: null }, b1: { value: null }, b2: { value: null }, b3: { value: null }, b4: { value: null }, exposure: { value: 1 }, time: { value: 0 }, ao: { value: null } });
    // 环境光遮蔽（SSAO）：先用替换材质把“视空间法线 + 深度”画到半分辨率缓冲，再在其上采样估计每个像素被周围几何体遮挡的程度
    const gMat = new THREE.ShaderMaterial({
      vertexShader: `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vN; varying float vZ;
void main(){
#include <beginnormal_vertex>
#include <defaultnormal_vertex>
#include <begin_vertex>
#include <project_vertex>
#include <logdepthbuf_vertex>
  vN=normalize(transformedNormal); vZ=-mvPosition.z; }`,
      fragmentShader: `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vN; varying float vZ;
void main(){
#include <logdepthbuf_fragment>
  gl_FragColor=vec4(normalize(vN)*(gl_FrontFacing?1.0:-1.0),min(vZ,60000.0)); }`,
    });
    const ssao = mk(`uniform sampler2D g; uniform vec2 tanH; uniform vec2 px; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      vec3 posAt(vec2 uv,float z){ return vec3((uv*2.0-1.0)*tanH*z,-z); }
      void main(){ vec4 s=texture2D(g,vUv); float z=s.a; if(z<=0.0||z>150.0){ gl_FragColor=vec4(1.0); return; }
        vec3 n=normalize(s.xyz), p=posAt(vUv,z); float rad=clamp(z*0.12,0.12,0.7);
        float a=hash(vUv/px)*6.2831; vec3 rv=vec3(cos(a),sin(a),hash(vUv/px+7.0)*2.0-1.0); vec3 t=normalize(rv-n*dot(rv,n)); vec3 b=cross(n,t); float occ=0.0;
        for(int i=0;i<14;i++){ float fi=float(i); float r1=fract(fi*0.618+0.13), r2=fract(fi*0.371+0.57), ph=6.2831*r1, ct=sqrt(1.0-r2*0.9), st=sqrt(1.0-ct*ct);
          vec3 d=(t*cos(ph)+b*sin(ph))*st+n*ct; float sc=mix(0.15,1.0,((fi+1.0)/14.0)*((fi+1.0)/14.0)); vec3 q=p+d*rad*sc+n*0.012;
          vec2 uv=(q.xy/(-q.z)/tanH)*0.5+0.5; if(q.z>-0.02||uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0) continue; float zs=texture2D(g,uv).a; if(zs<=0.0) continue; float dz=-q.z-zs;
          occ+=step(0.015,dz)*smoothstep(0.0,1.0,rad/max(abs(z-zs),1e-4)); }
        float ao=1.0-occ/14.0; ao=mix(1.0,ao,1.0-smoothstep(60.0,150.0,z)); gl_FragColor=vec4(vec3(ao),1.0); }`, { g: { value: null }, tanH: { value: new THREE.Vector2() }, px: { value: new THREE.Vector2() } });
    const hidden = [];
    const P = W.post = { levels: [] };
    const opt = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    P.resize = function () {
      const sz = r.getDrawingBufferSize(new THREE.Vector2());
      if (P.scene) { P.scene.dispose(); for (const l of P.levels) { l.a.dispose(); l.b.dispose(); } }
      P.scene = new THREE.WebGLRenderTarget(sz.x, sz.y, { type: THREE.HalfFloatType, samples: W.quality==='performance'?0:W.quality==='high'?4:2, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      if (P.g) { P.g.dispose(); P.ao.dispose(); P.ao2.dispose(); }
      const hw = Math.max(2, Math.round(sz.x / 2)), hh = Math.max(2, Math.round(sz.y / 2));
      P.g = new THREE.WebGLRenderTarget(hw, hh, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      P.ao = new THREE.WebGLRenderTarget(hw, hh, opt); P.ao2 = new THREE.WebGLRenderTarget(hw, hh, opt);
      P.levels = [];
      for (let i = 0, w = sz.x, h = sz.y; i < 5; i++) { w = Math.max(2, Math.round(w / 2)); h = Math.max(2, Math.round(h / 2)); P.levels.push({ a: new THREE.WebGLRenderTarget(w, h, opt), b: new THREE.WebGLRenderTarget(w, h, opt), w, h }); }
    };
    P.resize();
    const pass = (mat, target) => { quad.material = mat; r.setRenderTarget(target); r.render(qs, qc); };
    W.render = function () {
      // 法线 / 深度预通道：透明物体、精灵、点（星星）不参与
      hidden.length = 0;
      W.scene.traverseVisible(o => { if (o.isPoints || o.isSprite || o.isLine || (o.isMesh && (o.material.transparent || o.material.depthTest === false || o.material.colorWrite === false))) { o.visible = false; hidden.push(o); } });
      const sm = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false;
      W.scene.overrideMaterial = gMat; r.setRenderTarget(P.g); r.setClearColor(0x000000, 0); r.clear(); r.render(W.scene, W.camera); W.scene.overrideMaterial = null;
      r.shadowMap.autoUpdate = sm; for (const o of hidden) o.visible = true;
      const th = Math.tan(W.camera.fov * Math.PI / 360);
      ssao.uniforms.g.value = P.g.texture; ssao.uniforms.tanH.value.set(th * W.camera.aspect, th); ssao.uniforms.px.value.set(1 / P.g.width, 1 / P.g.height); pass(ssao, P.ao);
      blur.uniforms.t.value = P.ao.texture; blur.uniforms.dir.value.set(1 / P.g.width, 0); pass(blur, P.ao2);
      blur.uniforms.t.value = P.ao2.texture; blur.uniforms.dir.value.set(0, 1 / P.g.height); pass(blur, P.ao);
      r.setRenderTarget(P.scene); r.render(W.scene, W.camera);
      let src = P.scene, sw = P.scene.width, sh = P.scene.height;
      P.levels.forEach((l, i) => {
        down.uniforms.t.value = src.texture; down.uniforms.px.value.set(0.5 / sw, 0.5 / sh); down.uniforms.thr.value = i === 0 ? 1.9 : 0; pass(down, l.a);
        blur.uniforms.t.value = l.a.texture; blur.uniforms.dir.value.set(1 / l.w, 0); pass(blur, l.b);
        blur.uniforms.t.value = l.b.texture; blur.uniforms.dir.value.set(0, 1 / l.h); pass(blur, l.a);
        src = l.a; sw = l.w; sh = l.h;
      });
      const u = final.uniforms; u.t.value = P.scene.texture; P.levels.forEach((l, i) => { u['b' + i].value = l.a.texture; });
      u.ao.value = P.ao.texture; u.exposure.value = W.exposure; u.time.value = (performance.now() * 0.001) % 10;
      pass(final, null);
    };
  }

  /* ---------- 初始化 ---------- */
  W.init = function (canvas) {
    const r = W.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    TextureAssets.configure(r);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    W.quality='balanced';try{const saved=localStorage.getItem('xinghuan-quality');if(['performance','balanced','high'].includes(saved))W.quality=saved;}catch{}
    r.setPixelRatio(Math.min(window.devicePixelRatio||1,W.quality==='high'?2:1.5)*(W.quality==='performance'?.75:1));
    r.outputEncoding = THREE.sRGBEncoding;
    W.scene = new THREE.Scene();
    // 整个恒星系挂在 root 下。每帧把 root 反向平移 / 旋转，使当前参考系（空间站或飞船所在轨道）恰好落在世界原点且不转动：
    // 这样渲染坐标始终很小（阴影贴图需要），空间站内的静态阴影也只用算一次。
    W.root = new THREE.Group(); W.scene.add(W.root);
    W.camera = new THREE.PerspectiveCamera(62, 1, 0.05, 1e14);
    const resize = () => { r.setSize(innerWidth, innerHeight, false); W.camera.aspect = innerWidth / innerHeight; W.camera.updateProjectionMatrix(); if (W.post) W.post.resize(); };
    addEventListener('resize', resize); resize();
    W.setQuality=function(value){
      if(!['performance','balanced','high'].includes(value))return;
      W.quality=value;
      r.setPixelRatio(Math.min(window.devicePixelRatio||1,value==='high'?2:1.5)*(value==='performance'?.75:1));
      const shadowSize=value==='high'?4096:value==='balanced'?2048:1024;
      W.scene.traverse(o=>{if(o.isLight&&o.shadow){o.shadow.mapSize.set(shadowSize,shadowSize);if(o.shadow.map){o.shadow.map.dispose();o.shadow.map=null;}o.shadow.needsUpdate=true;}});
      resize();try{localStorage.setItem('xinghuan-quality',value);}catch{}
    };


    // 银河背景（贴图为银道坐标、南银极朝上，按银心与银极的真实方位摆放）
    const gc = raDec(266.405, -28.936, new V3()), ngp = raDec(192.859, 27.128, new V3());
    const sky = W.sky = new THREE.Mesh(new THREE.SphereGeometry(950, 48, 24),
      new THREE.MeshBasicMaterial({ map: tex('milkyway'), side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
    sky.material.color.setRGB(1.5, 1.5, 1.6);
    sky.userData.basis = new THREE.Matrix4().makeBasis(gc, ngp.clone().negate(), new V3().crossVectors(ngp, gc));
    sky.matrixAutoUpdate = false; sky.renderOrder = -3; sky.frustumCulled = false; W.root.add(sky);

    // 真实恒星（HYG 星表）
    const n = STARCAT.length / 5, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1));
    const col = new Float32Array(n * 3), base = W.starBase = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const bv = STARCAT[i * 5 + 4], T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)), c = tempColor(T);
      base[i * 3] = c[0]; base[i * 3 + 1] = c[1]; base[i * 3 + 2] = c[2];
    }
    geo.setAttribute('scolor', new THREE.BufferAttribute(col, 3));
    W.starMat = new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: { uBeta: { value: new V3() }, uPx: { value: r.getPixelRatio() } },
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
    W.starPts = new THREE.Points(geo, W.starMat); W.starPts.frustumCulled = false; W.starPts.renderOrder = -2; W.root.add(W.starPts);

    // 飞船 / 空间站受到的光：来自恒星的平行光 + 行星反照光 + 极弱环境光
    W.sunLights = [0, 1].map(() => { const l = new THREE.DirectionalLight(0xffffff, 0); W.scene.add(l, l.target); return l; });
    W.shine = new THREE.DirectionalLight(0xffffff, 0); W.scene.add(W.shine, W.shine.target);
    W.scene.add(new THREE.AmbientLight(0x8090b0, 0.03));
    const sh = W.sunLights[0].shadow; W.sunLights[0].castShadow = true;      // 主恒星的光投射阴影
    sh.mapSize.set(4096, 4096); sh.camera.left = sh.camera.bottom = -95; sh.camera.right = sh.camera.top = 95; sh.camera.near = 10; sh.camera.far = 900; sh.bias = -0.0004; sh.normalBias = 0.04;

    // 环境反射：一个带几块亮面板的暗房间，经预滤波后给金属和光滑表面提供高光
    const env = new THREE.Scene(), eb = (c, k, sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.BackSide })); m.position.set(x, y, z); env.add(m); };
    eb(0x0b0d12, 1, 40, 40, 40, 0, 0, 0); eb(0xffffff, 3.2, 10, 0.5, 10, 0, 19, 0); eb(0xbfd4ff, 1.4, 0.5, 8, 14, 19, 2, 0); eb(0xffe2c0, 1.0, 0.5, 6, 8, -19, -3, 4); eb(0x6f9aff, 0.7, 14, 0.5, 14, 0, -19, 0);
    for (const m of env.children.slice(1)) m.material.side = THREE.DoubleSide;
    const pm = new THREE.PMREMGenerator(r); W.scene.environment = pm.fromScene(env, 0.03).texture; pm.dispose();

    W.sysGroup = new THREE.Group(); W.root.add(W.sysGroup);
    initPost();
    W.glowTex = glowTexture();W.setQuality(W.quality);

    // 把各恒星系的位置对齐到星表里的同一颗星，避免母星在星空里重复出现
    for (const s of SYSTEMS) {
      const d = s.ly * LY / PC, ra = s.ra * 15 * DEG, dec = s.dec * DEG;
      s.pc = [d * Math.cos(dec) * Math.cos(ra), d * Math.cos(dec) * Math.sin(ra), d * Math.sin(dec)];
      let best = -1, bd = 0.04;
      for (let i = 0; i < n; i++) { const dx = STARCAT[i * 5] - s.pc[0], dy = STARCAT[i * 5 + 1] - s.pc[1], dz = STARCAT[i * 5 + 2] - s.pc[2], q = Math.sqrt(dx * dx + dy * dy + dz * dz); if (q < bd) { bd = q; best = i; } }
      if (best >= 0) s.pc = [STARCAT[best * 5], STARCAT[best * 5 + 1], STARCAT[best * 5 + 2]];
    }
  };

  /* 以某个位置（秒差距，赤道坐标）为观察点重算整片星空：近处恒星会产生真实的视差位移 */
  W.updateStars = function (o) {
    const n = STARCAT.length / 5, pos = W.starPts.geometry.attributes.position, size = W.starPts.geometry.attributes.size, col = W.starPts.geometry.attributes.scolor, v = new V3();
    for (let i = 0; i < n; i++) {
      const dx = STARCAT[i * 5] - o[0], dy = STARCAT[i * 5 + 1] - o[1], dz = STARCAT[i * 5 + 2] - o[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const m = d < 0.03 ? 99 : STARCAT[i * 5 + 3] + 5 * Math.log10(d) - 5;
      if (m > 7) { size.array[i] = 0; continue; }
      W.eq2w(dx / d, dy / d, dz / d, v);
      pos.array[i * 3] = v.x; pos.array[i * 3 + 1] = v.y; pos.array[i * 3 + 2] = v.z;
      size.array[i] = clamp(2.2 + (4.5 - m) * 0.9, 1.6, 9);
      const b = clamp(1.5 - m * 0.17, 0.25, 2);
      col.array[i * 3] = W.starBase[i * 3] * b; col.array[i * 3 + 1] = W.starBase[i * 3 + 1] * b; col.array[i * 3 + 2] = W.starBase[i * 3 + 2] * b;
    }
    pos.needsUpdate = size.needsUpdate = col.needsUpdate = true;
  };

  /* ---------- 恒星系 ---------- */
  function lightUniforms() { return { lightDir: { value: [new V3(1, 0, 0), new V3(1, 0, 0)] }, lightCol: { value: [new V3(1, 1, 1), new V3(0, 0, 0)] } }; }
  const texCache = {};
  const getTex = (k, srgb) => texCache[k] || (texCache[k] = tex(k, srgb));

  function proceduralUniforms(def) {
    const p=def.proc, palette=p ? p.pal : [[0,0,0]];
    const u={procKind:{value:p ? ({rock:1,ocean:2,ice:3,lava:4}[p.kind]||0):0},procSeed:{value:p?p.seed:0}};
    for(let i=0;i<4;i++){const c=palette[Math.min(i,palette.length-1)];u['palette'+i]={value:new V3(c[0]/255,c[1]/255,c[2]/255)};}
    return u;
  }
  function makeBody(def) {
    const b = { def, pos: new V3(), group: new THREE.Group(), tilt: new THREE.Group(), uni: [], sunLocal: new V3(0, 1, 0), ld: [new V3(1, 0, 0), new V3(1, 0, 0)] };
    b.tilt.quaternion.setFromAxisAngle(new V3(1, 0, 0), -(def.tilt || 0) * DEG);
    b.pole = new V3(0, 1, 0).applyQuaternion(b.tilt.quaternion);
    b.group.add(b.tilt);
    const geo = new THREE.SphereGeometry(def.R, def.id === 'earth' ? 192 : 96, def.id === 'earth' ? 128 : 64);
    if (def.kind === 'star') {
      const c = tempColor(def.T); b.color = new THREE.Color(c[0], c[1], c[2]);
      const map = def.tex ? getTex(def.tex) : procTexture('star', 7, [[c[0] * 190, c[1] * 190, c[2] * 190], [c[0] * 255, c[1] * 255, c[2] * 255], [255, 255, 255]]);
      b.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map }));
      b.mesh.material.color.setRGB(9, 9, 9);            // 远高于 1：交给泛光和色调映射去表现“亮得刺眼”
      b.glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: W.glowTex, color: b.color.clone().lerp(new THREE.Color(1, 1, 1), 0.5).multiplyScalar(2.2), blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false, transparent: true }));
      b.group.add(b.glare);
    } else {
      b.color = new THREE.Color(def.color || 0xaaaaaa);
      const u = Object.assign(lightUniforms(), proceduralUniforms(def), {
        map: { value: def.tex ? getTex(def.tex) : procTexture(def.proc.kind, def.proc.seed, def.proc.pal) },
        nightMap: { value: def.id === 'earth' ? getTex('earthNight') : null }, hasNight: { value: def.id === 'earth' ? 1 : 0 },
        specMap: { value: def.id === 'earth' ? getTex('earthSpec', false) : null }, hasSpec: { value: def.id === 'earth' ? 1 : 0 },
        atmo: { value: new THREE.Color(def.atmo ? def.atmo[0] : 0) }, atmoK: { value: def.atmo ? def.atmo[1] : 0 }, gain: { value: def.gain || 1 },
        cloudMap: { value: def.id === 'earth' ? getTex('earthClouds', false) : null }, hasCloud: { value: def.id === 'earth' || def.proc?.kind === 'ocean' ? 1 : 0 }, cloudShift: { value: 0 },
        ringMap: { value: def.ring ? getTex('saturnRing') : null }, hasRing: { value: def.ring ? 1 : 0 }, ringIn: { value: def.ring ? def.ring[0] : 0 }, ringOut: { value: def.ring ? def.ring[1] : 1 },
        weatherTime:{value:0},gasWorld:{value:['jupiter','saturn','uranus','neptune'].includes(def.id)?1:0},
        spin: { value: 0 }, sunLocal: { value: b.sunLocal },
        bump: { value: def.bump != null ? def.bump : (def.proc && def.proc.kind !== 'gas' && def.proc.kind !== 'ocean' ? 5 : 0) }, texel: { value: def.id === 'earth' ? 1 / 8192 : def.tex ? 1 / 4096 : 1 / 512 },
        detail: { value: def.detail != null ? def.detail : (def.atmo ? 0.1 : 0.3) },
      });
      b.mainU = u;
      b.uni.push(u);
      b.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BODY_FRAG, uniforms: u }));
      if (def.id === 'earth' || def.proc?.kind === 'ocean') {
        const cu = Object.assign(lightUniforms(), proceduralUniforms(def), { map: { value: def.id === 'earth' ? getTex('earthClouds', false) : u.map.value } }); b.uni.push(cu);
        b.clouds = new THREE.Mesh(new THREE.SphereGeometry(def.R * 1.0035, 128, 96), new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: CLOUD_FRAG, uniforms: cu, transparent: true, depthWrite: false }));
        b.clouds.renderOrder = 1; b.tilt.add(b.clouds);
      }
      if (def.atmo) {
        const au = Object.assign(lightUniforms(), { atmo: { value: new THREE.Color(def.atmo[0]) }, atmoK: { value: def.atmo[1] } }); b.uni.push(au);
        const sh = new THREE.Mesh(new THREE.SphereGeometry(def.R * 1.018, 96, 64), new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: ATMO_FRAG, uniforms: au, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        sh.renderOrder = 2; b.group.add(sh);
      }
      if (def.ring) {
        const rg = new THREE.RingGeometry(def.ring[0], def.ring[1], 160, 1), p = rg.attributes.position, uv = rg.attributes.uv;
        for (let i = 0; i < p.count; i++) uv.setXY(i, (Math.hypot(p.getX(i), p.getY(i)) - def.ring[0]) / (def.ring[1] - def.ring[0]), 0.5);
        const ru = Object.assign(lightUniforms(), { map: { value: getTex('saturnRing') }, sunLocal: { value: b.sunLocal }, planetR: { value: def.R } }); b.uni.push(ru);
        const ring = new THREE.Mesh(rg, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: RING_FRAG, uniforms: ru, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.renderOrder = 3; b.tilt.add(ring);
      }
      // 远处的行星在天空中只是一个光点
      b.dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: W.glowTex, color: b.color, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false, transparent: true }));
      b.dot.scale.setScalar(0.011); b.group.add(b.dot);
    }
    b.tilt.add(b.mesh);
    return b;
  }

  W.setSystem = function (id) {
    const sys = W.sys = SYSTEMS.find(s => s.id === id);
    // Dispose geometry/materials and procedural maps; shared streamed textures stay cached.
    for(const b of W.bodies){
      const owned=new Set();b.group.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){if(!b.def.tex&&o.material.map?.isCanvasTexture)owned.add(o.material.map);o.material.dispose();}});
      if(!b.def.tex && b.mainU)owned.add(b.mainU.map.value);
      for(const t of owned)if(t!==W.glowTex)t.dispose();
    }
    while (W.sysGroup.children.length) W.sysGroup.remove(W.sysGroup.children[0]);
    W.bodies = sys.bodies.map(makeBody); W.byId = {};
    for (const b of W.bodies) { W.byId[b.def.id] = b; W.sysGroup.add(b.group); }
    W.starBodies = W.bodies.filter(b => b.def.kind === 'star');
    W.updateStars(sys.pc);
  };

  const tmp = new V3(), tmp2 = new V3(), tq = new THREE.Quaternion();
  function orbitPos(def, t, o) {
    if (!def.a) return o.set(0, 0, 0);
    const L = (def.L0 + 360 * (t / DAY) / def.P) * DEG;
    o.set(def.a * Math.cos(L), 0, -def.a * Math.sin(L));
    if (def.eq && W.byId[def.parent]) o.applyQuaternion(W.byId[def.parent].tilt.quaternion);   // 卫星在母星的赤道面内公转
    return o;
  }
  W.bodyPosAt = function (b, t, o) { orbitPos(b.def, t, o); if (b.def.parent) o.add(W.bodyPosAt(W.byId[b.def.parent], t, new V3())); return o; };

  W.updateBodies = function (t) {
    for (const b of W.bodies) {
      orbitPos(b.def, t, b.pos); if (b.def.parent) b.pos.add(W.byId[b.def.parent].pos);
      b.group.position.copy(b.pos);
      // 地球按格林尼治恒星时取向，所以昼夜分界落在真实的地方
      b.mesh.rotation.y = b.def.id === 'earth' ? ((280.46061837 + 360.98564736629 * (t / DAY)) % 360) * DEG : 2 * Math.PI * ((t / 3600 / b.def.rot) % 1);
      if (b.clouds) { b.clouds.rotation.y = b.mesh.rotation.y + t * 4e-6; b.mainU.cloudShift.value = (t * 4e-6 / (2 * Math.PI)) % 1; }
      if (b.mainU) {b.mainU.spin.value = b.mesh.rotation.y;b.mainU.weatherTime.value=(t%60000)*.01;}
    }
    // 每个天体受到的恒星光（方向 + 按 L/d² 归一的强度）
    for (const b of W.bodies) {
      if (!b.uni.length) continue;
      let mx = 0; const k = [0, 0];
      W.starBodies.forEach((s, i) => { if (i < 2) { k[i] = s.def.lum / Math.max(1, tmp.copy(s.pos).sub(b.pos).lengthSq()); mx = Math.max(mx, k[i]); } });
      for (const u of b.uni) for (let i = 0; i < 2; i++) {
        const s = W.starBodies[i];
        if (!s) { u.lightCol.value[i].set(0, 0, 0); continue; }
        b.ld[i].copy(s.pos).sub(b.pos).normalize();
        if (i === 0) b.sunLocal.copy(b.ld[0]).applyQuaternion(tq.copy(b.tilt.quaternion).invert());
        const w = clamp(k[i] / mx, 0, 1) * 1.2; u.lightCol.value[i].set(s.color.r * w, s.color.g * w, s.color.b * w);
      }
    }
  };

  /* 以观察点 P 为中心更新天空、光照与阴影。frameBody：当前绕行的天体（用于反照光） */
    /* 让 frameGroup（root 的直接子节点）落在世界原点且不转动；没有参考系时（巡航）只把 pos 平移到原点 */
  W.setRoot = function (frameGroup, pos) {
    const R = W.root;
    if (frameGroup) { R.quaternion.copy(frameGroup.quaternion).invert(); R.position.copy(frameGroup.position).applyQuaternion(R.quaternion).negate(); }
    else { R.quaternion.identity(); R.position.copy(pos).negate(); }
    R.updateMatrix(); R.matrixWorld.copy(R.matrix); R.matrixWorldNeedsUpdate = true;
  };
  W.toSys = (v) => v.applyMatrix4(tm.copy(W.root.matrixWorld).invert());
  const tm = new THREE.Matrix4();

  let textureTick=0;
  W.updateView = function (P, frameBody, betaVec, dim = 1) {
    if(++textureTick%45===0){
      let candidate=null,largest=0;
      const forward=W.camera.getWorldDirection(new V3()).applyQuaternion(W.root.quaternion.clone().invert());
      for(const b of W.bodies){
        const delta=b.pos.clone().sub(P),angle=b.def.R/Math.max(1,delta.length());
        if(delta.normalize().dot(forward)>-.15 && angle>largest){candidate=b;largest=angle;}
        if(b.mainU)b.mainU.texel.value=1/(b.mainU.map.value.image?.width||512);
      }
      if(candidate&&largest>.015)TextureAssets.prefetch(candidate.def,largest>.10?2:1);
    }
    W.sky.matrix.copy(W.sky.userData.basis).setPosition(P); W.sky.matrixWorldNeedsUpdate = true;
    W.starPts.position.copy(P);
    W.starMat.uniforms.uBeta.value.copy(betaVec || tmp.set(0, 0, 0));
    const bl = betaVec ? betaVec.length() : 0; const sb = (W.skyBoost || 1) * 1.5 * (1 - bl); W.sky.material.color.setRGB(sb, sb, sb * 1.06);
    let mx = 0; const k = [0, 0];
    W.starBodies.forEach((s, i) => { if (i < 2) { k[i] = s.def.lum / Math.max(1, tmp.copy(s.pos).sub(P).lengthSq()); mx = Math.max(mx, k[i]); } });
    W.sunLights.forEach((l, i) => {
      const s = W.starBodies[i];
      if (!s) { l.intensity = 0; return; }
      // 是否处在某颗行星的影子里（圆柱近似，边缘做平滑过渡）
      let f = 1;
      for (const b of W.bodies) {
        if (b.def.kind === 'star') continue;
        const d = tmp.copy(b.pos).sub(s.pos).normalize(), v = tmp2.copy(P).sub(b.pos), along = v.dot(d);
        if (along <= 0) continue;
        const perp = Math.sqrt(Math.max(0, v.lengthSq() - along * along));
        f = Math.min(f, smooth((perp - b.def.R + 2e4) / 7e4));
      }
      if (i === 0) { W.sunFactor = f; W.toStar.copy(s.pos).sub(P).normalize(); }
      l.target.position.copy(W.shadowCenter); l.position.copy(s.pos).sub(P).normalize().applyQuaternion(W.root.quaternion).multiplyScalar(450).add(W.shadowCenter); l.target.updateMatrixWorld();
      l.color.copy(s.color).lerp(new THREE.Color(1, 1, 1), 0.35);
      if (f < 1) l.color.lerp(new THREE.Color(1, 0.45, 0.2), (1 - f) * 0.8);   // 穿过大气的日出 / 日落光
      l.intensity = 2.3 * dim * f * clamp(k[i] / mx, 0.02, 1) * (W.transitVisibility==null?1:W.transitVisibility);
      const far = tmp.copy(s.pos).sub(P).length();
      s.glare.material.opacity=W.transitVisibility==null?1:W.transitVisibility;
      s.glare.scale.setScalar(clamp(60 * s.def.R / far, 0.02, 0.45) * (0.25 + 0.75 * f));
    });
    if (frameBody && frameBody.def.kind !== 'star') {
      const up = tmp.copy(P).sub(frameBody.pos).normalize(), lit = clamp(up.dot(W.toStar) * 1.1 + 0.25);
      W.shine.target.position.copy(W.shadowCenter); W.shine.position.copy(up).applyQuaternion(W.root.quaternion).multiplyScalar(-100).add(W.shadowCenter); W.shine.target.updateMatrixWorld();
      W.shine.color.copy(frameBody.color).lerp(new THREE.Color(1, 1, 1), 0.3); W.shine.intensity = (0.55 * lit + 0.02) * dim * (W.shineK == null ? 1 : W.shineK);
    } else W.shine.intensity = 0;
    for (const b of W.bodies) if (b.dot) { const d = tmp.copy(b.pos).sub(P).length(); b.dot.visible = b.def.R / d < 0.0035; }
    for (const b of W.bodies) for (const u of b.uni) for (let i = 0; i < 2; i++) u.lightDir.value[i].copy(b.ld[i]).applyQuaternion(W.root.quaternion);
  };

  /* 把天体名字投影到屏幕上（驾驶 / 出舱时显示） */
  const labelEls = {};
  const labelBounds=new THREE.Box3(),labelPoint=new V3();
  W.updateLabels = function (show, host, frameBody) {
    const cam = W.camera, seen = {};
    let shipRect=null;
    if(show&&W.labelOccluder){
      labelBounds.copy(W.labelOccluder.userData.labelHullBounds);
      W.labelOccluder.updateWorldMatrix(true,false);
      let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
      for(let i=0;i<8;i++){
        labelPoint.set(i&1?labelBounds.max.x:labelBounds.min.x,i&2?labelBounds.max.y:labelBounds.min.y,i&4?labelBounds.max.z:labelBounds.min.z).applyMatrix4(W.labelOccluder.matrixWorld).project(cam);
        if(labelPoint.z>=-1&&labelPoint.z<=1){const x=(labelPoint.x+1)*innerWidth/2,y=(1-labelPoint.y)*innerHeight/2;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      }
      if(Number.isFinite(left))shipRect={left:left-16,right:right+16,top:top-16,bottom:bottom+16};
    }
    if (show) for (const b of W.bodies) {
      if (b.def.kind === 'moon' && b !== frameBody && W.byId[b.def.parent] !== frameBody && !(frameBody && frameBody.def.parent === b.def.parent)) continue;   // 别处的卫星不标名字
      // At outer-planet distances projected depth rounds to 1 (and sometimes
      // just above it). Clip using camera-space metres, not NDC depth.
      const v = b.pos.clone().applyMatrix4(W.root.matrixWorld).applyMatrix4(cam.matrixWorldInverse);
      const depth=-v.z;
      if(depth<cam.near || depth>cam.far)continue;
      const projection=cam.projectionMatrix.elements;
      v.set(projection[0]*v.x/depth-projection[8],projection[5]*v.y/depth-projection[9],0);
      if(Math.abs(v.x)>1 || Math.abs(v.y)>1)continue;
      const cp = W.toSys(cam.getWorldPosition(tmp2)), dir = tmp.copy(b.pos).sub(cp), dist = dir.length(); dir.multiplyScalar(1 / dist);
      // A nearby resolved planet is already identified in the HUD. Its centre
      // marker should not float in front of its surface or the player's ship.
      if(b===frameBody || b.def.R/dist>.045)continue;
      const sx=(v.x+1)*innerWidth/2,sy=(1-v.y)*innerHeight/2;
      if(shipRect&&sx+100>shipRect.left&&sx-14<shipRect.right&&sy+12>shipRect.top&&sy-12<shipRect.bottom)continue;
      let hid = false;
      for (const o of W.bodies) { if (o === b) continue; const oc = o.pos.clone().sub(cp), al = oc.dot(dir); if (al > 0 && al < dist && oc.cross(dir).lengthSq() < o.def.R * o.def.R) { hid = true; break; } }
      if (hid) continue;
      let el = labelEls[b.def.id];
      if (!el) { el = labelEls[b.def.id] = document.createElement('div'); el.className = 'label'; el.textContent = b.def.name; host.appendChild(el); }
      // Whole CSS pixels keep glyph rasterization stable during slow drift.
      el.style.display = 'block'; el.style.left = Math.round(sx) + 'px'; el.style.top = Math.round(sy) + 'px';
      seen[b.def.id] = 1;
    }
    for (const k in labelEls) if (!seen[k]) labelEls[k].style.display = 'none';
  };
  W.clearLabels = function () { for (const k in labelEls) { labelEls[k].remove(); delete labelEls[k]; } };
})();

/* 圆轨道上的随动参考系（LVLH）：X 指向速度方向，Y 指向天顶，Z = X×Y。
   飞船和空间站都挂在这样的参考系里，近距离相对运动用 Clohessy–Wiltshire 方程。 */
class OrbitFrame {
  constructor(body, alt, incDeg) {
    this.body = body; this.r = body.def.R + alt; this.alt = alt;
    this.n = Math.sqrt(body.def.GM / (this.r * this.r * this.r));   // 平均角速度
    this.speed = this.n * this.r; this.period = 2 * Math.PI / this.n;
    const p = body.pole, x = new V3(1, 0, 0);
    this.u = x.sub(p.clone().multiplyScalar(x.dot(p))).normalize();
    const nrm = p.clone().multiplyScalar(Math.cos(incDeg * DEG)).add(new V3().crossVectors(this.u, p).multiplyScalar(Math.sin(incDeg * DEG)));
    this.w = new V3().crossVectors(nrm, this.u).normalize();
    this.th0 = 0; this.group = new THREE.Group(); this.rad = new V3(); this.vel = new V3(); this.m = new THREE.Matrix4();
  }
  /* 调整轨道相位，使 t 时刻位于朝向 dir 的一侧（抵达时落在昼半球上空） */
  faceAt(t, dir) { this.th0 = Math.atan2(dir.dot(this.w), dir.dot(this.u)) - this.n * t; }
  update(t) {
    const th = this.n * t + this.th0, c = Math.cos(th), s = Math.sin(th);
    this.rad.copy(this.u).multiplyScalar(c).addScaledVector(this.w, s);
    this.vel.copy(this.u).multiplyScalar(-s).addScaledVector(this.w, c);
    this.group.position.copy(this.rad).multiplyScalar(this.r).add(this.body.pos);
    this.m.makeBasis(this.vel, this.rad, new V3().crossVectors(this.vel, this.rad));
    this.group.quaternion.setFromRotationMatrix(this.m);
  }
  /* CW 方程给出的相对加速度（x 沿迹、y 径向、z 轨道面法向） */
  cw(pos, vel, o) { const n = this.n; return o.set(-2 * n * vel.y, 3 * n * n * pos.y + 2 * n * vel.x, -n * n * pos.z); }
}
function parkingAlt(def) { return def.alt ? def.alt : def.kind === 'star' ? 8.8 * def.R : def.R > 2e7 ? 0.6 * def.R : Math.max(1.2e5, 0.35 * def.R); }
