"""Bake the looping embassy/Dispatch flame sheet. Requires numpy and Pillow."""
from pathlib import Path

import numpy as np
from PIL import Image

W, H, FRAMES, COLS = 80, 96, 32, 8
TAU = 2 * np.pi
row, col = np.indices((H, W))
x = (col + .5) / W * 2.5 - 1.25
y = 1 - (row + .5) / H
rng = np.random.default_rng(702)
grain = rng.random((64, 64))
# Thin, backlit orange gas through to the hot straw-coloured core.
ramp = np.array([[179, 63, 28], [237, 85, 24], [255, 124, 28],
                 [255, 169, 48], [255, 208, 80], [255, 234, 135], [255, 246, 185]])


def flow(u, v, period):
    """Smooth noise that repeats vertically after a whole loop of travel."""
    ix, iy = np.floor(u).astype(int), np.floor(v).astype(int)
    fx, fy = u-ix, v-iy
    fx, fy = fx*fx*(3-2*fx), fy*fy*(3-2*fy)
    a = grain[iy % period, ix % 64]*(1-fx) + grain[iy % period, (ix+1) % 64]*fx
    b = grain[(iy+1) % period, ix % 64]*(1-fx) + grain[(iy+1) % period, (ix+1) % 64]*fx
    return (a*(1-fy) + b*fy)*2-1


def frame(t):
    # Both scales travel upward. The larger eddies stretch and split narrow
    # streams of fuel while the foot of each stream stays on its own timber.
    lift = y*6-4*t
    lean = .17*y + (.04+.23*y)*flow(2.1*x+8, lift, 4)
    u = x-lean
    eddy = flow(u*4+14, lift+.7*flow(2*x+3, lift, 4), 4)
    ripple = flow(11*u+2.2*eddy, y*13-8*t, 8)
    gas = np.full_like(x,-2.)
    for lane, (root, height, width) in enumerate([
            (-.75,.35,.20), (-.45,.63,.24), (-.16,.91,.31),
            (.12,.78,.27), (.43,.64,.23), (.74,.38,.17)]):
        pulse = .84 + .16*np.sin(TAU*t+1.8*lane) + .06*np.sin(2*TAU*t+.8*lane)
        h = y/(height*pulse)
        bend = .12*h*np.sin(8*y-TAU*t+lane) + .19*h*eddy
        across = (u-root*(1-.48*y)-bend) / (width*np.maximum(.20, 1-.62*h))
        strength = 1.05-.95*h-.57*across**2
        gas = np.maximum(gas,strength)

    heat = gas + .23*eddy + .15*ripple + .06*flow(u*21, y*24-12*t, 12)
    # The upper edge breaks into slivers; a bright tongue can briefly reach
    # into the smoke. No outline is drawn around a tongue or an air pocket.
    bed = np.clip(1-(x/.96)**4,0,1)*np.exp(-((y-.065)/.10)**2)
    heat = np.maximum(heat,bed*(.73+.19*eddy))
    envelope = np.clip((1.13-np.abs(x))/.18,0,1)*np.clip((.99-y)/.15,0,1)
    opacity = np.clip((heat-.095)/.64,0,1)**.87 * envelope
    opacity *= np.clip((y-.012-.009*np.sin(x*17))/.045,0,1)
    level = np.clip((heat-.11)/.95,0,1)
    # Small value steps keep the pixel-art character without drawing bands
    # at the boundary of every fold.
    level = np.round(level*23)/23
    rgb = np.stack([np.interp(level, np.linspace(0,1,len(ramp)), channel)
                    for channel in ramp.T],axis=-1)
    for i in range(6):
        life = (t+i*.169)%1
        ex = -.73+.28*i + .18*life+.055*np.sin(TAU*life+i)
        ey = .20+.68*life
        spark = (abs(x-ex)/.014 + abs(y-ey)/.017 < 1) & (opacity<.12)
        opacity[spark] = .75*np.sin(np.pi*life)
        rgb[spark] = (255,181,75)
    alpha = np.rint(opacity*31)/31
    rgb[alpha==0] = 0
    return np.dstack((rgb,alpha*255)).round().astype(np.uint8)


if __name__ == '__main__':
    sheet = Image.new('RGBA',(COLS*W,FRAMES//COLS*H))
    for n in range(FRAMES):
        sheet.paste(Image.fromarray(frame(n/FRAMES)),((n%COLS)*W,(n//COLS)*H))
    output = Path(__file__).resolve().parents[1]/'public/images/textures/embassy-burning-fuel.png'
    sheet.save(output,optimize=True)
