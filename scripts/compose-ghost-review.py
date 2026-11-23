"""Prepare lossless source pairs and labelled, downscaled contact sheets.
No grading, interpolation filters beyond resizing, or generated imagery.
Usage: compose-ghost-review.py ALBUM VEHICLES_BEFORE VEHICLES_AFTER ACTORS_BEFORE ACTORS_AFTER
"""
import hashlib
import html
import json
import re
from pathlib import Path
import shutil
import sys
from PIL import Image, ImageDraw, ImageFont, ImageOps

album, vb, va, ab, aa = (Path(p).resolve() for p in sys.argv[1:])
wb, wa = album/'before', album/'after'
fb, fa = album/'fx-before', album/'fx-after'
sections = [
    ('vehicles','Armor and aviation', vb, va, [
        ('tank-nose-paint','Red shark paint'),('tank-flank','Turret and stowage'),
        ('huey-flight','Flying Huey'),('huey-door','Open troop compartment'),('huey-wreck','Downed Huey')]),
    ('actors','Infantry and horde', ab, aa, [('us','US infantry'),('vc','Vietnamese infantry'),
        ('boss','Wave four: front face'),('boss-rear','Wave four: rear face')]),
    ('effects','Fire and ordnance', fb, fa, [('wreck-flame','Wreck fire and soot'),
        ('cannon-in-flight','Cannon round in flight'),('cannon-soil-impact','Ground impact'),
        ('doom-sundae','Boss projectile: ice-cream comet'),('machinegun-in-flight','Machine-gun tracer')]),
    ('weather','River and embassy', wb, wa, [('water-detail','River surface'),('rain','Embassy approach')]),
]
def font(size,bold=False):
    p=Path('/System/Library/Fonts/Supplemental')/('Arial Bold.ttf' if bold else 'Arial.ttf')
    return ImageFont.truetype(str(p),size) if p.is_file() else ImageFont.load_default(size=size)
raw=album/'frames';raw.mkdir(parents=True,exist_ok=True)
records=[]; content=[]
reports=[(vb/'capture.json',va/'capture.json'),(ab/'report-all.json',aa/'report-all.json'),
    (fb/'capture.json',fa/'capture.json'),(wb/'weather.json',wa/'weather.json')]
def builds(paths):
    return set(re.findall(r'GameSession-[\w-]+\.js','\n'.join(p.read_text() for p in paths)))
baseline=builds([before for before,_ in reports])
candidate=builds([after for _,after in reports])
assert len(baseline)==len(candidate)==1 and baseline!=candidate, (baseline,candidate)
for _,after in reports:
    assert builds([after])==candidate, f'Unverified final bundle for {after}'
for slug,title,b,a,items in sections:
    pairs=[]
    for fil,cap in items:
        pair=[f/ (fil+'.png') for f in (b,a)]
        if not all(f.is_file() for f in pair):
            if fil in ('machinegun-in-flight','doom-sundae'): continue
            raise RuntimeError(f'Missing required source pair: {pair}')
        paths=[]; dimensions=[]; hashes=[]
        for src,stage in zip(pair,('before','after')):
            dest=raw/(fil+'-'+stage+'.png')
            shutil.copyfile(src,dest)
            with Image.open(dest) as im: dimensions.append(im.size); im.verify()
            hashes.append(hashlib.sha256(dest.read_bytes()).hexdigest());paths.append(dest)
        assert dimensions[0]==dimensions[1], (fil,dimensions)
        assert hashes[0]!=hashes[1],fil
        records.append(dict(subject=cap,sources=[str(p) for p in pair],images=[p.name for p in paths],size=dimensions[0],sha256=hashes,
                            productionBundles=[next(iter(baseline)),next(iter(candidate))]))
        pairs.append((cap,paths))
    if not pairs: continue
    w, pad, gap, pw, ph, row, first=1460,25,12,699,393,448,102
    img=Image.new('RGB',(w,first+row*len(pairs)+10),'#121a1b')
    dr=ImageDraw.Draw(img)
    dr.text((pad,15),'GHOST SIGNAL   /   '+title.upper(),font=font(29,True),fill='#eceee2')
    dr.text((pad,64),'BEFORE',font=font(18,True),fill='#adaf9d')
    dr.text((pad+pw+gap,64),'AFTER',font=font(18,True),fill='#a4d6c0')
    content.append(f'<h2>{html.escape(title)}</h2>')
    for i,(cap,paths) in enumerate(pairs):
        y=first+i*row
        for j,p in enumerate(paths):
            with Image.open(p) as original:
                resized=ImageOps.contain(original.convert('RGB'),(pw,ph),method=Image.Resampling.LANCZOS)
                x=pad+(pw+gap)*j;img.paste(resized,(x+(pw-resized.width)//2,y+(ph-resized.height)//2))
        dr.text((pad,y+ph+9),cap,font=font(18),fill='#d3daca')
        content.append(f'<figure><figcaption>{html.escape(cap)}</figcaption><div class="pair">'+''.join(f'<a href="frames/{p.name}"><span>{s}</span><img loading="lazy" src="frames/{p.name}" alt="{html.escape(cap)} — {s}"></a>' for s,p in zip(('Before','After'),paths))+'</div></figure>')
    img.save(album/(slug+'.jpg'),quality=93,subsampling=0,optimize=True)
(album/'frames.json').write_text(json.dumps(records,indent=2)+'\n')
hero=[next(r for r in records if r['images'][0]==s+'-before.png') for s in ('tank-nose-paint','us')]
cover=Image.new('RGB',(1280,810),'#121a1b')
dr=ImageDraw.Draw(cover)
dr.text((18,10),'GHOST SIGNAL    /    IN-GAME CLOSE-UPS',font=font(23,True),fill='#e4e9d9')
dr.text((18,48),'BEFORE',font=font(15,True),fill='#adaf9d')
dr.text((649,48),'AFTER',font=font(15,True),fill='#a4d6c0')
for i,r in enumerate(hero):
    for j,file in enumerate(r['images']):
        with Image.open(raw/file) as original:
            # Both are complete 16:9 frames: no content cropped or recolored.
            im=ImageOps.contain(original.convert('RGB'),(616,347),method=Image.Resampling.LANCZOS)
            cover.paste(im,(18+j*630,71+i*367))
    dr.text((21,71+i*367+324),r['subject'],font=font(16,True),fill='#fbf7e9',stroke_width=2,stroke_fill='#111a1a')
cover.save(album/'in-game-comparison.jpg',quality=93,subsampling=0,optimize=True)
for movie,label in [('rain','Embassy rain'),('water-detail','River surface')]:
    if (wa/(movie+'.webm')).is_file():
        content.append(f'<figure><figcaption>{label} · live capture</figcaption><video controls muted playsinline preload="metadata" style="width:min(100%,960px)" src="after/{movie}.webm"></video></figure>')
(album/'index.html').write_text('''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ghost Signal · production frame comparisons</title><style>
:root{color-scheme:dark}body{background:#101818;color:#e4e9d9;font:17px/1.5 system-ui;margin:2vw auto;width:min(96vw,1600px)}h1,h2{line-height:1.15}
h2{border-top:1px solid #41504a;padding-top:1em;margin-top:2em}p{max-width:78ch}
figure{margin:1.8rem 0}figcaption{font-weight:650}.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}
a{color:#aad6ba;text-decoration:none}a:hover{text-decoration:underline}img{width:100%;height:auto;display:block;background:#152021}
span{display:block;text-transform:uppercase;letter-spacing:.12em;font-size:.7em;padding:.5em 0}
@media(max-width:720px){.pair{grid-template-columns:1fr}}</style>
<h1>Ghost Signal</h1><p>Matched production-game captures. Before is on the left; after is on the right. Click a frame for the original pixels. Inspection cameras use the game’s own scene, lights and renderer. Moving actors, rain and vegetation need not occupy identical pixels.</p>'''+''.join(content))
print(f'{len(records)} verified pairs in {album}')
