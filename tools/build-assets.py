#!/usr/bin/env python3
"""把 assets/ 里的贴图和星表打包成 data/*.js。
用 file:// 直接双击打开时，浏览器不允许 WebGL 读取本地图片，所以贴图以 base64 内嵌。"""
import base64, csv, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 'assets')
TEX = {
    'earth': '8k_earth_daymap.jpg', 'earthNight': 'earth_night_4k.jpg', 'earthClouds': 'earth_clouds_4k.jpg',
    'earthSpec': 'earth_spec.jpg', 'moon': 'moon_4k.jpg', 'sun': 'sun_4k.jpg', 'mercury': 'mercury_4k.jpg',
    'venus': '4k_venus_atmosphere.jpg', 'mars': 'mars_4k.jpg', 'jupiter': 'jupiter_4k.jpg', 'saturn': 'saturn_4k.jpg',
    'saturnRing': '2k_saturn_ring_alpha.png', 'uranus': '2k_uranus.jpg', 'neptune': '2k_neptune.jpg',
    'milkyway': 'milkyway_4k.jpg',
}
with open(os.path.join(ROOT, 'data', 'textures.js'), 'w') as f:
    f.write('window.TEX={\n')
    for k, fn in TEX.items():
        mime = 'image/png' if fn.endswith('.png') else 'image/jpeg'
        b = base64.b64encode(open(os.path.join(A, fn), 'rb').read()).decode()
        f.write(f'{k}:"data:{mime};base64,{b}",\n')
    f.write('};\n')

# 星表：HYG v3.8，取肉眼可见（视星等 <= 6.5）的恒星，保留三维位置以便在别的恒星系重算星空
out = []
with open(os.path.join(A, 'hyg.csv')) as f:
    for r in csv.DictReader(f):
        try:
            mag = float(r['mag']); d = float(r['dist'])
        except ValueError:
            continue
        if r['proper'] == 'Sol':
            out += [0, 0, 0, 4.83, 0.656]; continue
        if mag > 6.5 or d >= 100000:      # 100000 = 距离未知
            continue
        ci = float(r['ci']) if r['ci'] else 0.6
        out += [round(float(r['x']), 3), round(float(r['y']), 3), round(float(r['z']), 3), round(float(r['absmag']), 2), round(ci, 2)]
with open(os.path.join(ROOT, 'data', 'stars.js'), 'w') as f:
    f.write('// x,y,z（秒差距，赤道坐标）, 绝对星等, 色指数 B-V\nwindow.STARCAT=' + json.dumps(out, separators=(',', ':')) + ';\n')
print('stars:', len(out) // 5)

# 太阳邻域星表：距太阳 17 秒差距（约 55 光年）以内的全部恒星，不论亮暗（红矮星大多肉眼看不见）。供多级星图使用
near, names, spect = [], [], []
with open(os.path.join(A, 'hyg.csv')) as f:
    for r in csv.DictReader(f):
        try:
            d = float(r['dist'])
        except ValueError:
            continue
        if d >= 17:
            continue
        ci = float(r['ci']) if r['ci'] else 1.4
        near += [round(float(r['x']), 4), round(float(r['y']), 4), round(float(r['z']), 4), round(float(r['absmag']), 2), round(ci, 2)]
        if r['proper']:
            nm = r['proper']
        elif r['bayer']:
            nm = r['bayer'] + '|' + r['con']
        elif r['flam']:
            nm = r['flam'] + '|' + r['con']
        elif r['gl']:
            nm = r['gl']
        elif r['hip']:
            nm = 'HIP ' + r['hip']
        else:
            nm = 'HD ' + r['hd'] if r['hd'] else ''
        names.append(nm); spect.append(r['spect'].strip())
with open(os.path.join(ROOT, 'data', 'near.js'), 'w') as f:
    f.write('// 距太阳 55 光年以内的恒星（HYG v3.8）：s = x,y,z（秒差距，赤道坐标）, 绝对星等, 色指数；n = 名称（贝耶 / 弗兰斯蒂德名记作 "字母|星座"）；sp = 光谱型\n')
    f.write('window.NEAR=' + json.dumps({'s': near, 'n': names, 'sp': spect}, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('near:', len(names))

# 运行时使用小预览包与按星球拆分的高清文件；保留 textures.js 供旧工具兼容。
import runpy
runpy.run_path(os.path.join(ROOT, "tools", "build-streaming-textures.py"), run_name="__main__")
