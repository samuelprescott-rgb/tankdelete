import { memo, useRef, useMemo, useEffect, useLayoutEffect, useState, createRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { ProximityFileLabels } from './ProximityFileLabels';
import { createArmedFileInk, registerArmedFileInk, type ArmedFileInk } from './armedFileInk';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BlockData } from '../../hooks/useFileBlocks';
import { FileCategory } from '../../lib/colors';
import { formatBytes } from '../../lib/format';
import { villageStructureVariant, villageHutYaw } from '../../lib/layout';
import { HUT_PROFILES } from '../../lib/villageCover';
import { inGhostRiverHutPlot } from '../../lib/ghostSignal';
import { SECTOR_FILE_CAPACITY } from '../../lib/sectorPaging';
import {HutReleaseRing} from './HutReleaseRing';
import { HUT_BREAK_SECONDS, ghostHutAttribute, ghostHutShader, type GhostScar, type GhostSkin } from './ghostHutSurface';
import { applyHutSurfaceUV, configureVillageAtlas, VILLAGE_MATERIAL_ATLAS, type HutSurface } from '../../lib/hutMaterials';

const STRUCTURE_ACCENTS: Record<FileCategory, string> = {
  media: '#b7a45e',
  code: '#75906c',
  archive: '#9a633f',
  other: '#8a7b51',
};

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const MAX_SHADOWED_BLOCKS_PER_CATEGORY = 160;

function pathNoise(path: string, salt: number) {
  let hash = 2166136261 ^ salt;
  for (let index = 0; index < path.length; index += 1) {
    hash ^= path.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967295;
}

function blockYaw(block: BlockData) {
  return villageHutYaw(block.path, block.position[0], block.position[2]);
}

function colorGeometry(geometry: THREE.BufferGeometry, color: string, surface: HutSurface) {
  const value = new THREE.Color(color);
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index += 1) {
    const facingUp = Math.max(0, normals.getY(index));
    const facingShade = Math.max(0, -normals.getX(index));
    const y = positions.getY(index);
    const height = THREE.MathUtils.smoothstep(y, -0.30, 0.49);
    const porchDamp = (1 - height) * (surface === 'timber' ? .21 : .09);
    const rim = surface === 'thatch' ? facingUp * .24 : facingUp * .17;
    const x=positions.getX(index), z=positions.getZ(index);
    // Baked thatch clumps break the long page-like horizontal courses into
    // sheaves. Straw tips are broad ochre marks; troughs read cool at range.
    const bundle=Math.cos(14*z + Math.floor(Math.abs(x)*7)*1.71)+.53*Math.sin(6.5*z-3*x+1.2);
    const reed=surface==='thatch'?(bundle>.45?.075:bundle<-.54?-.065:-.006):0;
    const shade = .85 + height * .16 + rim - facingShade * .12 - porchDamp+reed;
    colors[index * 3] = value.r * shade * (1 + facingUp * 0.08 - facingShade * 0.06);
    colors[index * 3 + 1] = value.g * shade;
    colors[index * 3 + 2] = value.b * shade * (1 - facingUp * 0.07 + facingShade * 0.12);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function createStructureGeometry(category: FileCategory, variant = 0) {
  const parts: THREE.BufferGeometry[] = [];
  const addPart = (
    geometry: THREE.BufferGeometry,
    color: string,
    position: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
    surface: HutSurface = 'timber',
    wallSiding = false,
  ) => {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
    matrix.compose(new THREE.Vector3(...position), quaternion, new THREE.Vector3(...scale));
    geometry.applyMatrix4(matrix);
    // Only broad wall panels become courses. Shutters, gable, posts, thatch,
    // interior backer and porch keep their existing treatment.
    const siding=new Uint8Array(geometry.getAttribute('position').count);
    if(wallSiding) siding.fill(1);
    geometry.setAttribute('ghostPlank',new THREE.BufferAttribute(siding,1));
    parts.push(colorGeometry(applyHutSurfaceUV(geometry, surface), color, surface));
  };

  const wood = '#a89b87';
  const darkWood = '#675f54';
  const bamboo = '#c2b9a7';
  // The leaf atlas already holds the warm pigment. A second ochre multiply
  // used to turn both the shaded and sunlit faces into orange timber.
  const thatch = '#cabfb0';
  const dryThatch = '#d5ccbf';
  const earth = '#82694d';
  const accent = STRUCTURE_ACCENTS[category];

  const addThatchedRoof = (width: number, depth: number, eaveY: number, rise: number) => {
    const halfSpan = width * 0.5 + 0.25;
    const roofDepth = depth + 0.56;
    const slopeLength = Math.hypot(halfSpan, rise);
    const slopeAngle = Math.atan2(rise, halfSpan);

    [-1, 1].forEach((side) => {
      addPart(
        new THREE.BoxGeometry(slopeLength, 0.035, roofDepth - .09),
        '#635a44',
        [side * halfSpan * 0.5, eaveY + rise * 0.5, 0],
        [0, 0, side < 0 ? slopeAngle : -slopeAngle],
      );
      if (variant === 1) {
        // Real corrugation in a few cheap segmented sheets. The repair roof is
        // lower-pitched and weathered, not a featureless silver pyramid.
        const segments = 42;
        const vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
        for (let i = 0; i <= segments; i++) {
          const z = (i / segments - 0.5) * roofDepth;
          const rib = Math.cos(i * Math.PI) * 0.014;
          for (const t of [0, 1.025]) {
            vertices.push(side * halfSpan * t, eaveY + rise * (1 - t) + 0.046 + rib, z);
            uvs.push(i / segments, t / 1.025);
          }
          if (i < segments) {
            const j = i * 2;
            indices.push(...(side > 0 ? [j, j + 2, j + 1, j + 1, j + 2, j + 3]
              : [j, j + 1, j + 2, j + 1, j + 3, j + 2]));
          }
        }
        const sheet = new THREE.BufferGeometry();
        sheet.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        sheet.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        sheet.setIndex(indices); sheet.computeVertexNormals();
        addPart(sheet, '#b6b7ae', [0, 0, 0], [0, 0, 0], [1, 1, 1], 'metal');
      } else {
      // Each course is one shaped piece with a curled-over eave and a dark
      // cut edge. Descending course heights give the overlaps actual relief.
      for (let layer = 0; layer < 3; layer += 1) {
        const positions: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        const segments = 12;
        const courseWidth = 5;
        for (let segment = 0; segment <= segments; segment += 1) {
          const travel = segment / segments;
          const z = (travel - .5) * roofDepth;
          const settling = .050 * Math.sin(travel * Math.PI) ** 2;
          const tuft = Math.sin(segment * 1.55 + layer * 2.67 + side) * .031;
          const outer = (layer + 1) / 3 + .014 + tuft;
          const inner = Math.max(0, layer / 3 - .031);
          const row = [
            [inner, -.011], [THREE.MathUtils.lerp(inner, outer, .55), .005],
            [outer - .022, .006 + tuft * .34], [outer, -.001 + tuft * .42],
            [outer - .007, -.025 + tuft * .18],
          ];
          for (let j = 0; j < row.length; j++) {
            const [t, relief] = row[j];
            const y = eaveY + rise * (1 - t) + .067 + (2 - layer) * .011 - settling * (.5+.5*t) + relief;
            // The bound sheets turn and split at the verge; the dark structural
            // timber below should not be the silhouette of the entire roof.
            const verge=Math.abs(travel-.5)**3*8;
            const curl=verge*.021*Math.sin(t*18+layer+side);
            positions.push(side * halfSpan * t, y-.014*verge*t, z+curl);
            // Keep the nipa fibres falling DOWN the entire roof; stamping a
            // full upright texture onto each tiny course squashes it flat.
            uvs.push(travel, 1-THREE.MathUtils.clamp(t,0,1));
          }
          if (segment < segments) for (let j = 0; j < courseWidth - 1; j++) {
            const i = segment * courseWidth + j, next = i + courseWidth;
            if (side > 0) indices.push(i, next, i + 1, i + 1, next, next + 1);
            else indices.push(i, i + 1, next, i + 1, next + 1, next);
          }
        }
        const bundle = new THREE.BufferGeometry();
        bundle.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        bundle.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        bundle.setIndex(indices);
        bundle.computeVertexNormals();
        addPart(bundle, layer % 2 === 0 ? dryThatch : thatch, [0, 0, 0], [0, 0, 0], [1, 1, 1], 'thatch');
      }
      // A sparse skirt of split reed bundles gives the eaves a toothy,
      // uneven silhouette instead of four perfectly machined roof strips.
      // Independent triangles stay inside the established roof footprint.
      const fringe:number[]=[], tex:number[]=[], tris:number[]=[];
      for(let j=0;j<12;j++){
        const zz=(j-5.5)*roofDepth/12, half=roofDepth/12*(.31+.10*Math.cos(j*3+side));
        const xx=side*halfSpan, yy=eaveY+.061, tip=.045+.039*(1+Math.sin(j*1.72+side));
        fringe.push(xx*.97,yy+.027,zz-half,xx*1.009,yy-tip,zz+half*.2,xx*.97,yy+.027,zz+half);
        tex.push(0,.45,.4,1,1,.45); const o=j*3;
        tris.push(...(side>0?[o,o+2,o+1]:[o,o+1,o+2]));
      }
      const fringeMesh=new THREE.BufferGeometry(); fringeMesh.setAttribute('position',new THREE.Float32BufferAttribute(fringe,3));
      fringeMesh.setAttribute('uv',new THREE.Float32BufferAttribute(tex,2));fringeMesh.setIndex(tris);fringeMesh.computeVertexNormals();
      addPart(fringeMesh,'#b5aca0',[0,0,0],[0,0,0],[1,1,1],'thatch');
      // Short torn clusters run down each verge. A long, flat brown bar
      // previously outlined the gables like moulded trim at playing distance.
      const vergePos:number[]=[],vergeUV:number[]=[],vergeIndex:number[]=[];
      for(const end of [-1,1])for(let i=0;i<10;i++){
        const a=i/10,b=(i+.94)/10,y=(t:number)=>eaveY+rise*(1-t)+.064;
        const zz=end*roofDepth*.5,k=vergePos.length/3,dy=.042+.037*Math.sin(i*2+end)**2;
        vergePos.push(side*halfSpan*a,y(a),zz,side*halfSpan*b,y(b),zz,
          side*halfSpan*(b-.021),y(b)-dy,zz+end*.028);
        vergeUV.push(.22,.82,.31,.80,.30,.65);
        vergeIndex.push(...(end*side>0?[k,k+2,k+1]:[k,k+1,k+2]));
      }
      const verge=new THREE.BufferGeometry();
      verge.setAttribute('position',new THREE.Float32BufferAttribute(vergePos,3));verge.setAttribute('uv',new THREE.Float32BufferAttribute(vergeUV,2));
      verge.setIndex(vergeIndex);verge.computeVertexNormals();addPart(verge,'#a7a296',[0,0,0],[0,0,0],[1,1,1],'thatch');
      }

      [-1, 1].forEach(end => {
        addPart(new THREE.CylinderGeometry(0.019, 0.024, slopeLength, 5), darkWood,
          [side * halfSpan * 0.5, eaveY + rise * 0.5 - 0.055, end * (roofDepth * 0.5 - 0.055)],
          [0, 0, side < 0 ? slopeAngle - Math.PI / 2 : -slopeAngle - Math.PI / 2]);
      });
    });

    addPart(
      new THREE.CylinderGeometry(0.07, 0.085, roofDepth + 0.06, 6),
      '#9d9586',
      [0, eaveY + rise + 0.085, 0],
      [Math.PI / 2, 0, 0],
      [1, 1, 1], 'thatch',
    );

    [-0.33, 0, 0.33].forEach(z => addPart(
      new THREE.CylinderGeometry(0.087, 0.087, 0.018, 6), darkWood,
      [0, eaveY + rise + 0.085, z * roofDepth], [Math.PI / 2, 0, 0],
    ));

    // Closed woven gable ends sit below the overhang, with actual roof shadow.
    [-1, 1].forEach(end => {
      const gable = new THREE.BufferGeometry();
      gable.setAttribute('position', new THREE.Float32BufferAttribute([
        -width * 0.5, eaveY - 0.02, end * depth * 0.5,
        width * 0.5, eaveY - 0.02, end * depth * 0.5,
        0, eaveY + rise - 0.06, end * depth * 0.5,
      ], 3));
      gable.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
      gable.setIndex(end > 0 ? [0, 1, 2] : [0, 2, 1]);
      gable.computeVertexNormals();
      addPart(gable, '#989383', [0, 0, 0], [0, 0, 0], [1, 1, 1], 'bamboo');
    });
  };

  const addStiltHut = (width: number, depth: number, wallHeight: number, roofRise: number) => {
    wallHeight *= 1.16;
    const wallBase = -0.08;
    const wallCenter = wallBase + wallHeight * 0.5;
    const eaveY = wallBase + wallHeight + 0.08;

    addPart(new THREE.BoxGeometry(width + 0.18, 0.12, depth + 0.22), darkWood, [0, wallBase - 0.09, 0]);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([xSide, zSide]) => {
      addPart(
        new THREE.CylinderGeometry(0.045, 0.065, 0.54, 6),
        darkWood,
        [xSide * width * 0.4, wallBase - 0.34, zSide * depth * 0.38],
      );
    });
    // A narrow slatted porch, posts and diagonal supports give the stilt floor
    // a believable load path. All details stay merged into the category batch.
    const porchZ = -depth * 0.5 - 0.17;
    for (let plank = 0; plank < 9; plank++) {
      const plankWidth = (width + 0.18) / 9;
      addPart(new THREE.BoxGeometry(plankWidth - 0.011, 0.044, 0.39),
        plank % 3 === 0 ? '#958a77' : wood,
        [(plank - 4) * plankWidth, wallBase - 0.026 + Math.sin(plank * 3.1) * 0.005, porchZ]);
    }
    for (const side of [-1, 1]) {
      addPart(new THREE.CylinderGeometry(0.024, 0.037, 0.57, 6), darkWood,
        [side * width * 0.43, wallBase - 0.32, porchZ - 0.13]);
      const braceLength = Math.hypot(width * 0.78, 0.36);
      addPart(new THREE.CylinderGeometry(0.014, 0.021, braceLength, 5), wood,
        [0, wallBase - 0.34, porchZ - 0.12],
        [0, 0, side * Math.atan2(width * 0.78, 0.36)]);
      // Set the posts forward of the wall. The covered end bays are now a
      // porch in silhouette, with daylight between rail, post and threshold.
      const postZ=porchZ-.135, edge=side*width*.43;
      addPart(new THREE.CylinderGeometry(0.025, 0.036, wallHeight + 0.14, 4), wood,
        [edge, wallBase + wallHeight * 0.49, postZ]);
      addPart(new THREE.BoxGeometry(width*.226,.037,.043), '#ad9d80',
        [side*width*.32,wallBase+.22,postZ],[0,0,side*.045]);
      addPart(new THREE.BoxGeometry(.035,.26,.038),darkWood,[side*width*.22,wallBase+.107,postZ]);
    }
    addPart(new THREE.BoxGeometry(width*.9,.06,.065),darkWood,[0,eaveY-.072,porchZ-.13]);
    // A drying cloth on two occupied porch types. It turns over the existing
    // rail, not across the doorway; the broad uneven hem reads from the tank.
    if (variant===1 || variant===2) {
      const side=variant===1?1:-1, xMid=side*width*.323, railZ=porchZ-.135;
      const p:number[]=[], uv:number[]=[], ix:number[]=[];
      const strips=variant===2?4:6;
      for(let k=0;k<=strips;k++) {
        const u=k/strips, x=xMid+(u-.5)*width*.19;
        const fold=.012*Math.cos(2*Math.PI*u*1.65), sag=.009*Math.sin(Math.PI*u);
        const top=wallBase+.251-sag, bottom=top-.20-.032*Math.sin(3.1*u)-.022*u;
        const profile=[[top-.074,railZ+.045],[top,railZ+.025],[top-.004,railZ-.03],
          ...(variant===2?[]:[[top-.078,railZ-.048+fold*.6]]),[bottom,railZ-.059+fold]];
        for(const [j,[y,z]] of profile.entries()) {
          p.push(x,y,z); uv.push(.44+u*.10,.45+j*.025);
        }
        if(k)for(let j=0;j<profile.length-1;j++){const a=(k-1)*profile.length+j,b=a+profile.length;ix.push(a,b,b+1,a,b+1,a+1);}
      }
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
      g.setIndex(ix);g.computeVertexNormals();addPart(g,variant===1?'#c08a78':'#849b98',[0,0,0],[0,0,0],[1,1,1],'bamboo');
    }
    // Hollow walls and an inset dark interior give the doorway depth. A solid
    // cuboid with a black rectangle reads as a toy from the chase camera.
    addPart(new THREE.BoxGeometry(width, wallHeight, 0.035), bamboo, [0, wallCenter, depth * 0.5], [0, 0, 0], [1, 1, 1], 'bamboo',true);
    addPart(new THREE.BoxGeometry(width * 0.82, wallHeight * 0.95, 0.018), '#4d4937', [0, wallCenter, depth * 0.17]);
    // Slivers of sun hit the rear wall through a shutter. These are baked
    // within the existing volume and draw, not glowing sprites at its lip.
    const slats=new THREE.BufferGeometry(); const slatPos:number[]=[],slatUV:number[]=[],slatIdx:number[]=[];
    for(let j=0;j<3;j++){
      const y=wallCenter-wallHeight*.22+j*.063, x=-width*.18+j*.015, z=depth*.17-.012, w=(3-j*.43)*.069;
      slatPos.push(x,y,z,x,y+.018,z,x+w,y+.046,z,x+w,y+.028,z);slatUV.push(0,0,0,1,1,1,1,0);
      const k=j*4;slatIdx.push(k,k+1,k+2,k,k+2,k+3);
    }
    slats.setAttribute('position',new THREE.Float32BufferAttribute(slatPos,3));slats.setAttribute('uv',new THREE.Float32BufferAttribute(slatUV,2));
    slats.setIndex(slatIdx);slats.computeVertexNormals();addPart(slats,'#b29562',[0,0,0]);
    [-1, 1].forEach((side) => {
      addPart(new THREE.BoxGeometry(0.035, wallHeight, depth), bamboo, [side * width * 0.5, wallCenter, 0], [0, 0, 0], [1, 1, 1], 'bamboo',true);
      addPart(new THREE.BoxGeometry(width * 0.345, wallHeight, 0.045), bamboo, [side * width * 0.3275, wallCenter, -depth * 0.5], [0, 0, 0], [1, 1, 1], 'bamboo',true);
      addPart(
        new THREE.CylinderGeometry(0.026, 0.032, wallHeight + 0.12, 6),
        wood,
        [side * width * 0.48, wallCenter, -(depth * 0.5 + 0.025)],
      );
      addPart(new THREE.BoxGeometry(0.038, wallHeight * 0.86, 0.068), darkWood, [side * width * 0.155, wallBase + wallHeight * 0.42, -depth * 0.5 - 0.015]);
      addPart(new THREE.BoxGeometry(0.05, 0.038, depth), wood, [side * width * 0.5, wallBase + wallHeight * 0.25, 0]);
      addPart(new THREE.BoxGeometry(0.027, 0.031, depth), darkWood, [side * (width * 0.5 + .013), eaveY - .133, 0]);
      // Small shuttered side openings, with shaded recesses and sill beams.
      addPart(new THREE.BoxGeometry(0.022, wallHeight * 0.29, depth * 0.25), '#252c22', [side * (width * 0.5 + 0.019), wallCenter + 0.035, depth * 0.07]);
      addPart(new THREE.BoxGeometry(0.02, wallHeight * 0.32, depth * 0.14), darkWood,
        [side * (width * 0.5 + 0.055), wallCenter + 0.035, depth * 0.22], [0, side * -0.5, 0]);
      addPart(new THREE.BoxGeometry(0.049, 0.025, depth * 0.32), wood, [side * (width * 0.5 + 0.031), wallCenter - wallHeight * 0.095, depth * 0.07]);
      addPart(new THREE.BoxGeometry(.035, .029, depth * .32), '#a27d53', [side * (width * 0.5 + .026), wallCenter + wallHeight * .18, depth * .07]);
    });
    addPart(new THREE.BoxGeometry(width * 0.31, wallHeight * 0.2, 0.045), bamboo, [0, wallBase + wallHeight * 0.9, -depth * 0.5], [0, 0, 0], [1, 1, 1], 'bamboo',true);
    addPart(new THREE.BoxGeometry(width * 0.38, 0.043, 0.065), wood, [0, wallBase + wallHeight * 0.79, -depth * 0.5 - 0.02]);
    addPart(new THREE.BoxGeometry(width * 0.1, wallHeight * 0.13, 0.018), accent, [width * 0.29, wallCenter + wallHeight * 0.12, -depth * 0.5 - 0.033]);
    addPart(new THREE.BoxGeometry(width + 0.04, 0.04, 0.055), darkWood, [0, wallBase + 0.03, -depth * 0.5 - 0.01]);

    // A lifted split-bamboo shade casts its own wedge of shade over one
    // porch bay. Its bottom edge and lashings stagger across the facade,
    // but the open centre/impactable doorway remain exactly where they were.
    const lean=variant===2?-1:1, faceZ=-depth*.5;
    for(let i=0;i<5;i++){
      const w=width*.098,x=lean*(width*.015+i*w),hang=.008*Math.cos(i*2.4);
      addPart(new THREE.BoxGeometry(w*.99,.018,.277),i%3?'#aca495':'#958d7a',
        [x,eaveY-.122+hang,faceZ-.146],[-.30,0,0],[1,1,1],'bamboo');
    }
    for(const k of [.03,.40]){
      const x=lean*width*k;
      addPart(new THREE.CylinderGeometry(.009,.012,.24,4),wood,[x,eaveY-.22,faceZ-.16],[-.94,0,0]);
    }
    // Bound split-culm battens divide the woven reed by wall panel rather
    // than leaving a single oversized weave across the entire front bay.
    for(const k of [-.42,-.24,.24,.43]){
      addPart(new THREE.BoxGeometry(.017,wallHeight*.92,.018),'#927f64',
        [width*k,wallCenter,faceZ-.029],[0,0,.012*Math.sin(k*19)]);
    }
    addThatchedRoof(width, depth, eaveY, roofRise);
  };

  const [width,depth,wallHeight,roofRise] = HUT_PROFILES[variant] ?? HUT_PROFILES[0];
  addStiltHut(width, depth, wallHeight, roofRise);
  if (variant === 1) {
    // A repaired plank shutter interrupts the continuous woven wall.
    addPart(new THREE.BoxGeometry(0.023, 0.31, 0.31), '#65614f', [0.699, 0.3, 0.1]);
  } else if (variant === 2) {
    for (const x of [-0.23, 0.23]) addPart(new THREE.CylinderGeometry(0.07, 0.07, 0.69, 6), earth,
      [x, -0.22, -0.77], [0, 0, Math.PI / 2]);
  } else if (variant === 3) {
    // Side work shelter, deliberately open underneath. One merged mesh and
    // shared atlas includes its roof, posts and a small slatted workbench.
    addPart(new THREE.BoxGeometry(0.56, 0.045, 1.19), thatch, [0.75, 0.65, 0.01], [0, 0, -0.18], [1, 1, 1], 'thatch');
    for (const z of [-0.43, 0.43]) addPart(new THREE.CylinderGeometry(0.022, 0.032, 1.1, 6), darkWood,
      [0.98, 0.075, z]);
    addPart(new THREE.BoxGeometry(0.43, 0.037, 0.72), wood, [0.79, -0.04, 0.02]);
  } else {
    for (let rung = 0; rung < 3; rung += 1) {
      addPart(new THREE.BoxGeometry(0.28, 0.03, 0.04), wood, [0, -0.22 - rung * 0.12, -0.58]);
    }
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  // The tank starts facing +Z (rotation PI), so its arrival camera is south of
  // these plots: retain the authored -Z door/porch orientation.
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

interface InstancedCategoryBlocksProps {
  blocks: BlockData[];
  category: FileCategory;
  variant: number;
  onHover: (block: BlockData | null) => void;
  meshRef?: React.RefObject<THREE.InstancedMesh | null>;
  markedFiles: Set<string>;
  deletingFiles: Set<string>;
  onDeletionComplete?: (filePath: string) => void;
  restoreDeadlines?: ReadonlyMap<string, number>;
  surfaces: { colorMap: THREE.Texture; bumpMap: THREE.Texture };
  zeroTile: THREE.DataTexture;
  warningInk: ArmedFileInk;
  allHutsHaveSurface?:boolean;
}

export function InstancedCategoryBlocks({ blocks, category, variant, onHover, meshRef: externalMeshRef, markedFiles, deletingFiles, onDeletionComplete, restoreDeadlines, surfaces, zeroTile, warningInk, allHutsHaveSurface=false }: InstancedCategoryBlocksProps) {
  const internalMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const meshRef = externalMeshRef || internalMeshRef;

  // Track deletion animation progress for each deleting file
  const deletionProgressRef = useRef<Map<string, number>>(new Map());

  const geometry = useMemo(() => createStructureGeometry(category, variant), [category, variant]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  // Pre-allocated objects for frame updates
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempPosition = useMemo(() => new THREE.Vector3(), []);
  const tempQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const tempScale = useMemo(() => new THREE.Vector3(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);
  const blockIndexByPath = useMemo(
    () => new Map(blocks.map((block, index) => [block.path, index])),
    [blocks],
  );
  const yaws = useMemo(() => blocks.map(blockYaw), [blocks]);
  const glyphClock = useMemo(() => ({value:0}),[]);
  const ghostCompile = useMemo(() => ghostHutShader(glyphClock,zeroTile),[glyphClock,zeroTile]);
  const scars = useRef(new Map<string,GhostScar>());
  const ghostEntries = useMemo(() => blocks.flatMap((block,index)=>
    (allHutsHaveSurface || inGhostRiverHutPlot(block.position[0],block.position[2])) ? [{block,index}] : []),[blocks,allHutsHaveSurface]);
  // Retain the buffers across slot reuse/repacking instead of allocating GPU
  // buffers every time an entry disappears. The sector already bounds batches.
  const hasGhost=ghostEntries.length>0;
  const ghostBuffers = useMemo(() => ({
    scar:ghostHutAttribute(SECTOR_FILE_CAPACITY,true), face:ghostHutAttribute(SECTOR_FILE_CAPACITY),
  }),[]);
  const ghostAttrs=hasGhost ? ghostBuffers : null;
  useLayoutEffect(() => {
    const mesh=meshRef.current;
    if(!mesh) return;
    if(!ghostAttrs) { scars.current.clear(); return; }
    for(let i=0;i<blocks.length;i++) {
      ghostAttrs.scar.setW(i,-1); ghostAttrs.face.setW(i,-1);
    }
    for(const {index} of ghostEntries) ghostAttrs.face.setW(index,0);
    geometry.setAttribute('ghostScar',ghostAttrs.scar); geometry.setAttribute('ghostFace',ghostAttrs.face);
    const restored=new Set(ghostEntries.map(e=>e.block.path));
    for (const path of scars.current.keys()) if(!restored.has(path)) scars.current.delete(path);
    const skin:GhostSkin={ entries:ghostEntries, strike(index,point,normal) {
      const path=blocks[index]?.path; if(!path) return;
      let scar=scars.current.get(path);
      if(scar?.phase===2)return;
      if(!scar) {
        scar={point:new THREE.Vector3(),normal:new THREE.Vector3(),start:0,phase:0}; scars.current.set(path,scar);
      }
      scar.point.copy(point); scar.normal.copy(normal); scar.start=glyphClock.value;
      ghostAttrs.scar.setXYZW(index,point.x,point.y,point.z,scar.start);
      ghostAttrs.face.setXYZW(index,normal.x,normal.y,normal.z,0);
      ghostAttrs.scar.needsUpdate=true; ghostAttrs.face.needsUpdate=true;
    }};
    mesh.userData.ghostHutSkin=skin;
    return () => { delete mesh.userData.ghostHutSkin; };
  },[blocks,geometry,ghostAttrs,ghostEntries,glyphClock,meshRef]);
  useLayoutEffect(() => {
    if(!ghostAttrs) return;
    const now=performance.now();
    for(const {block,index} of ghostEntries) {
      // Prior marks survive instance re-packing, never transfer to a neighbor.
      // A batch deletion may begin long after the last shot: start that wave now.
      const phase=deletingFiles.has(block.path) ? 2 : markedFiles.has(block.path) ? 1 : 0;
      let scar=scars.current.get(block.path);
      if(!phase && scar && scar.phase!==0) {
        scars.current.delete(block.path);
        scar=undefined;
      }
      if(!scar && phase===2) {
        // Area fire and batch confirmation can arrive without a triangle hit.
        scar={point:new THREE.Vector3(0,.35,0),normal:new THREE.Vector3(0,1,0),start:glyphClock.value,phase};
        scars.current.set(block.path,scar);
      }
      if(!scar) {
        const remaining=((restoreDeadlines?.get(block.path) ?? 0)-now)/1000;
        const restoring=phase===0 && remaining>0;
        ghostAttrs.scar.setW(index,restoring ? glyphClock.value+remaining : -1);
        ghostAttrs.face.setW(index,restoring ? 3 : 0);
        continue;
      }
      const {point,normal}=scar;
      if(phase===2 && scar.phase!==2) scar.start=glyphClock.value;
      scar.phase=phase;
      ghostAttrs.scar.setXYZW(index,point.x,point.y,point.z,scar.start);
      ghostAttrs.face.setXYZW(index,normal.x,normal.y,normal.z,phase);
    }
    ghostAttrs.scar.needsUpdate=true; ghostAttrs.face.needsUpdate=true;
  },[ghostAttrs,ghostEntries,markedFiles,deletingFiles,restoreDeadlines,glyphClock]);
  const activeDeletions = useMemo(() => {
    const active: Array<{ path: string; blockIndex: number }> = [];
    for (const path of deletingFiles) {
      const blockIndex = blockIndexByPath.get(path);
      if (blockIndex !== undefined) active.push({ path, blockIndex });
    }
    return active;
  }, [blockIndexByPath, deletingFiles]);

  // Setup instance matrices
  useLayoutEffect(() => {
    if (!meshRef.current) return;

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      tempPosition.set(...block.position);
      tempScale.set(block.scale, block.scale, block.scale);
      tempQuaternion.setFromAxisAngle(Y_AXIS, yaws[i]);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      meshRef.current.setMatrixAt(i, tempMatrix);
      const weathering = 0.85 + pathNoise(block.path, 1971) * 0.15;
      const warmth = pathNoise(block.path, 1972) * 0.04;
      tempColor.setRGB(weathering, weathering - warmth * 0.35, weathering - warmth);
      meshRef.current.setColorAt(i, tempColor);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    meshRef.current.computeBoundingSphere();
  }, [blocks, geometry, tempColor, tempMatrix, tempPosition, tempQuaternion, tempScale, yaws]);

  // A failed/cancelled deletion leaves the file in the directory. Restore its
  // static matrix immediately instead of leaving a partially de-rezzed hut.
  const completedDeletionsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!meshRef.current) return;

    let matricesChanged = false;
    for (const path of deletionProgressRef.current.keys()) {
      if (deletingFiles.has(path)) continue;

      deletionProgressRef.current.delete(path);
      completedDeletionsRef.current.delete(path);
      const blockIndex = blockIndexByPath.get(path);
      if (blockIndex === undefined) continue;

      const block = blocks[blockIndex];
      tempPosition.set(...block.position);
      tempScale.setScalar(block.scale);
      tempQuaternion.setFromAxisAngle(Y_AXIS, yaws[blockIndex]);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      meshRef.current.setMatrixAt(blockIndex, tempMatrix);
      matricesChanged = true;
    }

    for (const path of completedDeletionsRef.current) {
      if (!deletingFiles.has(path)) completedDeletionsRef.current.delete(path);
    }

    if (matricesChanged) meshRef.current.instanceMatrix.needsUpdate = true;
  }, [blocks, blockIndexByPath, deletingFiles, tempMatrix, tempPosition, tempQuaternion, tempScale, yaws]);

  // Only a structure being destroyed animates; the rest of the village is static.
  useFrame((_, delta) => {
    // Let the dissolve read across several draws even after a stalled frame.
    const effectDelta=activeDeletions.length ? Math.min(delta,.08) : delta;
    glyphClock.value+=effectDelta;
    if (!meshRef.current) return;

    // Static structures keep their original GPU instance matrices. Only active
    // de-rez entries touch the buffer, rather than rewriting every file every frame.
    let matricesChanged = false;
    for (const { path, blockIndex } of activeDeletions) {
      if (completedDeletionsRef.current.has(path)) continue;
      const block = blocks[blockIndex];
      const currentProgress = deletionProgressRef.current.get(path) || 0;
      const deletionProgress = Math.min(1, currentProgress + effectDelta / HUT_BREAK_SECONDS);
      const scale = block.scale * (1 - deletionProgress);

      deletionProgressRef.current.set(path, deletionProgress);
      // A directly struck crossing hut unweaves from contact. Its structural
      // frame remains stationary while letters disappear, not a sinking cube.
      if (!ghostAttrs || ghostAttrs.face.getW(blockIndex)!==2 || deletionProgress===1) {
        tempPosition.set(block.position[0], block.position[1] - deletionProgress * 2, block.position[2]);
        tempScale.set(scale, scale, scale);
        tempQuaternion.setFromAxisAngle(Y_AXIS, yaws[blockIndex]);
        tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
        meshRef.current.setMatrixAt(blockIndex, tempMatrix);
        matricesChanged = true;
      }

      if (deletionProgress >= 1) {
        completedDeletionsRef.current.add(path);
        onDeletionComplete?.(path);
      }
    }
    if (matricesChanged) meshRef.current.instanceMatrix.needsUpdate = true;

  });

  // Hover detection
  const handlePointerOver = (event: any) => {
    event.stopPropagation();
    const instanceId = event.instanceId;
    if (instanceId !== undefined && blocks[instanceId]) {
      onHover(blocks[instanceId]);
    }
  };

  const handlePointerOut = (event: any) => {
    event.stopPropagation();
    onHover(null);
  };

  return (
    <>
      {/* One opaque, naturally lit batch per category, sharing a surface atlas. */}
      <instancedMesh
        ref={meshRef}
        args={[geometry, undefined, blocks.length]}
        castShadow={blocks.length <= MAX_SHADOWED_BLOCKS_PER_CATEGORY}
        receiveShadow
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <meshStandardMaterial
          key={ghostAttrs?'glyph-wall':'ordinary-wall'}
          onBeforeCompile={ghostAttrs?ghostCompile:undefined}
          vertexColors
          color="#ffffff"
          map={surfaces.colorMap}
          bumpMap={surfaces.bumpMap}
          bumpScale={0.004}
          roughness={1}
          metalness={0}
        />
        {ghostAttrs&&<meshDepthMaterial attach="customDepthMaterial" depthPacking={THREE.RGBADepthPacking}
          onBeforeCompile={ghostCompile} />}
      </instancedMesh>

      {/* Armed targets retain an unmistakable warning, without tinting neighbors. */}
      {blocks.filter(block => markedFiles.has(block.path) || deletingFiles.has(block.path)).map((block) => (
        <group key={`marked-${block.path}`} position={block.position} rotation={[0,blockYaw(block),0]}>
          {deletingFiles.has(block.path) ? <HutReleaseRing
            ink={warningInk} scale={block.scale} groundY={.025-block.position[1]}
            progress={deletionProgressRef.current} path={block.path}/> : <>
            {!scars.current.has(block.path) && <mesh position={[0,block.scale*.1,0]} scale={block.scale}
              geometry={warningInk.cage.geometry} material={warningInk.cage.material} dispose={null}/>}
            <mesh name="armed-hut-ring" rotation-x={-Math.PI/2} position-y={.025-block.position[1]} scale={block.scale}
              geometry={warningInk.ring.geometry} material={warningInk.ring.material} dispose={null}/>
          </>}
        </group>
      ))}

    </>
  );
}

function ObjectiveFileMarkers({
  blocks,
  deletingFiles,
}: {
  blocks: BlockData[];
  deletingFiles: Set<string>;
}) {
  const ringRef = useRef<THREE.InstancedMesh>(null);
  const poleRef = useRef<THREE.InstancedMesh>(null);
  const flagRef = useRef<THREE.InstancedMesh>(null);
  const lastUpdateRef = useRef(-1);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const activeObjectives = useMemo(
    () => blocks.filter(block => block.isObjective && !deletingFiles.has(block.path)),
    [blocks, deletingFiles],
  );

  useLayoutEffect(() => {
    if (!ringRef.current || !poleRef.current || !flagRef.current) return;
    ringRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    poleRef.current.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    flagRef.current.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    ringRef.current.count = activeObjectives.length;
    poleRef.current.count = activeObjectives.length;
    flagRef.current.count = activeObjectives.length;

    activeObjectives.forEach((block, index) => {
      const markerX = block.position[0] + block.scale * 0.92;
      const markerZ = block.position[2] - block.scale * 0.68;

      dummy.position.set(block.position[0], 0.028, block.position[2]);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(block.scale * 1.08);
      dummy.updateMatrix();
      ringRef.current!.setMatrixAt(index, dummy.matrix);

      dummy.position.set(markerX, 0.92, markerZ);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.025, 0.9, 0.025);
      dummy.updateMatrix();
      poleRef.current!.setMatrixAt(index, dummy.matrix);

      dummy.position.set(markerX + 0.2, 1.62, markerZ);
      dummy.rotation.set(0, 0, -0.08);
      dummy.scale.set(0.42, 0.19, 1);
      dummy.updateMatrix();
      flagRef.current!.setMatrixAt(index, dummy.matrix);
    });

    for (const mesh of [ringRef.current, poleRef.current, flagRef.current]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    }
  }, [activeObjectives, dummy]);

  useFrame(({ clock }) => {
    const rings = ringRef.current;
    if (!rings || activeObjectives.length === 0) return;
    const now = clock.elapsedTime;
    if (now - lastUpdateRef.current < 1 / 15) return;
    lastUpdateRef.current = now;

    activeObjectives.forEach((block, index) => {
      const pulse = 1 + Math.sin(now * 2.6 + index * 1.4) * 0.08;
      dummy.position.set(block.position[0], 0.03, block.position[2]);
      dummy.rotation.set(-Math.PI / 2, 0, now * 0.22 + index * 0.5);
      dummy.scale.setScalar(block.scale * 1.08 * pulse);
      dummy.updateMatrix();
      rings.setMatrixAt(index, dummy.matrix);
    });
    rings.instanceMatrix.needsUpdate = true;
  });

  if (activeObjectives.length === 0) return null;
  return (
    <group>
      <instancedMesh ref={ringRef} args={[undefined, undefined, activeObjectives.length]} renderOrder={72}>
        <ringGeometry args={[0.82, 1, 28]} />
        <meshBasicMaterial color="#cfe982" transparent opacity={0.82} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={poleRef} args={[undefined, undefined, activeObjectives.length]}>
        <cylinderGeometry args={[1, 1.18, 1, 6]} />
        <meshStandardMaterial color="#574a2c" roughness={0.92} />
      </instancedMesh>
      <instancedMesh ref={flagRef} args={[undefined, undefined, activeObjectives.length]} renderOrder={71}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#739b4b" side={THREE.DoubleSide} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

interface FileBlocksProps {
  restoreDeadlines?: ReadonlyMap<string, number>;
  allHutsHaveSurface?:boolean;
  blocks: Map<FileCategory, BlockData[]>;
  onHover: (block: BlockData | null) => void;
  onMeshRefsReady?: (refs: React.RefObject<THREE.InstancedMesh | null>[]) => void;
  markedFiles?: Set<string>;
  deletingFiles?: Set<string>;
  onDeletionComplete?: (filePath: string) => void;
}

export const FileBlocks = memo(function FileBlocks({ blocks, onHover, onMeshRefsReady, allHutsHaveSurface=false, markedFiles = new Set(), deletingFiles = new Set(), onDeletionComplete, restoreDeadlines }: FileBlocksProps) {
  const scene=useThree(state=>state.scene), warningInk=useMemo(createArmedFileInk,[]);
  useLayoutEffect(()=>registerArmedFileInk(scene,warningInk),[scene,warningInk]);
  useEffect(()=>()=>warningInk.dispose(),[warningInk]);
  useFrame(({clock})=>{
    warningInk.ring.material.opacity=.72+.28*Math.cos(clock.elapsedTime*Math.PI*2/1.4);
  });
  const [hoveredBlock, setHoveredBlock] = useState<BlockData | null>(null);
  const paint=useLoader(THREE.TextureLoader,VILLAGE_MATERIAL_ATLAS);
  const surfaces=useMemo(()=>{
    configureVillageAtlas(paint);
    // Fiber owns the cached atlas; colour and shallow relief share one GPU
    // image. No repainted canvases or reload on mark / delete / reset.
    return {colorMap:paint,bumpMap:paint};
  },[paint]);
  const zeroTile=warningInk.zeroTile;

  // Collect mesh refs for hit detection
  const meshRefs = useRef<Map<string, React.RefObject<THREE.InstancedMesh | null>>>(new Map());
  const batches = useMemo(() => Array.from(blocks.entries()).flatMap(([category, categoryBlocks]) =>
    [0, 1, 2, 3].map(variant => ({ key: `${category}:${variant}`, category, variant,
      blocks: categoryBlocks.filter(block => villageStructureVariant(block.path) === variant) }))
      .filter(batch => batch.blocks.length > 0)), [blocks]);

  // Report mesh refs when they're ready
  useEffect(() => {
    if (onMeshRefsReady && meshRefs.current.size > 0) {
      const refs = Array.from(meshRefs.current.values());
      onMeshRefsReady(refs);
    }
  }, [onMeshRefsReady, blocks]);

  useEffect(() => {
    if (!hoveredBlock) return;

    const stillExists = Array.from(blocks.values())
      .some(categoryBlocks => categoryBlocks.some(block => block.path === hoveredBlock.path));

    if (!stillExists) {
      setHoveredBlock(null);
      onHover(null);
    }
  }, [blocks, hoveredBlock, onHover]);

  const handleHover = (block: BlockData | null) => {
    setHoveredBlock(block);
    onHover(block);
  };
  const allBlocks = useMemo(() => Array.from(blocks.values()).flat(), [blocks]);

  return (
    <>
      {/* At most four silhouettes per category: sixteen shared batches total. */}
      {batches.map(({ key, category, variant, blocks: categoryBlocks }) => {
        // Create or get ref for this category
        if (!meshRefs.current.has(key)) {
          meshRefs.current.set(key, createRef<THREE.InstancedMesh>());
        }
        const categoryMeshRef = meshRefs.current.get(key)!;

        return (
          <InstancedCategoryBlocks
            key={key}
            blocks={categoryBlocks} allHutsHaveSurface={allHutsHaveSurface}
            category={category}
            variant={variant}
            onHover={handleHover}
            meshRef={categoryMeshRef}
            markedFiles={markedFiles}
            deletingFiles={deletingFiles}
            onDeletionComplete={onDeletionComplete}
            restoreDeadlines={restoreDeadlines}
            surfaces={surfaces}
            zeroTile={zeroTile}
            warningInk={warningInk}
          />
        );
      })}

      <ProximityFileLabels blocks={allBlocks} markedFiles={markedFiles} />
      <ObjectiveFileMarkers blocks={allBlocks} deletingFiles={deletingFiles} />

      {/* Hover tooltip */}
      {hoveredBlock && (
        <Html
          position={[
            hoveredBlock.position[0],
            hoveredBlock.position[1] + hoveredBlock.scale * 1.65 + 0.9,
            hoveredBlock.position[2],
          ]}
          center
          distanceFactor={10}
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              background: 'rgba(5, 5, 16, 0.95)',
              border: '2px solid #879b63',
              borderRadius: '4px',
              padding: '8px 12px',
              color: '#ffffff',
              fontFamily: 'monospace',
              fontSize: '14px',
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{hoveredBlock.name}</div>
            <div>{formatBytes(hoveredBlock.size)}</div>
          </div>
        </Html>
      )}
    </>
  );
});
