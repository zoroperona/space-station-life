'use strict';
// Script chunks work offline under file://, without fetching every planet at boot.
const TextureAssets = (() => {
  const records = new Map(), tasks = [], deliveries = new Map();
  let active = 0, maxSize = 8192, anisotropy = 8, tick = 0;
  const budget = 384 * 1024 * 1024;
  const image = src => new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(Error('图片解码失败')); im.src = src; });
  const bytes = im => im ? im.width * im.height * 4 * 4 / 3 : 0;
  function install(r, im, level) {
    if (im.width > maxSize || im.height > maxSize) {
      const c = document.createElement('canvas'), scale = Math.min(maxSize / im.width, maxSize / im.height);
      c.width = Math.round(im.width * scale); c.height = Math.round(im.height * scale); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); im = c;
    }
    // Updating the same THREE.Texture updates all surface / cloud / shadow users.
    r.texture.dispose(); r.texture.image = im; r.texture.needsUpdate = true; r.level = level;
    if (level === 0) r.low = im;
    r.used = ++tick;
    trim(r);
  }
  function trim(keep) {
    let total = [...records.values()].reduce((n, r) => n + bytes(r.texture.image), 0);
    for (const r of [...records.values()].filter(r => r !== keep && r.level > 0 && !r.pending).sort((a,b) => a.used-b.used)) {
      if (total <= budget) break;
      total -= bytes(r.texture.image) - bytes(r.low);
      r.texture.dispose(); r.texture.image = r.low; r.texture.needsUpdate = true; r.level = 0;
    }
  }
  function get(key, srgb = true) {
    if (records.has(key)) return records.get(key).texture;
    const texture = new THREE.Texture(); texture.wrapS = THREE.RepeatWrapping; texture.anisotropy = anisotropy;
    if (srgb) texture.encoding = THREE.sRGBEncoding;
    const r = {key, texture, level: -1, low: null, used: ++tick, pending: null, failedAt: 0}; records.set(key,r);
    r.ready = image(TEX_LOW[key]).then(im => install(r, im, 0));
    return texture;
  }
  function chunk(key, level) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script'), id = key + ':' + level;
      const done = (err, data) => {clearTimeout(timer); deliveries.delete(id); script.remove(); err ? reject(err) : resolve(data);};
      const timer = setTimeout(() => done(Error('高清贴图加载超时')), 20000);
      deliveries.set(id, data => done(null, data)); script.onerror = () => done(Error('高清贴图文件不可用'));
      script.src = TEXTURE_MANIFEST[key].levels[level-1].url; document.head.appendChild(script);
    });
  }
  function pump() {
    while (active < 2 && tasks.length) {
      const task = tasks.shift(); active++;
      task().finally(() => {active--;pump();});
    }
  }
  function request(key, level = 2) {
    if (!TEXTURE_MANIFEST[key]) return Promise.resolve(false);
    const r = records.get(key) || (get(key, !/Spec|Clouds/.test(key)), records.get(key));
    r.used = ++tick;
    if (r.level >= level) return Promise.resolve(true);
    if (r.pending) return r.pending.then(() => r.level >= level || r.failedAt ? r.level >= level : request(key, level));
    if (Date.now() - r.failedAt < 30000) return Promise.resolve(false);
    r.pending = new Promise(resolve => tasks.push(async () => {
      try {
        await r.ready;
        for(let next = r.level+1; next <= level; next++) {
          const data = await chunk(key, next), im = await image(data); install(r, im, next);
        }
        r.failedAt = 0; resolve(true);
      } catch(e) {r.failedAt=Date.now();console.warn('Texture fallback:',key,e.message);resolve(false);}
      finally {r.pending=null;trim(r);}
    })); pump(); return r.pending;
  }
  function prefetch(def, level = 2) {
    const keys = def && def.tex ? [def.tex] : [];
    if (def && def.id === 'earth') keys.push('earthClouds','earthSpec','earthNight');
    if (def && def.ring) keys.push('saturnRing');
    return Promise.all(keys.map(k => request(k, /Clouds|Spec|Night/.test(k) ? 1 : level)));
  }
  return {get, request, prefetch,
    receive(key,level,data) {const deliver=deliveries.get(key+':'+level);if(deliver)deliver(data);},
    configure(renderer) {maxSize=renderer.capabilities.maxTextureSize;anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());},
    ready() {return Promise.all([...records.values()].map(r => r.ready));},
    status() {return {active,queued:tasks.length,bytes:[...records.values()].reduce((n,r)=>n+bytes(r.texture.image),0),maps:[...records.values()].map(r=>({key:r.key,level:r.level,width:r.texture.image?.width||0,pending:!!r.pending,failed:!!r.failedAt}))};}
  };
})();
