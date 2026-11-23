import * as THREE from 'three';
import { coordinateNoise } from './environmentGeneration';
import type { RiverCrossing } from './riverLayout';
import { crossingSunFunction } from './crossingSun';
import {surfaceCipherAtlas,cipherGLSL} from './surfaceCipher';
import {bridgeRise,RIVER_WATER_Y} from './riverVerticalSection';

const LENGTH = 512, STRIP = 32, GUTTER = 2, INK_PIXEL = 4;

export interface BridgePiece {
  x:number; y:number; z:number; rotation:number; scaleX:number; scaleY:number; scaleZ:number;
  pitch?:number; kind?:'post'|'rope'|'lashing'|'brace'|'pile'|'carrier'|'headstock'|'wale';
}

/** Component-local visual details only. Keep the swept edge of each piece
 * outside the road width and the first/last metre of both landings open. */
export function crossingShoulders(bridge:RiverCrossing,seed:number):BridgePiece[] {
  const result:BridgePiece[]=[];
  for(const side of [-1,1]){
    const x=bridge.centerX+side*(bridge.width*.5+.25);
    const knots=Array.from({length:4},(_,i)=>{
      const z=bridge.z+(bridge.length*.5-1.24)*(-1+i*2/3);
      // The traffic rail sits on a separate, hewn pile and a transverse
      // headstock. The former thin fencepost ran straight into the water.
      const deck=bridgeRise(z,bridge),top=1.03+.11*coordinateNoise(i,side,seed,2192)+deck,foot=RIVER_WATER_Y-.90;
      result.push({x,y:(top+deck-.32)*.5,z,rotation:0,scaleX:.205,scaleY:top-deck+.32,scaleZ:.241,kind:'post'});
      result.push({x,y:top-.12,z,rotation:0,scaleX:.246,scaleY:.095,scaleZ:.276,kind:'lashing'});
      result.push({x,y:(deck-.23+foot)*.5,z,rotation:0,scaleX:.37,scaleY:deck-.23-foot,scaleZ:.42,kind:'pile'});
      if(side===1)result.push({x:bridge.centerX,y:deck-.305,z,rotation:0,scaleX:bridge.width+.97,scaleY:.265,scaleZ:.365,kind:'headstock'});
      return {z,y:top-.105};
    });
    for(let i=0;i<knots.length-1;i++){
      const a=knots[i],b=knots[i+1],sag=.13+.055*coordinateNoise(i,side,seed,2193);
      // Submerged piles and crossed side braces support the visible raised deck.
      // Set both outer cheeks below the planks and outside the driving surface.
      const low=RIVER_WATER_Y+.08, highA=bridgeRise(a.z,bridge)-.26,highB=bridgeRise(b.z,bridge)-.26;
      for(const [start,end,cheek] of [[low,highB,-.04],[highA,low,.04]]){
        const rise=end-start, span=b.z-a.z;
        result.push({x:x+side*(.045+cheek),y:(start+end)*.5,z:(a.z+b.z)*.5,
          rotation:-Math.PI/2,pitch:Math.atan2(rise,span),scaleX:Math.hypot(rise,span)+.06,
          scaleY:.17,scaleZ:.125,kind:'brace'});
      }
      // Longitudinal carrying timber ties the bents together. The substantial
      // upper wale and open lower course read from the driver seat, with air
      // between them; neither narrows the carriageway.
      const span=b.z-a.z,rise=b.y-a.y,angle=Math.atan2(rise,span);
      for(const [offset,thick,depth,kind] of [[-1.19,.285,.24,'carrier'],[-.25,.14,.145,'wale']] as const)
        result.push({x,y:(a.y+b.y)*.5+offset,z:(a.z+b.z)*.5,rotation:-Math.PI/2,pitch:angle,
          scaleX:Math.hypot(span,rise)+.15,scaleY:thick,scaleZ:depth,kind});
      const y=(t:number)=>a.y+(b.y-a.y)*t-4*sag*t*(1-t);
      for(let j=0;j<3;j++){
        const t=j/3,s=(j+1)/3,dz=(b.z-a.z)/3,dy=y(s)-y(t);
        result.push({x,y:(y(t)+y(s))*.5,z:a.z+(j+.5)*dz,rotation:-Math.PI/2,
          pitch:Math.atan2(dy,dz),scaleX:Math.hypot(dz,dy)+.014,scaleY:.065,scaleZ:.065,kind:'rope'});
      }
    }
  }
  return result;
}

/** One painted strip per plank. The peg locations follow the two underlying stringers. */
export function paintBridgeTimber(ctx: CanvasRenderingContext2D, rows: number, seed: number, pieces:readonly BridgePiece[]=[]) {
  const color = (r: number, g: number, b: number) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  const deck=pieces.filter(p=>!p.kind&&p.scaleZ>3),endpoints=deck.map(p=>p.z);
  const near=Math.min(...endpoints),far=Math.max(...endpoints);
  for (let row = 0; row < rows; row++) {
    const n = (mark: number, ch: number) => coordinateNoise(row, mark, seed, ch + 840);
    const tone = (n(0, 1) - .5) * 33, grey = n(0, 2) * 13;
    const r = 145 + tone - grey * .42, g = 110 + tone * .84 + grey * .28, b = 76 + tone * .66 + grey * .65;
    ctx.save();
    ctx.translate(0, row * STRIP);
    ctx.beginPath(); ctx.rect(0, 0, LENGTH, STRIP); ctx.clip();
    ctx.fillStyle = color(r, g, b); ctx.fillRect(0, 0, LENGTH, STRIP);

    // Broad, tapered flecks follow the timber's long axis. A few marks lift to
    // cooler sapwood; isolated knots interrupt the fibres rather than tiling.
    const knot = n(0, 3) > .48, kx = 100 + n(0, 4) * 310, ky = 8 + n(0, 5) * 16;
    for (let band = 0; band < 15; band++) {
      const x = n(band, 6) * 562 - 100, y = n(band, 7) * 33;
      const len = 46 + n(band, 8) * 272, w = .55 + n(band, 9) ** 2 * 3;
      const lift = (n(band, 10) - .5) * 4;
      const bend = knot ? Math.sign(y - ky) * 4 * Math.exp(-((x + len * .52 - kx) ** 2) / 7000) : 0;
      ctx.fillStyle = band % 3 === 0 ? 'rgba(48,41,36,.22)' : 'rgba(198,183,149,.25)';
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + len * .25, y + lift, x + len * .55, y + lift + bend - w, x + len, y + lift * .35);
      ctx.bezierCurveTo(x + len * .69, y + lift + bend + w, x + len * .24, y + lift + w * .5, x, y);
      ctx.fill();
    }
    if (knot) {
      ctx.save(); ctx.translate(kx, ky); ctx.rotate((n(0, 11) - .5) * .08);
      const rings = [[27, 5.3, -.7, 'rgba(63,45,33,.27)'], [19, 3.6, 0, 'rgba(182,150,111,.60)'],
        [10, 2.35, .3, 'rgba(68,48,36,.63)'], [4.8, 1.2, .1, 'rgba(37,31,28,.54)']] as const;
      for (const [rad, thick, dy, ink] of rings) {
        ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(-rad, dy);
        ctx.bezierCurveTo(-rad * .31, dy-thick, rad * .24, dy-thick*1.5, rad, dy-.35);
        ctx.bezierCurveTo(rad*.32, dy+thick*.6, -rad*.19, dy+thick*1.4, -rad, dy); ctx.fill();
      }
      ctx.restore();
    }

    // Exposed ends split along the grain; cool moisture stains stay mainly
    // near the river-facing edges, below the dry traffic-polished centre.
    for (const side of [0, 1]) {
      ctx.save(); if (side) { ctx.translate(LENGTH, 0); ctx.scale(-1, 1); }
      const damp = ctx.createLinearGradient(0, 0, 39 + n(side, 12) * 45, 0);
      damp.addColorStop(0, 'rgba(45,62,54,.37)'); damp.addColorStop(.62, 'rgba(61,67,55,.12)'); damp.addColorStop(1, 'rgba(61,67,55,0)');
      ctx.fillStyle = damp; ctx.fillRect(0, 0, 90, STRIP);
      const y = 6 + n(side, 13)*19, l = 12 + n(side, 14)**2*57;
      ctx.fillStyle = 'rgba(43,37,32,.65)'; ctx.beginPath(); ctx.moveTo(0, y-1.25);
      ctx.lineTo(l*.37, y-.55); ctx.lineTo(l*.6, y+.65); ctx.lineTo(l,y-.25);
      ctx.lineTo(l*.63, y+1.35); ctx.lineTo(0,y+1.15); ctx.fill();
      const nx = LENGTH * .30 / (deck[0]?.scaleZ??4.7) + (n(side, 15)-.5)*2.8, ny = 11 + n(side, 16)*10;
      ctx.fillStyle = 'rgba(51,42,34,.48)'; ctx.beginPath(); ctx.ellipse(nx,ny,2.6,1.75,.12,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#5a5650'; ctx.fillRect(nx-1.3,ny-.9,2.4,1.6);
      ctx.fillStyle = 'rgba(184,177,146,.60)'; ctx.fillRect(nx-1.15,ny-.9,1.45,.62);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(48,42,36,.40)'; ctx.fillRect(0, STRIP-GUTTER-1.1,LENGTH,GUTTER+1.1);
    ctx.fillStyle = 'rgba(200,185,153,.37)'; ctx.fillRect(0, GUTTER,LENGTH,.8);
    // Only the exposed ends are wet. Interrupt the light lips with stepped,
    // long sapwood clusters instead of outlining every plank/seam in white.
    for (const side of [0, 1]) {
      ctx.save(); if (side) { ctx.translate(LENGTH, 0); ctx.scale(-1, 1); }
      const grid = (value: number) => INK_PIXEL * Math.floor(value / INK_PIXEL);
      ctx.fillStyle = 'rgba(36,65,58,.65)';
      ctx.fillRect(0, 4, grid(8 + n(side, 21) * 29), 8);
      ctx.fillRect(0, 12, grid(6 + n(side, 22) * 17), 12);
      const x = grid(9 + n(side, 23) * 94);
      ctx.fillStyle = 'rgba(224,172,108,.76)';
      ctx.fillRect(x, 4, grid(13 + n(side, 24) * 48), INK_PIXEL);
      ctx.fillStyle = '#4e463b'; ctx.fillRect(36, 12, 8, 8);
      ctx.fillStyle = '#9e9072'; ctx.fillRect(36, 12, INK_PIXEL, INK_PIXEL);
      ctx.restore();
    }
    const board=pieces[row];
    if(board&&!board.kind&&board.scaleZ>3){
      // Wet silt carried off the approach becomes rubbed pale sapwood on the
      // crown. These are worn patches across the actual individual boards, not
      // black stripes painted over a completed render.
      const approach=1-THREE.MathUtils.smoothstep(Math.min(board.z-near,far-board.z),.18,4.6);
      for(const side of [-1,1]){
        const mid=LENGTH*(.5+side*(.76+.052*Math.sin(board.z*.79)) / board.scaleZ);
        const w=LENGTH*(.19+.075*n(side,26))/board.scaleZ;
        const smear=ctx.createLinearGradient(mid-w,0,mid+w,0);
        smear.addColorStop(0,'rgba(60,47,36,0)');smear.addColorStop(.30,`rgba(55,43,34,${.12+.32*approach})`);
        smear.addColorStop(.62,`rgba(74,57,42,${.16+.33*approach})`);smear.addColorStop(1,'rgba(106,82,58,0)');
        ctx.fillStyle=smear;ctx.fillRect(mid-w,0,2*w,STRIP);
        ctx.fillStyle=approach>.5?'rgba(160,139,105,.29)':'rgba(202,176,125,.35)';
        ctx.fillRect(mid-w*.6,5+13*n(side,27),w*(.54+.51*n(side,28)),2.6);
      }
    }
    ctx.restore();
  }
}

export function createBridgeTimber(seed: number, pieces: BridgePiece[], daylight=true) {
  const count = pieces.length;
  const rows = THREE.MathUtils.ceilPowerOfTwo(Math.max(1, count));
  const canvas = document.createElement('canvas');
  canvas.width = LENGTH / INK_PIXEL; canvas.height = rows * STRIP / INK_PIXEL;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(1 / INK_PIXEL, 1 / INK_PIXEL);
  paintBridgeTimber(ctx, rows, seed, pieces);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  map.magFilter = THREE.NearestFilter; // native pixel close-up, mip-filtered on the approach
  const material = new THREE.MeshStandardMaterial({ map, roughness: .96, metalness: 0 });
  material.name = 'Ghost Signal • sun-worn pixel timber';
  material.onBeforeCompile = shader => {
    shader.uniforms.surfaceCipherMap={value:surfaceCipherAtlas()};
    shader.vertexShader = 'varying vec2 timberXZ;\nattribute float timberRow;\nattribute float timberKind;\nvarying float vTimberKind; varying vec2 timberInkUv;\n' + shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      timberXZ=(modelMatrix*instanceMatrix*vec4(position,1.)).xz;
      vTimberKind=timberKind;
      vec3 grainWorld=(modelMatrix*instanceMatrix*vec4(position,1.)).xyz;
      // Tilt the register across the board, as if worn into its grain.
      timberInkUv=vec2(grainWorld.z+.28*grainWorld.x,grainWorld.x-.28*grainWorld.z+.77*grainWorld.y)*vec2(23.,20.)+vec2(abs(timberRow)*3.7,abs(timberRow)*1.31);
      vec2 plankUv = timberRow < 0.0 ? position.xz + 0.5 : position.zx + 0.5;
      if (abs(normal.y) < 0.5) plankUv.y = (position.y + 0.5) * 0.12;
      if (timberKind > .5 && timberKind < 1.5) plankUv=vec2(position.y+.5, abs(normal.x)>.5 ? position.z+.5 : position.x+.5);
      vMapUv = vec2(plankUv.x, 1.0 - ((abs(timberRow) - 1.0) * ${STRIP}.0 + ${GUTTER}.0 + plankUv.y * ${STRIP - 2*GUTTER}.0) / ${rows * STRIP}.0);`);
    shader.fragmentShader='varying float vTimberKind; varying vec2 timberXZ; varying vec2 timberInkUv;\n'+cipherGLSL+crossingSunFunction+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      ${daylight?`float pool=signalCrossingSun(timberXZ);
      diffuseColor.rgb*=mix(vec3(.66,.73,.78),vec3(1.80,1.42,.92),pool);`:''}
      if (vTimberKind>3.5) diffuseColor.rgb=mix(diffuseColor.rgb*vec3(.45,.54,.65),vec3(.039,.036,.028),.22);
      else if (vTimberKind>2.5) diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.14,.099,.052),.69);
      else if (vTimberKind>1.5) diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.52,.383,.201),.85);
      else if (vTimberKind>.5) diffuseColor.rgb*=vec3(.62,.57,.51);
      else diffuseColor.rgb+=cipherPigment(timberInkUv)*(.135*diffuseColor.rgb+vec3(.013,.009,.006));`);
  };
  material.customProgramCacheKey = () => `RiverTimber-GhostShoulder-5-${rows}-${daylight}`;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  // Negative row selects the longitudinal axis of the two stringers.
  geometry.setAttribute('timberRow', new THREE.InstancedBufferAttribute(
    Float32Array.from({ length: count }, (_, i) => (i >= count-2 || ['brace','carrier','headstock','wale'].includes(pieces[i].kind??'') ? -1 : 1)*(i+1)), 1));
  geometry.setAttribute('timberKind',new THREE.InstancedBufferAttribute(Float32Array.from(pieces,
    p=>p.kind==='post'||p.kind==='pile'?1:p.kind==='rope'?2:p.kind==='lashing'?3:p.kind==='brace'||p.kind==='carrier'?4:0),1));
  return { plank: geometry, bridgeMaterial: material, bridgeMap: map };
}
