"""Pack a repeating cloud deck (R/G) and the umber-karst panorama skyline (B)."""
from pathlib import Path
import numpy as np
from PIL import Image

size = 384
z, x = np.mgrid[:size, :size]
rng = np.random.default_rng(1968)
def noise(cells):
    grid = rng.random((cells,cells)) - .5
    px, pz = x*cells/size, z*cells/size
    ix, iz = px.astype(int), pz.astype(int)
    u, v = px-ix, pz-iz
    u, v = u*u*(3-2*u), v*v*(3-2*v)
    return ((1-u)*grid[iz,ix]+u*grid[iz,(ix+1)%cells])*(1-v) + ((1-u)*grid[(iz+1)%cells,ix]+u*grid[(iz+1)%cells,(ix+1)%cells])*v

# Domain warp breaks the straight projected edges into little scallops.
xx=x + noise(19)*12 + noise(49)*4
zz=z + noise(15)*10 + noise(53)*4
grain=noise(29)*.22 + noise(71)*.085
bank = np.zeros_like(x, dtype=float)
rim = bank.copy()
for row in range(4):
    for col in range(4):
        cx, cz = (col + rng.random()) * size / 4, (row + rng.random()) * size / 4
        run, depth = rng.uniform(29, 62), rng.uniform(12, 32)
        # Overlapping puffs with an uneven shoulder, after PixelFX Clouds.
        for part in range(6):
            u = part / 5 - .5
            px, pz = cx + u * run, cz + u * run * .31 + rng.uniform(-5, 5)
            rx, rz = rng.uniform(13, 28), depth * (1 - .78 * abs(u))
            dx = ((xx - px + size / 2) % size - size / 2) / rx
            dz = ((zz - pz + size / 2) % size - size / 2) / rz
            dome = 1 - dx**2 - dz**2
            rim = np.where(dome > bank, np.clip(.48 - .20*dx - .33*dz + grain, 0, 1),rim)
            bank = np.maximum(bank, dome)
# Trace the highest painted ridge in the 1024 x 352 review projection.
ridge = [(0,246),(18,246),(48,250),(85,269),(120,266),(157,270),(210,279),(253,279),(294,260),(318,244),(360,239),(368,179),(383,172),(397,231),(405,173),(414,191),(427,248),(443,210),(452,222),(470,265),(494,258),(523,279),(552,264),(573,269),(589,249),(605,269),(624,250),(646,278),(684,278),(714,293),(737,272),(751,255),(758,255),(767,272),(792,252),(807,267),(831,280),(858,282),(882,268),(907,284),(927,261),(948,225),(959,229),(980,261),(991,245),(1003,164),(1009,163),(1018,240),(1024,246)]
height = 1 - np.interp((x[0]+.5)*1024/size, *zip(*ridge))/352
height = np.maximum.reduce([np.roll(height,k) for k in (-1,0,1)])
rgba = np.stack((np.round(np.sqrt(bank)*7)/7, np.round(rim*4)/4, np.broadcast_to(height,bank.shape)),axis=-1)
Image.fromarray(np.uint8(np.clip(rgba*255,0,255))).save(Path(__file__).resolve().parents[1]/'public/images/textures/crossing-cloud-deck.png')
