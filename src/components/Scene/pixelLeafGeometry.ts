import * as T from 'three';

export function makePixelLeafGeometry() {
  // A stepped willow silhouette, thick enough to catch the site light edge-on.
  const outline = new T.Shape();
  const profile = [[-5,0],[-4,0],[-4,1],[-2,1],[-2,2],[2,2],[2,1],[4,1],[4,0],[5,0],
    [5,-1],[2,-1],[2,-2],[-2,-2],[-2,-1],[-5,-1]];
  profile.forEach(([x,y],i) => i ? outline.lineTo(x,y) : outline.moveTo(x,y));
  outline.closePath();
  const g = new T.ExtrudeGeometry(outline, { depth: .36, bevelEnabled: false }).rotateX(-Math.PI/2);
  const normal = g.getAttribute('normal'), color = [];
  for (let i = 0; i < normal.count; i++) {
    const light = normal.getY(i) > .5 ? 1 : normal.getY(i) < -.5 ? .68 : .46;
    color.push(light, light, light);
  }
  g.setAttribute('color', new T.Float32BufferAttribute(color,3));
  return g;
}
