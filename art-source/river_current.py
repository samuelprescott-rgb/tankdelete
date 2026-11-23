"""Paint 16 silt cels above 16 looping foam cels in a nearest-filtered atlas."""
from pathlib import Path
from math import sin,cos,exp,pi
from PIL import Image,ImageDraw

N=64
sheet=Image.new('RGBA',(N*8,N*4))
clay=[(98,84,62,82),(119,96,65,120),(144,113,76,158),(170,135,92,180)]
froth=[(76,105,101,105),(137,166,151,166),(178,192,168,202)]
for cel in range(16):
    age=cel/15
    tile=Image.new('RGBA',(N,N))
    # Ink in Water's narrow stem splitting into two rolled, diffusing lobes.
    for y in range(N):
        for x in range(N):
            v=(y+.5)/N
            u=(x+.5)/N-.5
            u+=.035*sin(v*11+age*3)+.021*sin(v*24-u*12+age*2)
            crown=.45-age*.16
            spread=.09+age*.075
            density=0
            for side in [-1,1]:
                dx=(u-side*(.07+.034*age))/spread
                dy=(v-crown-.033*side)/(.135+.06*age)
                ring=dx*dx+dy*dy
                density+=exp(-ring)*(1-.63*exp(-ring*5))
            stem=exp(-(u/(.047+.065*(1-v)))**2-((v-.57)/.24)**2)
            density=(density+.90*stem)*min(1,cel/1.5+.26)*(1-age**1.45)
            density+=.028*sin(x*1.2+y*.44)*sin(y*.31)*min(1,density)
            for k,threshold in reversed(list(enumerate([.10,.25,.47,.71]))):
                if density>threshold:
                    tile.putpixel((x,y),clay[k]);break
    sheet.paste(tile,(cel%8*N,cel//8*N))
    tile=Image.new('RGBA',(N,N))
    d=ImageDraw.Draw(tile)
    phase=cel/16
    # A pair of short counter-rotating streaks shed from a timber post.
    # Sample each broken spiral with a different phase so the water shows through.
    for lobe,(cx,cy,rx,ry,direction) in enumerate([(26,33,16,22,1),(42,44,9,12,-1)]):
        for j,(width,span) in enumerate([(2,.85),(2,.70),(1,.47),(1,.31),(1,.17)]):
            a=2*pi*(phase*direction+j*.213+lobe*.24)
            pts=[]
            for i in range(11):
                t=i/10
                angle=a+direction*(t-.5)*span
                radius=.67+.22*sin(a+j*.8)+.13*t
                pts.append((round(cx+cos(angle)*rx*radius+.12*(cy-30)),
                            round(cy+sin(angle)*ry*radius)))
            d.line(pts,fill=froth[1 if j<3 else 0],width=width)
            if j<2:d.line(pts[3:7],fill=froth[2],width=1)
    sheet.paste(tile,(cel%8*N,(2+cel//8)*N))
sheet.save(Path(__file__).resolve().parents[1]/'public/images/textures/river-current-ink.png')
