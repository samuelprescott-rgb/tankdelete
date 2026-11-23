import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, Quaternion, Vector3 } from 'three';
import { INFANTRY_SURFACE } from './infantryClothFinish';

type Point = [number, number, number];

/** The field kit is a fabric carrier sitting against the back, with a
 * smaller hard case in its opening. Everything merges into the uniform. */
export function createFieldRadioKit(offset: number): BufferGeometry[] {
  const pieces: BufferGeometry[] = [];
  const put = (source: BufferGeometry, pos: Point, tint: string, surface: number) => {
    const result = source.index ? source.toNonIndexed() : source;
    if (result !== source) source.dispose();
    result.translate(pos[0], pos[1] - offset, pos[2]);
    result.deleteAttribute('uv');
    const normals = result.getAttribute('normal');
    const points = result.getAttribute('position');
    const colors = new Float32Array(normals.count * 3);
    const dye = new Color(tint);
    const shade = new Color('#859a9b');
    const light = new Color('#b2a27c');
    const pigment = new Color(), shadow = new Color(), white = new Color('#ffffff');
    for (let i = 0; i < normals.count; i++) {
      const high = Math.max(0, normals.getY(i) * .75 - normals.getX(i) * .23);
      const low = Math.max(0, -normals.getY(i)) * .58 + Math.max(0, -normals.getZ(i)) * .10;
      const seam = Math.max(0, 1 - Math.abs(points.getY(i) + offset - 1.35) * 18);
      pigment.copy(dye).lerp(light, high * .18 + seam * .06)
        .multiply(shadow.copy(shade).lerp(white, 1 - low));
      pigment.toArray(colors, i * 3);
    }
    result.setAttribute('color', new Float32BufferAttribute(colors, 3));
    result.userData.infantryBone = 1;
    result.userData.infantrySurface = surface;
    pieces.push(result);
    return result;
  };
  const box = (pos: Point, size: Point, tint: string, surface: number, tilt = 0) =>
    put(new BoxGeometry(...size).rotateZ(tilt), pos, tint, surface);
  const C = INFANTRY_SURFACE.canvas, H = INFANTRY_SURFACE.hardware;

  const carrierCorners = [[-.057,-.062],[.061,-.062],[.072,-.047],[.071,.051],
    [.056,.065],[-.055,.067],[-.071,.052],[-.069,-.047]];
  const positions: number[] = [], triangles: number[] = [];
  // A waisted collar and small turn at the lower seam keep the broad
  // panels from reading as a rounded air bladder.
  const rows = [[-.186,.87,.76],[-.161,1,1], [.129,1.02,1.01],[.171,.94,.92]];
  for (let row = 0; row < rows.length; row++) {
    const [y, width, depth] = rows[row];
    for (const [x,z] of carrierCorners) positions.push(x * 2 * width, y, z * depth);
    if (row < rows.length - 1) for (let col = 0; col < 8; col++) {
      const a = row * 8 + col, b = row * 8 + (col + 1) % 8;
      triangles.push(a,a + 8,b,b,a + 8,b + 8);
    }
  }
  const top = (rows.length - 1) * 8;
  for (let col = 1; col < 7; col++) triangles.push(0,col,col+1,top,top+col+1,top+col);
  const carrier = new BufferGeometry();
  carrier.setAttribute('position', new Float32BufferAttribute(positions, 3));
  carrier.setIndex(triangles);
  carrier.computeVertexNormals();
  put(carrier, [0,1.176,.168], '#5e6648', C).userData.gearPanel=2;
  // The set's black slab used to occupy the whole rear silhouette. The
  // exposed steel is the receiver head; below it the deeply pleated canvas
  // carrier is compressed by webbing against the set, with its own mouth.
  box([0,1.309,.222], [.251,.049,.163], '#555949', H);
  const jacket=new BufferGeometry(), cloth:number[]=[], web:number[]=[];
  const ridges=[[-.128,-.030],[-.104,.001],[0,.013],[.104,.001],[.128,-.030]];
  for(const [row,[y,z,w]] of [[1.045,.270,.89],[1.072,.302,1],[1.215,.290,.95],[1.265,.306,1],[1.277,.286,.97]].entries()){
    for(const [j,[x,d]] of ridges.entries()){
      const sag=1-(x/.13)**2;
      cloth.push(w*x,y-.014*sag+x*.040,z+d*sag-(Math.abs(x)>.12?.050:0));
      if(row<4&&j<4){const a=row*5+j;web.push(a,a+1,a+5,a+1,a+6,a+5);}
    }
  }
  jacket.setAttribute('position',new Float32BufferAttribute(cloth,3));jacket.setIndex(web);jacket.computeVertexNormals();
  put(jacket,[0,0,0],'#858160',C).userData.gearPanel=2;
  box([0,1.053,.271], [.244,.030,.091], '#677153', C);
  for (const side of [-1,1]) {
    box([side*.144,1.178,.183], [.008,.230,.012], '#787457', C);
    // These returns cross the webbed mouth and are sewn into its two ends.
    box([side*.100,1.179,.297], [.028,.220,.024], '#97896a', C, side * .022);
    box([side*.100,1.249,.309], [.035,.026,.009], '#565941', H);
  }
  box([-.041,1.326,.297], [.059,.020,.042], '#515a47', H);
  const a = new Vector3(.094,1.319,.265), b = new Vector3(.133,1.997,.268);
  const antenna = new CylinderGeometry(.0025,.0043,a.distanceTo(b),5);
  antenna.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0), b.clone().sub(a).normalize()));
  put(antenna, a.clone().lerp(b,.5).toArray(), '#3b4438', H);
  return pieces;
}
