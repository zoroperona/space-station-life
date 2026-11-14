#!/usr/bin/env python3
"""Build small startup previews and file:// compatible, per-texture LOD chunks."""
import ast
import base64
import io
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
tree = ast.parse((ROOT / 'tools/build-assets.py').read_text())
sources = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign)
               and any(isinstance(t, ast.Name) and t.id == 'TEX' for t in n.targets))
OUT = ROOT / 'data/texture-lod'
OUT.mkdir(exist_ok=True)
low, manifest = {}, {}

def encode(image, width, alpha):
    im = image.copy()
    im.thumbnail((width, width), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im.convert('RGBA' if alpha else 'RGB').save(buf, 'PNG' if alpha else 'JPEG', quality=92)
    mime = 'image/png' if alpha else 'image/jpeg'
    return 'data:' + mime + ';base64,' + base64.b64encode(buf.getvalue()).decode(), im.size

for key, name in sources.items():
    src = ROOT / 'assets' / name
    hd = ROOT / 'assets/hd' / (key + '_8k.jpg')
    if key == 'jupiter':
        hd = ROOT / 'assets/hd/jupiter_4k.jpg'
    if key == 'moon' and (ROOT / 'assets/hd/moon_nasa_8k.jpg').exists():
        hd = ROOT / 'assets/hd/moon_nasa_8k.jpg'
    if hd.exists():
        try:
            with Image.open(hd) as check: check.load()
            src = hd
        except OSError:
            print('Incomplete optional download; using original:', hd.name)
    with Image.open(src) as im:
        alpha = 'A' in im.getbands()
        low[key], size = encode(im, 512, alpha)
        levels = []
        for level, width in [(1, 2048), (2, 8192)]:
            data, size = encode(im, width, alpha)
            filename = f'{key}-{level}.js'
            (OUT / filename).write_text(f'TextureAssets.receive({json.dumps(key)},{level},{json.dumps(data)});\n')
            levels.append({'url': 'data/texture-lod/' + filename, 'width': size[0], 'height': size[1]})
        manifest[key] = {'source': str(src.relative_to(ROOT)), 'levels': levels}
(ROOT / 'data/texture-manifest.js').write_text('window.TEXTURE_MANIFEST=' + json.dumps(manifest) + ';\nwindow.TEX_LOW=' + json.dumps(low) + ';\n')
print('Startup texture payload:', (ROOT / 'data/texture-manifest.js').stat().st_size, 'bytes')
print('Lazy-loaded maps:', len(manifest))
