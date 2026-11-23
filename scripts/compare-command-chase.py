"""Two real HUD recordings. Match seconds after the wave overlay clears,
retain the exact camera and full frame, and label rather than paint the shots."""
import json
import subprocess
import sys
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

before, after, output = map(Path, sys.argv[1:4])
times = (2.5, 5.5, 7.3)
w, h = 870, 489
board = Image.new("RGB", (w * 2, 48 + (h + 28) * len(times)), "#192126")
draw = ImageDraw.Draw(board)
font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 21)
evidence = []
for col, (run, name) in enumerate([(before, "Before"), (after, "After")]):
    report = json.loads((run / "player-chase.json").read_text())
    rows = report["samples"]
    assert len(rows) > 20
    # A boss-visible frame can precede mounting the full-screen wave title.
    # The next sample after that gap is the beginning of controllable play.
    epoch = rows[0]["epoch"]
    for prev, row in zip(rows, rows[1:]):
        if row["epoch"] - epoch > 4.8:
            break
        if row["epoch"] - prev["epoch"] > 1.5:
            epoch = row["epoch"]
            break
    # Reconstruct the retained screencast clock from a witnessed frame/pick.
    concat = (run / "chase-frames/frames.txt").read_text().splitlines()
    names = [line[6:-1] for line in concat if line.startswith("file '")]
    durations = [float(line[9:]) for line in concat if line.startswith("duration ")]
    pick = report["picks"][0]
    first = pick["epoch"] + pick["deltaMs"] / 1000 - sum(durations[:names.index(pick["frame"])])
    anchor = epoch - first
    draw.text((w * col + 12, 12), name + " | ordinary wave-four chase", font=font, fill="#e7e4d6")
    for index, sec in enumerate(times):
        rel = anchor + sec
        assert 0 <= rel < report["seconds"]
        cmd = ["ffmpeg", "-loglevel","error","-ss",str(rel),"-i",str(run/"boss-player-chase.mp4"),
               "-frames:v","1","-vcodec","png","-f","image2pipe","pipe:1"]
        with Image.open(BytesIO(subprocess.check_output(cmd))) as frame:
            assert frame.size == (1920,1080)
            y = 48 + index * (h + 28)
            board.paste(frame.resize((w,h),Image.Resampling.LANCZOS),(w*col,y))
        sample = min(rows, key=lambda r: abs(r["epoch"]-(epoch+sec)))
        draw.text((w*col+10,y+h+2),f"+{sec:.1f}s | full player HUD", font=font, fill="#c8ccc2")
        evidence.append({"run":name, "bundle":report["bundle"],"sinceOverlay":sec,"movieTime":rel,"root":sample["root"]})
board.save(output,quality=92)
output.with_suffix(".json").write_text(json.dumps(evidence,indent=2)+"\n")
