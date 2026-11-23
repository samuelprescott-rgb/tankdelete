"""Pair actual capture PNGs without changing their composition, exposure, or color."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root=Path(sys.argv[1])
font=ImageFont.load_default(size=20)
def sheet(filename,items):
    w,h=768,432
    dst=Image.new('RGB',(w*2,48+len(items)*(h+34)), '#11191d')
    draw=ImageDraw.Draw(dst)
    for col,category in enumerate(['before','after']):
        draw.text((col*w+12,12),category.upper(),fill='#e0e8e1',font=font)
        for row,(key,title) in enumerate(items):
            y=48+row*(h+34)
            with Image.open(root/category/(key+'.png')) as im:
                assert im.size==(1920,1080),im.size
                dst.paste(im.convert('RGB').resize((w,h),Image.Resampling.LANCZOS),(w*col,y))
            draw.text((col*w+12,y+h+3),title,fill='#c9d4c6',font=font)
    dst.save(root/(filename+'.jpg'),quality=91)
sheet('tank-comparison',[('tank-nose-paint','Bow · shark eyes and teeth'),('tank-turret','Turret · paint, wear, stowage')])
sheet('huey-comparison',[('huey-flight','Huey · flyover'),('huey-door','Troop compartment · side'),('huey-wreck','Same airframe · crashed')])
