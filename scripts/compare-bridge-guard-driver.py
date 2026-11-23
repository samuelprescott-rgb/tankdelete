"""Pair two observed campaign drives. Align by physical exit crossing, not by key-down;
only resize and label whole unmodified browser frames. Preserve the original captures."""
import sys, json, subprocess, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

before, after, out = map(Path, sys.argv[1:4])
out.mkdir(exist_ok=True, parents=True)
def read(folder, file):
    return json.loads((folder/file).read_text())
def meta(folder):
    receipt = read(folder, 'driver-receipt.json')
    rows = read(folder, receipt['traceFile'])
    exit_time = next(r['wall']/1000 for r in rows if r['player'][2] >= 22)
    movie_start = receipt['straightEnd']/1000-receipt['straightMovie']['realTimeSeconds']
    return receipt, exit_time, movie_start

b, bx, bs = meta(before)
a, ax, ast = meta(after)
assert not b['bridgeExitThroughStraightWait'].get('firstPulse')
shot = a['bridgeExitThroughStraightWait']['firstPulse']
assert shot and shot['inFrame']
shot_after_exit = shot['wall']/1000-ax
# The live actor enters as the old patrol continues out of frame. Start 3.8s
# before the shot; hold after the burst so the hull and warning read clearly.
lead, trail = 3.8, 2.6
w, bh, h = 800, 45, 450
banner = Image.new('RGB', (2*w,bh), '#18231e'); d = ImageDraw.Draw(banner)
f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 21)
for x,title in [(16,'BEFORE   /   Retained build'),(w+16,'AFTER   /   Revised guard')]:
    d.text((x,11),title,font=f,fill='#f1f3e4')
d.line((w-1,0,w-1,bh), fill='#809086',width=2)
with tempfile.TemporaryDirectory(prefix='bridge-guard-compare-') as scratch:
    png = Path(scratch)/'labels.png'; banner.save(png)
    begin_b = bx-bs+shot_after_exit-lead; begin_a = ax-ast+shot_after_exit-lead
    command=['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y',
        '-ss',f'{begin_b:.4f}','-i',str(before/'driver.mp4'),
        '-ss',f'{begin_a:.4f}','-i',str(after/'driver.mp4'),
        '-loop','1','-i',str(png),'-filter_complex',
        '[0:v]scale=800:450[v0];[1:v]scale=800:450[v1];[v0][v1]hstack=2[drives];[2:v][drives]vstack=2,pad=1600:496:0:0:color=black,format=yuv420p[v]',
        '-map','[v]','-an','-t',str(lead+trail),'-r','18','-c:v','libx264','-crf','22','-threads','2','-preset','veryfast','-movflags','+faststart',str(out/'guard-driver-comparison.mp4')]
    subprocess.run(command,check=True)
poster = Image.new('RGB',(2*w,h+bh))
poster.paste(banner,(0,0))
for x,folder in [(0,before),(w,after)]:
    with Image.open(folder/'04a-far-bank-match-4s5.jpg') as img:
        poster.paste(img.resize((w,h),Image.Resampling.LANCZOS),(x,bh))
poster.save(out/'guard-driver-comparison.jpg',quality=90,optimize=True)
print('Compared',b['bundle'],'and',a['bundle'],'| first visible shot +%.2fs after crossing'%shot_after_exit)
