"""Edit the score, add restrained sound design, and encode the 1080p master.

Requires Python packages numpy and imageio-ffmpeg. Run after render.mjs --render.
"""
from pathlib import Path
import json
import subprocess
import wave

import imageio_ffmpeg
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
EXPORT = ROOT / 'exports' / 'tech-demo'
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
RATE, DURATION = 48000, 52


def run(args):
    subprocess.run([FFMPEG, '-hide_banner', '-y', *map(str, args)], check=True)


def sound_design():
    rng = np.random.default_rng(408)
    mix = np.zeros((RATE * DURATION, 2), np.float32)

    def add(at, signal, level=1, pan=0):
        start = int(at * RATE)
        n = min(len(signal), len(mix) - start)
        mix[start:start+n, 0] += signal[:n] * level * np.sqrt((1-pan)/2)
        mix[start:start+n, 1] += signal[:n] * level * np.sqrt((1+pan)/2)

    # Soft transmission pings: brief fundamentals with long, quiet echoes.
    for at in [.9, 6.1, 10.1, 19.1, 22.1, 25.1, 33.1, 37.1, 42.1, 46.15]:
        t = np.arange(int(RATE * 1.3)) / RATE
        signal = (np.sin(2*np.pi*880*t) + .23*np.sin(2*np.pi*1760*t))
        signal *= (1-np.exp(-t*130))*np.exp(-t*8)
        add(at, signal, .026, -.2)
        add(at+.21, signal, .008, .4)

    # Low-frequency propulsion pulse and narrow-band air sweeps at major cuts.
    for at in [0, 25, 29, 33, 37, 42, 46]:
        t = np.arange(int(RATE * 1.8)) / RATE
        phase = 2*np.pi*(38*t + 45*.13*(1-np.exp(-t/.13)))
        pulse = np.sin(phase)*(1-np.exp(-t*80))*np.exp(-t*3)
        add(at, pulse, .11 if at == 29 else .065)
        t = np.arange(int(RATE * .7)) / RATE
        noise = rng.normal(0, 1, len(t))
        f = np.fft.rfftfreq(len(t), 1/RATE)
        spectrum = np.fft.rfft(noise)
        spectrum *= np.exp(-((f-1100)/950)**2)
        sweep = np.fft.irfft(spectrum, n=len(t))
        sweep *= np.sin(np.pi*t/.7)**2
        add(max(0, at-.42), sweep, .042, -.25)
        add(max(0, at-.37), sweep, .028, .35)

    # Engine bed only under the four-second ignition shot.
    t = np.arange(RATE*4) / RATE
    engine = (np.sin(2*np.pi*48*t)+.3*np.sin(2*np.pi*73*t))
    engine *= np.minimum(t/.7,1)*np.minimum((4-t)/.9,1)
    add(29, engine, .022)
    with wave.open(str(EXPORT / 'sound-design.wav'), 'wb') as f:
        f.setnchannels(2); f.setsampwidth(2); f.setframerate(RATE)
        f.writeframes((np.clip(mix,-1,1)*32767).astype('<i2').tobytes())


def main():
    metadata = json.loads((EXPORT / 'timeline.json').read_text())
    frames = list((EXPORT / 'frames').glob('f*.jpg'))
    if len(frames) != metadata['frames']:
        raise RuntimeError(f"Capture incomplete: {len(frames)}/{metadata['frames']}")
    sound_design()
    # Bring the later, more propulsive section forward for departure, then use
    # the generated score's actual final cadence to resolve the closing title.
    edit = (
        '[0:a]asplit=3[a][b][c];'
        '[a]atrim=0:26.4,asetpts=PTS-STARTPTS[a0];'
        '[b]atrim=72:93.8,asetpts=PTS-STARTPTS[b0];'
        '[c]atrim=197.6:203.8,asetpts=PTS-STARTPTS[c0];'
        '[a0][b0]acrossfade=d=1.2:c1=tri:c2=tri[ab];'
        '[ab][c0]acrossfade=d=1.2:c1=tri:c2=tri,'
        'afade=t=in:d=0.45,afade=t=out:st=50.4:d=1.6[music];'
        '[music][1:a]amix=inputs=2:duration=first:normalize=0,'
        'alimiter=limit=0.95:level=false[mix]'
    )
    run(['-loglevel','warning','-i',EXPORT/'orbit-atlas.mp3','-i',EXPORT/'sound-design.wav',
         '-filter_complex',edit,'-map','[mix]','-ar',RATE,'-c:a','pcm_s24le',EXPORT/'mix.wav'])
    analysis = subprocess.run([FFMPEG,'-hide_banner','-i',str(EXPORT/'mix.wav'),
        '-af','loudnorm=I=-16:TP=-1.5:LRA=10:print_format=json','-f','null','-'],
        capture_output=True,text=True,check=True).stderr
    measured = json.loads(analysis[analysis.rindex('{'):analysis.rindex('}')+1])
    norm = ('loudnorm=I=-16:TP=-1.5:LRA=10:linear=true:'
        f"measured_I={measured['input_i']}:measured_TP={measured['input_tp']}:"
        f"measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}:"
        f"offset={measured['target_offset']}")
    chapters = ';FFMETADATA1\ntitle=星环站 · 轨道生活 — 科技感 Demo\n'
    marks = [(0,10,'在轨家园'),(10,25,'失重日常'),(25,33,'离站启航'),(33,46,'深空探索'),(46,52,'星环站')]
    for start,end,title in marks:
        chapters += f'[CHAPTER]\nTIMEBASE=1/1000\nSTART={start*1000}\nEND={end*1000}\ntitle={title}\n'
    (EXPORT/'chapters.txt').write_text(chapters)
    destination = ROOT/'星环站-科技感Demo.mp4'
    run(['-loglevel','warning','-framerate','30','-i',EXPORT/'frames/f%05d.jpg',
         '-i',EXPORT/'mix.wav','-i',EXPORT/'chapters.txt',
         '-map','0:v','-map','1:a','-map_metadata','2','-map_chapters','2',
         '-vf','scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p',
         '-c:v','libx264','-preset','slow','-crf','18','-profile:v','high',
         '-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',
         '-af',norm,'-c:a','aac','-b:a','256k','-ar',RATE,
         '-t',DURATION,'-movflags','+faststart',destination])
    print('WROTE',destination)


if __name__ == '__main__':
    main()
