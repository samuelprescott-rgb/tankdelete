import * as THREE from 'three';

// A complete, watertight skin from the iliac crest to the top of the foot.
// Its outer surface is the leg, not another set of sleeves over rigid limbs.
// Seven transforms: common pelvis, then one thigh/shin/rolled sole per side.
const HIP=.755,KNEE=.405,ANKLE=.079,WAIST=.198,ZO=.024;
const sat=THREE.MathUtils.smoothstep;
const bind=()=>{
  const m=[new THREE.Matrix4().makeTranslation(0,WAIST,0)];
  for(const s of [-1,1]){
    const x=s*.152;
    m.push(new THREE.Matrix4().makeScale(1,HIP-KNEE,1).setPosition(x,(HIP+KNEE)/2,ZO),
      new THREE.Matrix4().makeScale(1,KNEE-ANKLE,1).setPosition(x,(KNEE+ANKLE)/2,ZO),
      new THREE.Matrix4().makeTranslation(x,0,ZO));
  }
  return m;
};
export function commandLegRig(){
  const b=bind(),bones=b.map(m=>{const joint=new THREE.Bone();joint.matrixWorld.copy(m);return joint;});
  return new THREE.Skeleton(bones,b.map(m=>m.invert()));
}
export function poseCommandLegMantle(rig:THREE.Skeleton,pelvis:THREE.Object3D|null,
    thighs:(THREE.Object3D|null)[],shins:(THREE.Object3D|null)[],boots:(THREE.Group|null)[]){
  if(!pelvis)return;pelvis.updateMatrix();rig.bones[0].matrixWorld.copy(pelvis.matrix);
  for(let i=0;i<2;i++){
    const a=thighs[i],b=shins[i],foot=boots[i],pad=foot?.children[0];if(!a||!b||!foot||!pad)continue;
    a.updateMatrix();b.updateMatrix();foot.updateMatrix();pad.updateMatrix();
    const k=1+i*3;rig.bones[k].matrixWorld.copy(a.matrix);rig.bones[k+1].matrixWorld.copy(b.matrix);
    rig.bones[k+2].matrixWorld.multiplyMatrices(foot.matrix,pad.matrix);
  }
}

// y, outward centre displacement, fore/aft displacement, width, depth.
// Raised outer thigh wraps inward across the patella; below that the rear
// calf swells on the opposite side and leaves a long, narrow Achilles.
const rows=[
  [.828,-.035,.017,.044,.056],[.802,-.021,.016,.071,.079],[.772,-.010,.011,.092,.093],
  [.737,.002,.010,.111,.099],[.695,.008,.010,.113,.105],[.642,.012,.006,.103,.101],
  [.589,.014,.002,.088,.087],[.538,.011,-.003,.077,.079],[.491,.004,-.008,.066,.070],
  [.459,-.001,-.013,.061,.068],[.438,-.005,-.016,.058,.065],[.419,-.007,-.020,.062,.069],
  [.404,-.006,-.023,.065,.070],[.388,-.004,-.017,.060,.067],[.369,-.001,-.008,.056,.060],
  [.349,.004,.009,.062,.065],[.322,.010,.024,.074,.081],[.293,.014,.038,.083,.086],
  [.254,.017,.044,.077,.079],[.216,.012,.039,.064,.071],[.182,.006,.033,.050,.059],
  [.152,.001,.029,.039,.051],[.124,-.002,.024,.035,.046],[.102,.000,.016,.039,.042],
  [.083,.002,.011,.044,.043],[.066,.003,-.002,.052,.051],[.055,-.001,-.024,.056,.058],
  [.044,-.004,-.055,.046,.053],[.037,-.005,-.077,.032,.038],
] as const;
const gauss=(x:number,c:number,w:number)=>Math.exp(-((x-c)**2)/(w*w));
export function commandLegMantle(){
  const p:number[]=[],colors:number[]=[],ix:number[]=[],weights:number[]=[],ids:number[]=[],cols=24;
  const shade=new THREE.Color(0x4c4350),slate=new THREE.Color(0x86808a),copper=new THREE.Color(0xab8270),dye=new THREE.Color();
  for(let leg=0;leg<2;leg++){
    const s=leg?1:-1,k=1+3*leg,base=p.length/3;
    for(let j=0;j<rows.length;j++){
      const [y,xc,zc,w,d]=rows[j];
      for(let i=0;i<cols;i++){
        const a=2*Math.PI*i/cols,cs=Math.cos(a),sn=Math.sin(a);
        const braid=.5+.5*Math.cos(3*a+y*15+s*.32+1.23*Math.sin(7.8*y));
        const crest=Math.pow(braid,3),front=Math.max(0,cs),outer=Math.max(0,sn);
        const knee=gauss(y,.414,.052),calf=gauss(y,.292,.099),thigh=gauss(y,.641,.144);
        const line=gauss(y,.234,.151)*Math.pow(Math.max(0,Math.cos(a+.38+s*.045)),8);
        const r=1+(.035+.099*thigh+.088*calf)*crest+.058*outer*knee;
        p.push(s*(.152+xc+sn*w*r),y+.004*Math.sin(a+.3)*knee,ZO+zc-cs*d*r
          -.021*front*front*knee-.014*line+.009*calf*Math.max(0,-cs));
        // A few broad, broken planes register at normal player distance.
        // These pigments are lit by the ordinary boss material, never emissive.
        const ash=.21+.69*crest*(.41+.59*front)+.15*knee*front;
        const nick=sat(.54*crest+.31*front+.36*line+.13*outer,.57,.93);
        dye.copy(shade).lerp(slate,ash).lerp(copper,.71*nick).multiplyScalar(.86+.16*braid);
        colors.push(dye.r,dye.g,dye.b);
        const pelvic=sat(y,.724,.817),kneeMix=1-sat(y,.360,.454),bootMix=1-sat(y,.069,.140);
        ids.push(0,k,k+1,k+2);weights.push(pelvic,(1-pelvic)*(1-kneeMix),(1-pelvic)*kneeMix*(1-bootMix),(1-pelvic)*kneeMix*bootMix);
        if(j){
          const b=base+(j-1)*cols+i,c=base+(j-1)*cols+(i+1)%cols;
          if(s>0)ix.push(b,c,b+cols,c,c+cols,b+cols);else ix.push(b,b+cols,c,c,b+cols,c+cols);
        }
      }
    }
    // Ends are buried under existing pelvis/forefoot; keep them closed so
    // moving and reversed inspection views cannot see the inside.
    const end=base+(rows.length-1)*cols;
    for(let i=1;i<cols-1;i++){
      if(s>0)ix.push(base,base+i+1,base+i,end,end+i,end+i+1);
      else ix.push(base,base+i,base+i+1,end,end+i+1,end+i);
    }
  }
  const g=new THREE.BufferGeometry();g.name='command-continuous-leg-skins';
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(ids,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  g.setIndex(ix);g.computeVertexNormals();g.computeBoundingSphere();return g;
}
