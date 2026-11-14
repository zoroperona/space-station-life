// 录制宣传片：启动无头 Chrome，逐帧推进 index.html?dbg=film 并截图，再用 ffmpeg 合成 MP4。
// 用法：node tools/make-video.mjs <ffmpeg 路径> <输出.mp4> [帧目录]
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [ffmpeg, out, framesDir = path.join(root, '.frames')] = process.argv.slice(2);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', PORT = 9333;
rmSync(framesDir, { recursive: true, force: true }); mkdirSync(framesDir, { recursive: true });
const chrome = spawn(CHROME, ['--headless=new', '--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=metal', '--window-size=1280,720', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(framesDir, 'profile')}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page'); } catch { } }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise(r => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expr => { const m = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); if (m.result.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails)); return m.result.result.value; };
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'file://' + path.join(root, 'index.html') + '?dbg=film' });
  for (let i = 0; i < 100 && !(await evaluate('!!window.film').catch(() => false)); i++) await sleep(200);
  await sleep(5000);                                    // 等贴图解码
  const n = await evaluate('film.frames'); console.log('frames:', n);
  for (let i = 0; i < n; i++) {
    await evaluate(`film.step(${i})`);
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
    writeFileSync(path.join(framesDir, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(shot.result.data, 'base64'));
    if (i % 100 === 0) console.log('frame', i);
  }
  ws.close();
} finally { chrome.kill(); }
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(framesDir, 'f%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '19', '-movflags', '+faststart', out]);
console.log('wrote', out);
