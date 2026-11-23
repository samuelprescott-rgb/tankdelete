"""Bake looping pixel volumes. Each row of the atlas contains all depth slices of one cel."""
from pathlib import Path
import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / 'public/images/textures'
FRAMES = 24
TAU = 2 * np.pi
# Opacity is per depth slice. Overlapping thin amber cells build up to a luminous root.
PALETTE = [(0,0,0,0),(99,34,21,54),(170,45,17,100),(221,65,15,146),
           (250,103,22,172),(255,157,39,205),(255,197,68,232),(255,225,120,251),
           (255,241,177,255),(48,46,53,16),(57,54,61,35),(67,62,65,42),
           (85,68,66,40),(112,77,63,45),(172,92,49,65)]

def waves(x,y,z,t):
    return (np.sin(9*x + 7*z + 17*y - 2*t + 1.4*np.sin(5*z+8*y-t))
            + .48*np.sin(18*z - 7*x + 31*y - 3*t)
            + .28*np.cos(25*x+17*z+39*y-4*t)) / 1.76

def fire(x,y,z,t):
    gust = waves(x,y,z,t)
    density = np.zeros_like(x) - 1
    # Each root feeds a separate tongue. Its tip leans, narrows, then tears
    # away on a different beat from its neighbours.
    roots = [(-.64,-.03,.39,.23),(-.38,.12,.7,.26),(-.06,-.16,.89,.30),
             (.22,.07,.57,.23),(.56,-.12,.67,.22),(.75,.1,.33,.15),(0,.34,.39,.18)]
    for i,(cx,cz,top,r) in enumerate(roots):
        length = top*(.83+.15*np.sin(t*2+i*2.1)+.075*np.cos(3*t-i))
        h = y/length
        dx = x-cx-(.055+.115*h)*np.sin(9*y-2*t+i)+.065*h*h
        dz = z-cz-(.035+.09*h)*np.cos(10*y-2*t+i)
        radius=r*(1-.82*h)+.044*np.sin(19*y-3*t+i)
        radial=np.sqrt(dx*dx+(.79*dz)**2)
        d=(radius-radial)/r+.28*gust-.12*h
        density=np.maximum(density,np.minimum(d, (1-h)*2.6))
    base=1-(x/.88)**2-(z/.54)**2-((y-.10)/.12)**2
    base-=.36*(.5+.5*np.sin(18*x+4*z))**2
    density=np.maximum(density,base+.19*gust)
    heat=np.clip(np.floor(2.5+5.1*density+1.25*(1-y)-1.45*y+.53*gust),1,8)
    foot=.043+.026*np.sin(x*9+z*6)+.022*np.cos(19*x-8*z)+.012*np.sin(t-13*x)
    density=np.minimum(density, (y-foot)*18)
    # Narrow breaks travel up the free edges and detach a few hot tips.
    shear=np.sin(24*y-3*t+6*x+2*np.sin(5*z-13*y))
    density-=.38*np.maximum(0,shear-.45)*np.clip(2*y,0,1)
    return np.where(density>.015,heat,0)

def jet(x,y,z,t):
    # Feed runs along Y (the nozzle axis in game). The rapid longitudinal
    # breaks are carried downstream while the nozzle stays alight.
    span=.085+.57*y
    dx=(x-.18*y*np.sin(12*y-2*t))/span
    dz=(z-.14*y*np.cos(15*y-2*t))/span
    radial=np.sqrt(dx*dx+dz*dz)
    gust=waves(dx*.22,y*1.7,dz*.22,t)
    d=1-radial+.38*gust+.13*np.sin(38*y-4*t)-.12*y
    d=np.minimum(d,(1-y)*4.8-.17+.32*gust)
    d-=np.maximum(0,np.sin(28*y-4*t+2.7*dx+1.6*dz)-.30)*.74*y
    heat=np.floor(2.4+5.8*d+1.45*(1-y)-1.75*y)
    return np.where(d>.015,np.clip(heat,1,8),0)

def smoke(x,y,z,t):
    density=np.zeros_like(x)
    for i in range(8):
        life=(t/TAU+i/8)%1
        cx=.02+.49*life+.14*np.sin(life*8+i)
        cz=.17*np.sin(i*1.9+life*4)
        r=.22+.32*life
        dy=(y-(.015+.92*life))/(r*.48)
        mass=1-((x-cx)/r)**2-((z-cz)/r)**2-dy*dy
        density=np.maximum(density,mass*np.sin(np.pi*life)**.6)
    d=density+.26*waves(x,y,z,t)
    return np.where((d>.19)&(density>.04),np.clip(9+np.floor((d-.16)*3.5)+2*(y<.22),9,14),0)

def sparks(ink,x,y,z,t,beam):
    # Detached, short-lived flecks travel in the same volume as the flame.
    for i in range(12):
        life=(t/TAU+i*.618034)%1
        if not .06<life<.91: continue
        r=.8 if not beam else .55*life+.06
        cx=r*np.sin(i*8.2)+.08*np.sin(9*life+i)
        cz=r*.65*np.cos(i*3.1)+.07*np.cos(7*life+i)
        cy=.16+.81*life if not beam else life
        # Snap tiny embers to individual cells so they stay slim in every view.
        nz,ny,nx=ink.shape
        ix=int((cx+1)*nx/2); iz=int((cz+1)*nz/2); iy=int(cy*ny)
        if 0<=ix<nx and 0<=iz<nz and 0<iy<ny:
            ink[iz,iy,ix]=6 if life<.49 else 3
            if i%3==0: ink[iz,iy-1,ix]=2

def bake(name, dims, painter):
    nx,ny,nz=dims
    zz,yy,xx=np.indices((nz,ny,nx),dtype=np.float32)
    x=2*(xx+.5)/nx-1; y=(yy+.5)/ny; z=2*(zz+.5)/nz-1
    sheet=np.zeros((FRAMES*ny,nx*nz),np.uint8)
    for frame in range(FRAMES):
        t=TAU*frame/FRAMES
        ink=painter(x,y,z,t).astype(np.uint8)
        if name!='smoke': sparks(ink,x,y,z,t,name=='jet')
        sheet[frame*ny:(frame+1)*ny]=ink[:,::-1,:].transpose(1,0,2).reshape(ny,nz*nx)
    art=Image.frombytes('P',(nx*nz,ny*FRAMES),sheet.tobytes())
    art.putpalette([v for entry in PALETTE for v in entry[:3]])
    art.save(OUT/f'field-fire-{name}.png',transparency=bytes(e[3] for e in PALETTE),optimize=True)

if __name__=='__main__':
    bake('flame',(44,56,24),fire)
    bake('jet',(24,80,24),jet)
    bake('smoke',(32,36,20),smoke)
