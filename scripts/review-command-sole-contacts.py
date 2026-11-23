"""Unretouched 1:1 crops from the ordinary production HUD chase (no re-render)."""
import json, math, sys
from bisect import bisect_left
from pathlib import Path
from PIL import Image, ImageDraw

run = Path(sys.argv[1])
report = json.loads((run / "player-chase.json").read_text())
clip = (run / "chase-frames/frames.txt").read_text().splitlines()
names = [v.split("'")[1] for v in clip if v.startswith("file")]
dur = [float(v.split()[1]) for v in clip if v.startswith("duration")]
anchor = report["picks"][0]
times = [anchor["epoch"] + anchor["deltaMs"] / 1000 - sum(dur[:names.index(anchor["frame"])])]
for dt in dur[:-1]: times.append(times[-1] + dt)

def proj(foot, sample):
    dir = sample["cameraDir"]; dx, dy, dz = [a-b for a,b in zip(foot, sample["camera"])]
    side = [-dir[2], 0, dir[0]]; n = math.hypot(*side); side = [a/n for a in side]
    up = [-side[2]*dir[1], side[2]*dir[0]-side[0]*dir[2], side[0]*dir[1]]
    rel = [dx,dy,dz]
    dot = lambda a: sum(x*y for x,y in zip(a,rel))
    k = 540/(math.tan(math.radians(sample["verticalFov"]/2))*dot(dir))
    return round(960+k*dot(side)),round(540-k*dot(up))

samples = report["samples"]
found = {0: [], 1: []}
for k in range(2,len(samples)-1):
    for i in range(2):
        p = samples[k]["feet"][i]
        if abs(p[0])<7.55 and -21.5<p[2]<-14.73 and p[1]<.05 and samples[k-1]["feet"][i][1]>.05:
            found[i].append(k)
assert all(found.values()),found
panel = Image.new("RGB",(3*366,2*188),(22,27,32)); draw=ImageDraw.Draw(panel)
proof = {"bundle":report["bundle"],"approach":"Unedited 1:1 ordinary player-chase crops, centered using traced foot world coordinates. No camera changes.","frames":[]}
for side in range(2):
    k = found[side][-1]
    for col,idx in enumerate([k-2,k-1,k]):
        smp=samples[idx]; t=smp["epoch"]
        near=bisect_left(times,t); index=min([min(near,len(times)-1),max(0,near-1)],key=lambda n:abs(times[n]-t))
        path=run/"chase-frames"/names[index]; x,y=proj(smp["feet"][side],smp)
        with Image.open(path) as frame:
            assert frame.size==(1920,1080); box=[x-183,y-112,x+183,y+50]; panel.paste(frame.crop(box),(col*366,side*188+26))
        draw.text((col*366+6,side*188+5),f"{['LEFT','RIGHT'][side]} | {names[index]} | boot {smp['feet'][side][1]:.2f} m",fill=(229,233,221))
        proof["frames"].append({"side":side,"source":names[index],"sourceDeltaMs":round((times[index]-t)*1000,2),"bounds":box,"foot":smp["feet"][side]})
panel.save(run/"ordinary-boot-contacts.png")
(run/"ordinary-boot-contacts.json").write_text(json.dumps(proof,indent=2))
