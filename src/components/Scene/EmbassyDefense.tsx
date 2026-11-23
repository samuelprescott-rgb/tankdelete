import {eclipseReflectionGLSL} from './hordeEclipse';
import { reflectWeapons } from './weaponWater';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { FACADE_LAMPS, addFacadeHardware } from './embassyFacadeLamps';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EMBASSY_ARCHIVE_SLOTS, type EmbassyArchive } from '../../lib/embassyDefense';
import { useFoliageSightline } from './FoliageSightline';
import { EmbassyFires } from './EmbassyFires';
import {createGhostSignalArchive} from './ghostSignalArchive';
import {createEmbassyCheckpoint} from './embassyCheckpoint';
import {createEmbassyGroundworks} from './embassyGroundworks';
import {createEmbassyServiceTrack} from './embassyServiceTrack';
import {createArchiveDoorHeader, createArchiveAlarmPaddle, createPreparedArchiveAlarmDriver} from './archiveDoorSigns';
import {createPerforatedGallery} from './embassyPerforatedScreen';
import {createBurnOcclusion} from './burnOcclusion';
import {CHANCERY_NEON,createEmbassyNeon} from './embassyNeon';
import {cipherGLSL,surfaceCipherAtlas} from './surfaceCipher';
import {WET_CREST_GLSL} from './wetCourtFracture';
import {drawRuinedAnnex,createAnnexBreakage} from './ruinedAnnex';
import {createAnnexFirelight} from './annexFirelight';
import {createEmbassyColors} from './embassyColors';
import {createStreetlamp,STREET_BULB} from './embassyStreetlamp';

// One source of truth for the mounted tubes and both receiving materials.
const neonCenter=`vec3(${(CHANCERY_NEON.x+EMBASSY_ARCHIVE_SLOTS[0].position[0]).toFixed(3)},${CHANCERY_NEON.y.toFixed(3)},${(CHANCERY_NEON.z+EMBASSY_ARCHIVE_SLOTS[0].position[2]).toFixed(3)})`;
const neonHalfWidth=(CHANCERY_NEON.width*.5).toFixed(3);

// Original, compressed-scale embassy-inspired architecture, not a survey model.
// Open concrete sun screens, recessed glazing and flat roof distinguish the
// chancery from the jungle huts; all static masonry is merged, not one draw/pier.
export function createEmbassyBuildingGeometry(main: boolean, ruined = false, archiveId?:typeof EMBASSY_ARCHIVE_SLOTS[number]['id']) {
  const pieces: THREE.BufferGeometry[] = [];
  const add = (x:number,y:number,z:number,w:number,h:number,d:number,color:string,rz=0,faces?:readonly number[]) => {
    const geometry = new THREE.BoxGeometry(w,h,d,1,1,1).rotateZ(rz).translate(x,y,z);
    if(faces){
      const index=geometry.getIndex()!;
      geometry.setIndex(faces.flatMap(face=>Array.from(index.array.slice(face*6,face*6+6))));
    }
    const positions=geometry.getAttribute('position');
    const normals=geometry.getAttribute('normal');
    const colors=new Float32Array(positions.count*3); const base=new THREE.Color(color);
    const upperPigment=base.clone().lerp(new THREE.Color('#c1c6c4'), .13);
    const underside=base.clone().multiply(new THREE.Color('#a8b4c9'));
    const painted=new THREE.Color();
    for(let i=0;i<positions.count;i++) {
      const runoff=.88+.12*Math.sin(positions.getX(i)*1.13+positions.getZ(i)*1.55+positions.getY(i)*.56)**2;
      painted.copy(underside).lerp(upperPigment, THREE.MathUtils.smoothstep(normals.getY(i), -.55, .9));
      painted.multiplyScalar(runoff).toArray(colors,i*3);
    }
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3)); pieces.push(geometry);
  };
  // One exposed face is all the recessed glazing needs: the closed bays have
  // real return walls behind, separate mullions in front and no visible back
  // of glass. Spend those triangles on the splayed vent throats instead.
  const pane=(x:number,y:number,z:number,w:number,h:number,yaw:number)=>{
    const g=new THREE.PlaneGeometry(w,h).rotateY(yaw).translate(x,y,z),c=new THREE.Color('#273d48'),rgb:number[]=[];
    for(let i=0;i<4;i++)rgb.push(c.r,c.g,c.b);g.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));pieces.push(g);
  };
  const width=main?8.4:5.4, depth=main?5:4.2, floors=main?5:2, storey=1.14;
  const height=ruined?1.1:floors*storey;
  add(0,.18,0,width+.65,.36,depth+.65,'#636a78');
  if(!main && (archiveId==='records'||archiveId==='dispatch')){
    drawRuinedAnnex(archiveId,!ruined,add);
    pieces.push(createAnnexBreakage(archiveId));
    if(!ruined)pieces.push(createArchiveDoorHeader(archiveId));
  }else if(!ruined) {
    // The outer shell has lost its front-east corner; cut the ACTUAL slabs,
    // recess and rafters rather than drawing a black crack on a solid box.
    // This is pre-existing visual damage, independent of the archive's HP.
    const bites=main?[0, .55, .78, 1.88, .65, .42]:[0,0,0];
    const shell=(y:number,w:number,h:number,d:number,color:string,bite:number)=>{
      if(!bite){add(0,y,0,w,h,d,color);return;}
      const notch=Math.min(1.22,bite*.82);
      add(-bite*.5,y,0,w-bite,h,d,color);
      add(w*.5-bite*.5,y,-notch*.5,bite,h,d-notch,color);
    };
    for(let floor=0;floor<=floors;floor++) {
      const bite=bites[floor];
      const lobby=main&&floor<2, gallery=main&&floor>=2, mouth=1.72, rear=1.26;
      if(lobby&&floor===1){
        add(0,.35+storey,-rear*.5,width,.16,depth-rear,'#9298a8');
        for(const sign of [-1,1])add(sign*(width*.5+mouth)*.5,.35+storey,depth*.5-rear*.5,width*.5-mouth,.16,rear,'#9298a8');
      }else shell(.35+floor*storey,width,.16,depth,'#9298a8',bite);
      if(floor===floors) continue;
      if(lobby){
        add(0,(floor+.5)*storey,-rear*.5,width-.36,storey+.003,depth-.35-rear,'#303947');
        for(const sign of [-1,1])add(sign*(width*.5-.18+mouth)*.5,(floor+.5)*storey,depth*.5-rear*.5-.175,
          width*.5-.18-mouth,storey+.003,rear,'#303947');
      }else if(gallery){
        // The upper verandah is open all the way through a bank of the
        // vents. The remaining return walls and piers give others a deep
        // cool backing. You see a different pattern as you move laterally.
        add(-3.34,(floor+.5)*storey,-.53,.89,storey,depth-1.45,'#333d49');
        add(1.18,(floor+.5)*storey,-.86,.46,storey,depth-2.12,'#37414b');
        pieces.push(createPerforatedGallery(floor,bite));
        add(-bite*.5,.424+floor*storey,depth*.5+.18,width-.12-bite,.073,.39,'#b3bcc1');
      }else shell((floor+.5)*storey,width-.36,storey+.003,depth-.35,'#303947',bite);
      for(const side of [-1,1]) {
        // Narrow mullions and deep recesses create real parallax/shadowing.
        const frontCut=side>0?bite:0, endCut=side>0?Math.min(1.22,bite*.82):0;
        const fascia=(span:number,y:number,z:number,h:number,d:number,ink:string)=>{
          if(lobby&&side>0){
            for(const s of [-1,1]){const extent=span*.5-(s>0?frontCut:0);
              add(s*(extent+mouth)*.5,y,z,extent-mouth,h,d,ink);}
          }else add(-frontCut*.5,y,z,span-frontCut,h,d,ink);
        };
        if(!gallery){
          if(lobby&&side>0)fascia(width-.3,.89+floor*storey,side*(depth*.5+.018),.82,.06,'#273d48');
          else pane(-frontCut*.5,.89+floor*storey,side*(depth*.5+.048),width-.3-frontCut,.82,side<0?Math.PI:0);
        }
        for(let bay=0;bay<(main?10:6);bay++) {
          const x=-width*.5+.28+bay*(width-.56)/((main?10:6)-1);
          if((frontCut && x>width*.5-frontCut)||(lobby&&side>0&&Math.abs(x)<mouth))continue;
          if(gallery&&(side>0?bay%3!==0:Math.abs(x+.86)<1.59))continue;
          add(x,.92+floor*storey,side*(depth*.5+.18),.13,.99,.4,'#8a93a5');
        }
        if(main&&!gallery)fascia(width,.92+floor*storey,side*(depth*.5+.28),.105,.13,'#838d9c');
        pane(side*(width*.5+.048),.89+floor*storey,-endCut*.5,depth-.3-endCut,.82,side*Math.PI*.5);
        for(let bay=0;bay<5;bay++) {
          const z=-depth*.5+.28+bay*(depth-.56)/4;
          if(endCut && z>depth*.5-endCut)continue;
          add(side*(width*.5+.18),.92+floor*storey,z,.4,.99,.13,'#8a93a5');
        }
        if(main)add(side*(width*.5+.28),.92+floor*storey,-endCut*.5,.13,.105,depth-endCut,'#838d9c');
      }
      if(bite>.5){
        // Ragged stair-stepped raw edges reveal the warmer aggregate and
        // bent reinforcement INSIDE the cut, with real negative space in front.
        const x=width*.5-bite, y=.35+floor*storey;
        add(x+.13,y-.06,depth*.5-.27,.28,.19,.58,'#bfae96',-.12);
        add(x+.34,y-.15,depth*.5-.37,.23,.12,.42,'#8e776b',-.17);
        add(x+.38,y-.19,depth*.5-.19,.58,.033,.038,'#694f42',-.42);
      }
    }
    shell(height+.52,width+.35,.35,depth+.35,'#74776d',bites[floors]);
    add(main?-1.7:.6,height+.9,-.7,main?2.2:1.1,.55,1.3,'#747a70');
    if(!main)add(0,1,depth*.5+.055,1.2,1.5,.12,'#272c29');
    const portico=main?2.04:1.02;
    add(0,.43,depth*.5+.42,portico*2+.38,.24,main?1.76:1.1,'#aaa89b');
    add(0,main?2.48:1.97,depth*.5+.5,portico*2+.26,main?.20:.12,main?1.68:1.05,'#868c80');
    for(const side of[-1,1]) add(side*portico,main?1.46:1.12,depth*.5+.82,main?.23:.16,main?1.99:1.6,main?.28:.17,'#80796d');
    if(!main&&archiveId){
      // The ancillary buildings were pressed into different service: a
      // strip-light over the dispatch wall; a corrugated shade pulled out
      // over the records night desk. Their doors and alarm irons stay clear.
      const records=archiveId==='records',deskX=records?1.65:-1.65;
      if(records){
        for(let i=0;i<6;i++)add(deskX-.74+i*.30,2.55,2.41,.304,.076+(i%2)*.038,.79,
          i%2?'#786457':'#937764');
        for(const s of [-1,1])add(deskX+s*.68,2.36,2.37,.051,.36,.09,'#74685b');
        add(-1.42,3.14,-.81,1.18,1.05,1.15,'#677171');
        add(-1.42,3.70,-.81,1.29,.12,1.27,'#776e5b');
      }else{
        add(deskX,2.52,2.46,1.37,.12,.43,'#4c5c63');
        add(deskX-.78,1.68,2.25,.082,1.52,.085,'#737879');
        add(deskX-.78,1.14,2.31,.29,.43,.15,'#5d665f');
      }
    }
    if(main){
      // Long, shaded galleries run behind the ruins. Their undercrofts stay
      // open above the existing approach; no archive or collision moves.
      for(const side of [-1,1]){
        const x=side*5.44;
        for(const [y,w,h,d,ink] of [[2.70,2.59,.23,2.30,'#53545a'],
            [height+.46,2.67,.37,2.54,'#454954'],[height+.69,2.69,.095,2.58,'#879193']] as const)
          add(x,y,.57,w,h,d,ink);
        add(side*6.66,4.36,1.48,.24,3.23,.4,'#5b6064');
        add(side*4.23,4.36,1.46,.24,3.23,.4,'#4e555c');
        for(let floor=2;floor<5;floor++){
          pieces.push(createPerforatedGallery(floor,0,x-1.16,x+1.16,1.69));
          add(x,.427+floor*storey,1.56,2.39,.06,.35,'#79776e');
        }
        add(x,2.42,-.18,2.48,.22,2.35,'#55585d');
        add(side*6.57,1.43,-.75,.25,2.24,.34,'#4a5056');
      }
      // A dark concrete frame and thin rain-catching top lip, with the
      // entrance canopy carried separately below the gallery.
      add(-.15,height+.46,2.60,8.46,.39,.57,'#434954');
      add(-.15,height+.685,2.60,8.51,.067,.63,'#828c91');
      for(const x of [-4.13,-1.86,1.83])add(x,4.36,2.70,.13,3.42,.49,'#67675f');
      add(.10,2.72,3.42,5.91,.18,.94,'#5a5351');
      for(const x of [-2.03,2.03])add(x,2.56,3.34,.27,.27,.54,'#706763');
      // Roof plant and an old crossed-beam receiving aerial. Seen in black
      // against the cloud break, away from the lit letters and file label.
      add(-2.96,height+1.39,-1.42,.067,1.66,.07,'#54555e');
      add(-2.96,height+2.08,-1.42,1.32,.047,.051,'#59616b');
      for(const x of [-3.45,-3.13,-2.77,-2.43])add(x,height+2.08,-1.40,.042,.042,.37,'#838487');
      add(2.12,height+1.03,-1.12,1.30,.67,.96,'#737774');
      for(let j=0;j<3;j++)add(2.12,height+.87+j*.153,-.62,1.15,.062,.11,'#53575c');
      // Fallen fins lean against the damaged end bay, outside the center door.
      add(3.39,.68,depth*.5+.22,.47,1.79,.48,'#868996',-.86);
      add(3.88,.58,depth*.5+.44,.36,1.64,.39,'#adaba0',-.64);
      add(3.11,.28,depth*.5+.58,.79,.20,.48,'#8d8376',.23);
      // Remnant concrete and its bent ties project from the end of the
      // damaged first-floor slab directly above the ground debris fan.
      add(3.46,1.48,depth*.5+.11,.74,.19,.46,'#a89f91',-.17);
      add(3.87,1.32,depth*.5+.21,.39,.12,.23,'#937d69',-.39);
      add(4.04,1.23,depth*.5+.18,.50,.033,.037,'#775e4f',-.35);
    }
    if(archiveId)pieces.push(createArchiveDoorHeader(archiveId));
  }
  if(archiveId && !ruined)addFacadeHardware(archiveId,add);
  // Broken slabs lie low enough to drive over; deterministic scatter only.
  for(let i=0;i<(ruined?44:24);i++) {
    const angle=i*2.399963, radius=(ruined?1:width*.46)+(i%5)*.28;
    add(Math.sin(angle)*radius,.13+(i%3)*.055,Math.cos(angle)*(depth*.45+.6),
      .28+(i%4)*.13,.14+(i%3)*.09,.28+(i%5)*.1,
      i%3===0?'#474b47':'#777c73',Math.sin(i*5.1)*.4);
  }
  const merged=mergeGeometries(pieces,false)!; pieces.forEach(piece=>piece.dispose());
  merged.computeBoundingBox(); merged.computeBoundingSphere(); return merged;
}

// Rain-stained paint in broad, stepped clusters. Object-space construction
// stays locked to the surface while driving; at distance the finest grid
// falls out so it cannot sparkle under the moving camera.
const MASONRY=new THREE.MeshLambertMaterial({vertexColors:true});
type ArchiveShader=Parameters<THREE.MeshLambertMaterial['onBeforeCompile']>[0];
const lampPosition=(lamp:{x:number;y:number;z:number})=>
  `vec3(${lamp.x.toFixed(3)},${lamp.y.toFixed(3)},${lamp.z.toFixed(3)})`;

const streetSource=lampPosition(STREET_BULB);
const dispatchSlot=EMBASSY_ARCHIVE_SLOTS.find(slot=>slot.id==='dispatch')!;
const dispatchSource=lampPosition(new THREE.Vector3(FACADE_LAMPS.dispatch.x,FACADE_LAMPS.dispatch.y,FACADE_LAMPS.dispatch.z)
  .add(new THREE.Vector3(...dispatchSlot.position)));

function paintConcrete(shader:ArchiveShader,burn?:THREE.Texture,plaster?:THREE.Texture,facade=false,streetPower?:{value:number}){
  const varying='varying vec3 vArchivePosition,vCompound,vArchiveNormal; varying float vOldGlass,vStreetWing;\n';
  if(streetPower)shader.uniforms.uStreetPower=streetPower;
  if(burn)shader.uniforms.uBurnMask={value:burn};
  if(plaster){shader.uniforms.uChippedWall={value:plaster};shader.uniforms.surfaceCipherMap={value:surfaceCipherAtlas()};}
  shader.vertexShader=varying+shader.vertexShader.replace('#include <begin_vertex>',`
    #include <begin_vertex>
    vArchivePosition=position; vArchiveNormal=normal; vCompound=(modelMatrix*vec4(position,1.)).xyz;
    vStreetWing=step(8.,abs(modelMatrix[3].x))*sign(modelMatrix[3].x);
    vOldGlass=float(color.r<.041 && color.b>color.r*1.86 && color.b<.12 && abs(normal.y)<.25);
  `);
  shader.fragmentShader=varying+(streetPower?'uniform float uStreetPower;\n':'')+(plaster?cipherGLSL+'\nuniform sampler2D uChippedWall;\n':'')+(burn?'uniform sampler2D uBurnMask;\n':'')+shader.fragmentShader.replace('#include <color_fragment>',`
    #include <color_fragment>
    vec3 n=abs(vArchiveNormal);
    vec2 wall=n.y>.6?vArchivePosition.xz:n.z>n.x?vArchivePosition.xy:vArchivePosition.zy;
    vec2 p=floor(wall*8.0)/8.0;
    float stain=sin(3.1*p.x+1.2*p.y)+.57*sin(4.3*p.y-2.1*p.x);
    float coarse=1.0-smoothstep(.27,1.3,length(fwidth(wall*8.0)));
    float scab=sin(p.y*1.64+p.x*.72+.80*sin(p.x*4.3))+.49*sin(p.x*3.13-p.y*1.27)+.19*stain;
    float run=sin(p.x*7.9+.27*sin(p.y*1.87)+.43*sin(p.x*2.09));
    float wet=smoothstep(.28,.92,scab)*smoothstep(-.64,.81,run)*coarse;
    float flake=smoothstep(.23,.67,-scab)*step(.72,stain)*coarse;
    float foot=1.-smoothstep(.035,.66+scab*.12,vCompound.y);
    ${plaster?`// World metres, so damage crosses brick returns at the same scale.
    // Glazing and dark steel keep their own smooth optical response.
    vec2 renderUV=n.y>.6?vCompound.xz:n.z>n.x?vCompound.xy:vCompound.zy;
    vec3 chalk=texture2D(uChippedWall,renderUV*.33+vec2(.217,.083)).rgb;
    float renderMask=(1.-vOldGlass)*smoothstep(.035,.19,diffuseColor.g);
    vec3 wash=vec3(.40)+chalk*1.75;
    float fired=smoothstep(.055,.16,chalk.r-chalk.b);
    wash=mix(wash,wash*vec3(1.25,.79,.64),fired);
    diffuseColor.rgb*=mix(vec3(1.),wash,renderMask*(.88-.38*n.y));
    // The last flecks of pale render expose quiet graphite and old ochre
    // register. The wet wall, intact paint, windows and lit signs stay clean.
    vec2 typeUV=renderUV*vec2(38.,31.)+vec2(.42*sin(renderUV.y*2.8),.32*run);
    vec2 wornRegister=cipherField(typeUV+vec2(7.7,23.1));
    float reveal=renderMask*coarse*(1.-.79*wet)*smoothstep(.16,.55,.67*fired+.32*flake+.13*chalk.r);
    diffuseColor.rgb=diffuseColor.rgb*(1.-.22*wornRegister.g*reveal)
      +reveal*wornRegister.r*vec3(.061,.045,.033);`:''}
    ${facade?`
    float ledge=clamp(vArchiveNormal.y,0.,1.);
    diffuseColor.rgb*=mix(vec3(.48,.60,.73),vec3(.95,1.,1.05),ledge);
    `:''}
    diffuseColor.rgb*=mix(vec3(1.),vec3(.69,.74,.80),wet*(1.-n.y*.67));
    diffuseColor.rgb*=1.-foot*(.17+.19*wet);
    diffuseColor.rgb+=vec3(.031,.025,.019)*flake*(1.-vOldGlass)*smoothstep(.06,.27,diffuseColor.g);
  `).replace('#include <emissivemap_fragment>',`
    #include <emissivemap_fragment>
    ${facade?`
    // A shielded downlight grazes masonry and dies inside the wall.
    // Evaluate in decimetre steps so the penumbra follows the painted pixels.
    vec3 lamp=vStreetWing<-.5?${lampPosition(FACADE_LAMPS.records)}:
      vStreetWing>.5?${lampPosition(FACADE_LAMPS.dispatch)}:${lampPosition(FACADE_LAMPS.chancery)};
    vec3 lp=lamp-vArchivePosition;
    float drop=floor(lp.y*14.)/14.;
    float spread=.44+.43*max(0.,drop);
    float beam=1.-smoothstep(.48,1.,abs(lp.x-.19*vStreetWing*drop)/spread);
    float lampWash=beam*smoothstep(-.16,.12,drop)*(1.-smoothstep(.22,4.9,drop))
      *(1.-smoothstep(.38,1.9,abs(lp.z)))*max(0.,vArchiveNormal.z+.48*vArchiveNormal.y);
    float receiver=.16+2.2*min(.55,diffuseColor.g);
    vec3 practical=vStreetWing>.5?vec3(.33,.81,.85):vec3(1.30,.53,.12);
    totalEmissiveRadiance+=lampWash*receiver*(.82+.17*scab)*practical;
    // Cold skylight picks out exposed concrete lips above the dark rooms.
    float lip=max(0.,vArchiveNormal.y)*smoothstep(2.1,5.8,vArchivePosition.y);
    totalEmissiveRadiance+=lip*diffuseColor.g*vec3(.06,.135,.20);
    `:''}
    ${streetPower?`
    vec3 toStreetLamp=${streetSource}-vCompound;
    float lampReach=dot(toStreetLamp,toStreetLamp);
    float grazing=max(0.,dot(vArchiveNormal,normalize(toStreetLamp)));
    totalEmissiveRadiance+=uStreetPower*grazing*diffuseColor.g*vec3(.14,.58,.76)
      *exp(-.050*lampReach);
    `:''}
    // A dark room's glazing still catches a little storm sky along its top,
    // interrupted by sashes and warped glass. Do not light the interior.
    float topPane=fract((vArchivePosition.y-.49)/1.14);
    float glass=clamp(topPane*.8+.20*sin(p.x*1.1)+.16*scab,0.,1.);
    totalEmissiveRadiance+=vOldGlass*(vec3(.0018,.0042,.0054)+glass*glass*vec3(.008,.016,.020));
    // Only the annex shells (not the chancery, court, trees or HUD) have
    // these vertical street returns. Chalk catches the cold rain opening;
    // wood and glass stay dark. Warm light is confined to facing surfaces
    // near the two modeled recesses, not a uniform tint over each wing.
    if(abs(vStreetWing)>.5 && vArchivePosition.y>1.9){
      float plasterInk=smoothstep(.075,.28,diffuseColor.g)*(1.-vOldGlass);
      float curtain=.49+.51*smoothstep(-.9,.9,scab+.35*stain);
      float frontPlane=max(0.,dot(normalize(vArchiveNormal),normalize(vec3(-.44,.66,.81))));
      float overhang=smoothstep(2.0,3.25,vArchivePosition.y);
      totalEmissiveRadiance+=plasterInk*frontPlane*curtain*(.30+.70*overhang)*vec3(.018,.032,.041);
      vec3 localRoom=vec3(-1.51*-vStreetWing,4.05,.43);
      vec3 lampDir=localRoom-vArchivePosition;
      float wallCatch=max(0.,dot(normalize(vArchiveNormal),lampDir/max(.001,length(lampDir))));
      float pocket=wallCatch/(1.+1.25*dot(lampDir,lampDir));
      totalEmissiveRadiance+=pocket*plasterInk*(vStreetWing>0.?vec3(.18,.055,.014):vec3(.12,.065,.023));
    }
    // The portico sign washes the canopy, jambs and nearest lattice. Deep
    // rooms and the distant court should never glow along with the tubes.
    vec3 signOffset=${neonCenter}-vCompound;
    float below=abs(signOffset.y)-${(CHANCERY_NEON.height*.46).toFixed(3)};
    if(below<1.62 && abs(signOffset.x)<${neonHalfWidth}+.38 && abs(signOffset.z)<1.76){
      float along=1.-smoothstep(${neonHalfWidth}-.48,${neonHalfWidth}+.30,abs(signOffset.x));
      float reach=along*(1.-smoothstep(-.1,1.59,below))*(1.-smoothstep(.08,1.75,abs(signOffset.z)));
      float throat=.20+.62*max(0.,vArchiveNormal.z)+.47*max(0.,vArchiveNormal.y);
      float warm=reach*reach*throat*(.83+.14*cos(signOffset.x*7.4))*(1.-.27*wet);
      totalEmissiveRadiance+=warm*vec3(.72,.131,.035);
    }
  `);
  if(burn)shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`
    #include <lights_fragment_end>
    if(vCompound.z>-24.5 && vCompound.z<-22.95 && vCompound.x>1. && vCompound.x<8.8 && vCompound.y<5.07 && n.y<.4){
      float visible=texture2D(uBurnMask,(vCompound.xy-vec2(1.,.17))/vec2(7.8,4.9)).g;
      float fireKey=max(0.,reflectedLight.directDiffuse.r-.85*reflectedLight.directDiffuse.b);
      reflectedLight.directDiffuse=max(vec3(0.),reflectedLight.directDiffuse-
        (1.-visible)*fireKey*vec3(.82,.39,.115));
    }
  `);
}
MASONRY.onBeforeCompile=shader=>paintConcrete(shader);
MASONRY.customProgramCacheKey=()=>'ghost-archive-masonry-v3';
const ARCHIVE_SIGNAL=new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false});
// The grille above the lit guard desk cuts oblique shadows across the lobby
// glass and its returns. Evaluate in building space so the bands stay put
// as the tank moves, and only tint the surfaces inside this doorway.
ARCHIVE_SIGNAL.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec3 vSignalLocal; varying float vCentralDoor;\n'+shader.vertexShader
    .replace('#include <begin_vertex>',`#include <begin_vertex>
      vSignalLocal=position; vCentralDoor=1.-step(1.,abs(modelMatrix[3].x));`);
  shader.fragmentShader='varying vec3 vSignalLocal; varying float vCentralDoor;\n'+shader.fragmentShader
    .replace('#include <color_fragment>',`#include <color_fragment>
      if(vCentralDoor>.5 && abs(vSignalLocal.x)<1.72 && vSignalLocal.y<2.34 &&
         vSignalLocal.y>.36 && vSignalLocal.z>1.08 && vSignalLocal.z<2.53){
        vec2 pane=floor(vSignalLocal.xy*32.)/32.;
        float cut=pane.y-.52*pane.x-.28*(vSignalLocal.z-1.1);
        float shade=smoothstep(.42,.60,cut)*(1.-smoothstep(1.55,1.77,cut));
        float rail=1.-.80*(1.-smoothstep(.065,.16,abs(cut-.96)));
        diffuseColor.rgb*=mix(vec3(.22,.27,.31),vec3(1.25,.94,.66),shade*rail);
      }`);
};
const TRACK_SOIL=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,transparent:true,depthWrite:false});

// Thin monsoon water mirrors the doorway in broken bands, not a pasted-on
// orange cone. Paint in the already-rendered pavement pass. Camera parallax
// slews the reflection toward the viewer; slab geometry still occludes it.
function createWetCourt(burn:THREE.Texture,aggregate?:THREE.Texture,streetPower={value:1}){
  const online={value:1},dispatchOnline={value:1},stormAge={value:0};
  const material=new THREE.MeshLambertMaterial({vertexColors:true});
  material.onBeforeCompile=shader=>{
    shader.uniforms.uLitLobby=online;
    shader.uniforms.uCourtTime=stormAge;
    shader.uniforms.uStreetPower=streetPower;
    shader.uniforms.uDispatchPower=dispatchOnline;
    shader.uniforms.uBurnMask={value:burn};
    if(aggregate)shader.uniforms.uAggregate={value:aggregate};
    shader.vertexShader='varying vec3 vWetCourt;\n'+shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vWetCourt=position;');
    shader.fragmentShader=(aggregate?'uniform sampler2D uAggregate;\n':'')+WET_CREST_GLSL+eclipseReflectionGLSL+'varying vec3 vWetCourt; uniform float uLitLobby,uCourtTime,uStreetPower,uDispatchPower; uniform sampler2D uBurnMask;\n'+shader.fragmentShader.replace('#include <emissivemap_fragment>',`
      #include <emissivemap_fragment>
      vec2 p=floor(vWetCourt.xz*vec2(16.,19.))/vec2(16.,19.);
      vec2 tiles=(vWetCourt.xz-vec2(-14.5,-30.))/vec2(29./9.,17./6.);
      vec2 tile=floor(tiles), local=fract(tiles),gap=min(local,1.-local)*vec2(29./9.,17./6.);
      float joint=smoothstep(.031,.095,min(gap.x,gap.y));
      vec2 seed=fract(vec2(dot(tile,vec2(.382,.691)),dot(tile,vec2(.754,.427)))+vec2(.17,.39));
      float beds=sin(p.y*1.21+p.x*.63)+.53*sin(p.y*2.19-p.x*1.36)+.24*cos(p.x*2.29+p.y*.76);
      float small=sin(dot(p,vec2(7.1,2.9))+.7*sin(p.y*4.3))*.56+.44*sin(p.y*5.8-p.x*3.3);
      // A thin waterline intersects the crown and the slumped corner of each
      // slab. A second depression follows its draining edge. Dry humps cut
      // silhouettes out of a puddle; low seams join across adjacent slabs.
      vec2 sink=vec2(.17+.68*seed.x,.20+.63*seed.y), off=local-sink;
      float bowl=dot(off,off*vec2(1.43,.88))+.043*beds+.021*small;
      float depression=.144+.058*(seed.y-.45)-bowl;
      float gutter=(.074-min(gap.x,gap.y))*.72-.025+.031*beds;
      // Connected alluvial trough from the doorway to the drain, not a
      // repeated island in the centre of every concrete tile. Crowned
      // outer slabs keep their separate low corners and dry high spots.
      float reach=smoothstep(-24.1,-22.1,p.y)*(1.-smoothstep(-15.15,-12.7,p.y));
      float path=.22*sin(p.y*.73)+.44*cos(p.y*.46+.37);
      float breadth=1.32+.065*clamp(p.y+23.,0.,10.)+.21*beds;
      float channel=reach*(1.-smoothstep(.52,1.8,abs(p.x-path)/breadth));
      // Runoff collects in two shallow hollows between the wings and the
      // drain. The irregular shoreline belongs to the pavement.
      vec2 west=p-vec2(-4.98,-18.55),east=p-vec2(8.84,-14.65);
      west.x-=.58*west.y; east.x+=.29*east.y;
      vec2 wBasin=west/vec2(2.18,4.95),eBasin=east/vec2(2.03,1.95);
      float basin=1.-smoothstep(.67,1.10,min(dot(wBasin,wBasin),dot(eBasin,eBasin))+.095*beds+.037*small);
      // A longer connected run approaches the central amber pool. Dry
      // shoulders and slab seams still interrupt the reflected lamp.
      float runZ=clamp((p.y+22.9)/9.9,0.,1.);
      float runX=mix(-7.32,-1.37,runZ)+.32*sin(p.y*1.12);
      float runLane=(1.-smoothstep(.34,1.75,abs(p.x-runX)/(.66+.62*runZ)))
        *smoothstep(-23.4,-21.8,p.y);
      float level=max(depression,gutter)+channel*(.25+.035*small)+.32*max(basin,runLane);
      float soaked=smoothstep(-.026,.040,level);
      float puddle=soaked*smoothstep(-.041,.069,level);
      float glint=smoothstep(.13,.88,small)*soaked;
      // Project the reflected view ray onto the planes of the actual lobby,
      // higher work room and fire. From a high camera they move towards their
      // sources; from the side the jambs cross the water in correct parallax.
      vec3 incident=normalize(vWetCourt-cameraPosition);
      vec3 mirror=reflect(incident,normalize(vec3(.029*small+.018*beds,1.,.018*small-.022*beds)));
      float f=pow(1.-max(0.,-incident.y),2.);
      float sheet=puddle*(.24+.76*f);
      vec3 image=vec3(.020,.031,.045)*(1.+glint*.35);
      // Incoming drops bruise the reflected image. Rings are centimetric
      // and die toward the horizon rather than glittering as subpixels.
      vec2 dropGrid=vWetCourt.xz*2.35;
      vec2 cell=floor(dropGrid),jitter=vec2(crestHash(cell+.9),crestHash(cell+7.6));
      vec2 offset=fract(dropGrid)-(.27+.46*jitter);
      float phase=fract(uCourtTime*(.9+.51*jitter.y)+jitter.x*21.);
      float dist=length(offset);
      float ring=(1.-smoothstep(.024,.090,abs(dist-.37*phase)))*
        smoothstep(.035,.14,phase)*(1.-smoothstep(.53,.96,phase))*
        (1.-smoothstep(.085,.27,length(fwidth(dropGrid))))*soaked;
      float glancing=waterCrest(vWetCourt.xz+.032*vec2(ring,-ring),8.8);
      vec2 burnUV=(p-vec2(1.,-24.))/vec2(7.8,6.7);
      float emberVis=(all(greaterThan(burnUV,vec2(0.)))&&all(lessThan(burnUV,vec2(1.))))?texture2D(uBurnMask,burnUV).r:1.;
      if(mirror.z<-.04){
        vec2 xy=vWetCourt.xy;
        vec2 lobby=xy+mirror.xy*((-24.91-p.y)/mirror.z);
        vec2 room=xy+mirror.xy*((-23.44-p.y)/mirror.z);
        vec2 gate=xy+mirror.xy*((-22.18-p.y)/mirror.z);
        vec2 ember=xy+mirror.xy*((-22.49-p.y)/mirror.z);
        float pass=(1.-smoothstep(1.62,1.92,abs(gate.x)))*smoothstep(.45,.66,gate.y)*(1.-smoothstep(2.32,2.49,gate.y));
        float door=(1.-smoothstep(.64,1.55,abs(lobby.x)))*smoothstep(.28,.52,lobby.y)*(1.-smoothstep(2.08,2.30,lobby.y))*pass;
        float front=step(-23.44,p.y);
        float spine=smoothstep(.025,.12,abs(fract((room.x+3.914)/.87+.5)-.5));
        float office=(1.-smoothstep(1.48,1.78,abs(room.x)))*(1.-smoothstep(.18,.32,abs(room.y-5.77)))*spine;
        float cool=(1.-smoothstep(.62,.89,abs(room.x+3.05)))*(1.-smoothstep(.24,.48,abs(room.y-4.26)))*spine;
        vec2 fireUV=(ember-vec2(3.83,.70))/vec2(.91,.78);
        float fire=1.-smoothstep(.31,1.25,dot(fireUV,fireUV)+.12*beds);
        // Reflect the actual lowered entrance sign, across interrupted,
        // grazing ribbons of water rather than a full-width orange decal.
        vec3 signSource=${neonCenter};
        vec2 signHit=xy+mirror.xy*((signSource.z-p.y)/mirror.z)-signSource.xy;
        float metalSign=(1.-smoothstep(${neonHalfWidth}-.36,${neonHalfWidth}-.17,abs(signHit.x)))
          *(1.-smoothstep(.24,.35,abs(signHit.y)))
          *smoothstep(.16,.50,abs(fract(signHit.x*1.3+.25)-.5))
          *smoothstep(-.45,.6,small);
        // Rain-scalloped facets widen the narrow true mirror image.
        float hitX=clamp(signHit.x,-${neonHalfWidth}+.16,${neonHalfWidth}-.16);
        vec3 lampRay=normalize(signSource+vec3(hitX,0.,0.)-vWetCourt);
        vec3 halfway=normalize(lampRay-incident);
        vec2 slope=halfway.xz/max(.05,halfway.y);
        vec2 mismatch=(slope-vec2(.037*small+.018*beds,.048*small-.055*beds))/vec2(.12,.295);
        float lobe=exp(-dot(mismatch,mismatch)*1.30);
        float ends=1.-smoothstep(${neonHalfWidth}-.32,${neonHalfWidth}+1.84,abs(signHit.x));
        float streak=waterCrest(vWetCourt.xz,3.7)*(.48+.52*smoothstep(-.6,.69,small));
        float slots=.63+.37*smoothstep(.12,.48,abs(fract(hitX*1.31+.25)-.5));
        float reflected=(metalSign*1.24+lobe*ends*streak*slots*1.72)*joint;
        image+=uLitLobby*front*reflected*vec3(1.79,.282,.053);
        image+=uLitLobby*front*(door*vec3(.92,.46,.14)+office*vec3(.87,.31,.065)+cool*vec3(.18,.36,.44))
          +step(-22.49,p.y)*fire*emberVis*vec3(1.4,.47,.077);
        // Broad, low-frequency entrance reflection remains between narrow
        // broken highlights. It tracks the viewpoint and disappears with the
        // archive's practical lights. Concrete joints interrupt its runout.
        float toStreet=clamp((p.y+22.4)/9.4,0.,1.);
        float slip=cameraPosition.x*toStreet*.28 + .16*sin(p.y*.85);
        float lane=exp(-pow(abs(p.x-slip)/(.73+.64*toStreet),1.5));
        float part=.22+.24*smoothstep(-.67,.81,beds)+glancing*(.81+.29*glint)+ring*.48;
        image+=uLitLobby*channel*lane*part*(.75+.25*joint)*vec3(1.28,.30,.083);
      }
      if(max(basin,runLane)>.001){
        // Rough water returns light from the real glass toward the camera.
        // A tighter cross-slope breaks each long streak into ripple crests.
        vec3 source=p.x<0.?${streetSource}:${dispatchSource};
        float power=p.x<0.?uStreetPower:uDispatchPower;
        vec3 toward=source-vWetCourt;
        vec3 halfRay=normalize(normalize(toward)-incident);
        vec2 axis=normalize(toward.xz),side=vec2(axis.y,-axis.x);
        vec2 tilt=halfRay.xz/max(.06,halfRay.y);
        float along=dot(tilt,axis)-.052*beds;
        float across=dot(tilt,side)-.036*small;
        float lobe=exp(-across*across*(p.x<0.?15.:41.)-along*along*2.85);
        float crest=waterCrest(vWetCourt.xz+vec2(.029*sin(uCourtTime*1.4+p.y),.032*ring),5.4);
        float broken=.18+.80*crest+.39*glint+.25*ring;
        image+=max(basin,runLane)*(vec3(.018,.041,.057)+power*lobe*broken*vec3(.72,2.0,2.4))*(.50+.50*joint);
      }
      image+=uStreetPower*runLane*(.18+1.38*glancing+.51*glint+.32*ring)
        *vec3(.28,.99,1.34)*(.32+.68*joint);
      image+=ring*vec3(.051,.083,.113);
      float lampReturn=max(image.r,max(image.g,image.b));
      image+=wetEclipse(mirror,glancing)*(1.-smoothstep(.16,.65,lampReturn));
      totalEmissiveRadiance+=image*sheet;
      ${aggregate?`vec3 gravel=texture2D(uAggregate,vWetCourt.xz*.42+vec2(.13,.32)).rgb;
      float grit=dot(gravel,vec3(.28,.55,.17));
      diffuseColor.rgb*=mix(.52+grit*3.55, .86+grit*.81,soaked);
      // A street-side, shallow wet sheen picks up broken warm bands from the portico.
      // The source is local to the lit doorway and is interrupted by dry gravel.
      float apron=exp(-abs(p.x)*.73)*smoothstep(-25.,-22.,p.y)*(1.-smoothstep(-15.,-8.,p.y));
      float cr=waterCrest(vWetCourt.xz+.34*gravel.rg,4.2);
      totalEmissiveRadiance+=uLitLobby*apron*soaked*cr*(.12+.88*joint)*vec3(1.04,.288,.068);`:''}
      diffuseColor.rgb*=mix(.75,1.,joint)*mix(1.,.50,puddle);
      // Only the eastern slump accumulates coal wash, fallen concrete dust
      // and runoff in two low hollows. Dust tapers away from the breach; no
      // global grunge and no new decal draw over the bright objective path.
      if(p.x>1.8 && p.x<8.4 && p.y>-24.1 && p.y<-17.6){
        vec2 r=p-vec2(3.82,-22.82);
        float forward=dot(r,vec2(.46,.89)), across=dot(r,vec2(.89,-.46));
        float scallop=.15*beds+.11*sin(across*8.7-forward*4.1);
        float fan=smoothstep(-1.0,-.20,forward)*(1.-smoothstep(2.5,4.8,forward))
          *(1.-smoothstep(.40,1.0,abs(across)/(.90+.26*max(0.,forward))+scallop));
        float coal=(1.-smoothstep(.32,1.48,length(r*vec2(.78,1.0))+.16*beds))*fan;
        diffuseColor.rgb*=1.-.64*coal;
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.78,.63,.48),fan*(.41+.17*beds));
        vec2 w1=(p-vec2(5.52,-20.43))/vec2(1.13,.59),w2=(p-vec2(3.76,-19.06))/vec2(.79,.39);
        float water=1.-smoothstep(.70,1.08,min(dot(w1,w1),dot(w2,w2))+.26*beds);
        diffuseColor.rgb*=1.-.42*water;
        totalEmissiveRadiance+=water*(vec3(.018,.031,.043)+glint*soaked*vec3(.042,.053,.060));
      }
    `);
  };
  material.customProgramCacheKey=()=>'ghost-signal-optical-apron-storm-10';
  reflectWeapons(material,'vWetCourt','puddle*(.42+.58*joint)');
  return {material,online,dispatchOnline,stormAge};
}

// Clip only the part of the building between the chase lens and the tank.
// The sightline provider updates after camera follow, including a rear-view flip.
// View-space offsets keep the opening centered during a shoulder orbit.
function applyBuildingCutaway(material: THREE.Material, sight: ReturnType<typeof useFoliageSightline>) {
  if (!sight) return;
  const compile = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey;
  const key = cacheKey.call(material);
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.uCoverTank = sight.foliageSubject;
    shader.uniforms.uCoverEnabled = sight.foliageSightlineEnabled;
    shader.vertexShader = 'uniform vec3 uCoverTank; varying vec3 vCoverOffset;\n' + shader.vertexShader
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        vec3 tankView = (viewMatrix * vec4(uCoverTank + vec3(0., .45, 0.), 1.)).xyz;
        vec2 sightCenter = tankView.xy * (mvPosition.z / min(-.1, tankView.z));
        vCoverOffset = vec3(mvPosition.xy - sightCenter, mvPosition.z - tankView.z);`);
    shader.fragmentShader = 'uniform float uCoverEnabled; varying vec3 vCoverOffset;\n' + shader.fragmentShader
      .replace(/void main\s*\(\s*\)\s*\{/, `void main() {
        if (vCoverOffset.z > 0. && uCoverEnabled > .001) {
          float radius = length(vCoverOffset.xy * vec2(.82, 1.));
          float cut = (1. - smoothstep(2.35, 2.85, radius)) * uCoverEnabled;
          vec2 pixel = floor(gl_FragCoord.xy * .5);
          float ink = fract(dot(vec2(.06711056, .00583715), pixel));
          if (cut > fract(52.9829189 * ink)) discard;
        }`);
  };
  material.customProgramCacheKey = () => key + '-chase-cutaway';
  material.needsUpdate = true;
  return () => {
    material.onBeforeCompile = compile;
    material.customProgramCacheKey = cacheKey;
    material.needsUpdate = true;
  };
}

function ArchiveAlarmRails({archives, material}:{archives:readonly EmbassyArchive[]; material:THREE.Material}) {
  const signal=useMemo(()=>{
    const paddle=createArchiveAlarmPaddle();
    const mesh=new THREE.InstancedMesh(paddle,material,EMBASSY_ARCHIVE_SLOTS.length);
    mesh.name='archive-door-alarm-wickets';
    return {mesh,paddle,update:createPreparedArchiveAlarmDriver(mesh)};
  },[material]);
  // Same clock as attackEmbassyArchive. A still scene with no further hits
  // retires the last signal at its deadline without scheduling a React update.
  useFrame(()=>signal.update(archives,Date.now()));
  useEffect(()=>()=>{signal.mesh.dispose();signal.paddle.dispose();},[signal]);
  return <primitive object={signal.mesh} dispose={null}/>;
}

export function EmbassyDefense({archives}: {archives:readonly EmbassyArchive[]}) {
  const [plaster,aggregate]=useLoader(THREE.TextureLoader,[
    '/images/textures/compound-plaster-v2.png','/images/textures/compound-aggregate-v2.png']);
  useMemo(()=>{for(const t of [plaster,aggregate]){t.colorSpace=THREE.SRGBColorSpace;
    t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.NearestFilter;
    t.minFilter=THREE.LinearMipmapLinearFilter;t.anisotropy=4;t.needsUpdate=true;}},[plaster,aggregate]);
  const sight = useFoliageSightline();
  const emissiveEffects = useRef<THREE.Group>(null);
  // Flame and smoke batches own their animated materials. Decorate them once
  // in place so their frame clocks and shared instance buffers keep updating.
  useLayoutEffect(() => {
    const materials = new Set<THREE.Material>();
    emissiveEffects.current?.traverse(object => {
      if (object instanceof THREE.Mesh && !Array.isArray(object.material)) materials.add(object.material);
    });
    const restore = Array.from(materials, material => applyBuildingCutaway(material, sight));
    return () => restore.forEach(undo => undo?.());
  }, [sight]);
  const checkpointMasonry = useMemo(() => {
    const material = MASONRY.clone();
    material.onBeforeCompile = MASONRY.onBeforeCompile;
    material.customProgramCacheKey = MASONRY.customProgramCacheKey;
    applyBuildingCutaway(material, sight);
    return material;
  }, [sight]);
  useEffect(() => () => checkpointMasonry.dispose(), [checkpointMasonry]);
  const signal = useMemo(() => {
    const material = ARCHIVE_SIGNAL.clone();
    material.onBeforeCompile = ARCHIVE_SIGNAL.onBeforeCompile;
    applyBuildingCutaway(material, sight);
    return material;
  }, [sight]);
  useEffect(() => () => signal.dispose(), [signal]);
  const burn=useMemo(createBurnOcclusion,[]);
  const masonry=useMemo(()=>{
    const m=MASONRY.clone();m.onBeforeCompile=s=>paintConcrete(s,burn,plaster);
    m.customProgramCacheKey=()=>'ghost-archive-masonry-chipped-v5';
    applyBuildingCutaway(m, sight); return m;
  },[burn,plaster,sight]);
  const streetLamp=useMemo(createStreetlamp,[]);
  useEffect(()=>()=>streetLamp.dispose(),[streetLamp]);
  const facade=useMemo(()=>{
    const m=MASONRY.clone();m.onBeforeCompile=s=>paintConcrete(s,burn,plaster,true,streetLamp.power);
    m.customProgramCacheKey=()=>'embassy-lit-facade-v2';
    applyBuildingCutaway(m, sight); return m;
  },[burn,plaster,streetLamp,sight]);
  useEffect(()=>()=>facade.dispose(),[facade]);
  const wetCourt=useMemo(()=>createWetCourt(burn,aggregate,streetLamp.power),[burn,aggregate,streetLamp]);
  const wingLight=useMemo(() => {
    const light = createAnnexFirelight();
    applyBuildingCutaway(light.interiorMaterial, sight);
    return light;
  }, [sight]);
  const colors=useMemo(createEmbassyColors,[]);
  useFrame(({clock})=>{wetCourt.stormAge.value=clock.elapsedTime;colors.time.value=clock.elapsedTime;streetLamp.advance(clock.elapsedTime);});
  useEffect(()=>()=>{colors.pole.dispose();colors.cloth.dispose();colors.material.dispose();colors.map.dispose();},[colors]);
  useEffect(()=>()=>{wingLight.interiorGeometry.dispose();wingLight.interiorMaterial.dispose();},[wingLight]);
  useEffect(()=>()=>{masonry.dispose();burn.dispose();},[burn,masonry]);
  const chanceryOnline=archives.some(a=>a.id==='chancery'&&a.health>0);
  useEffect(()=>{wetCourt.online.value=chanceryOnline?1:0;},[chanceryOnline,wetCourt]);
  const dispatchOnline=archives.some(a=>a.id==='dispatch'&&a.health>0);
  useEffect(()=>{wetCourt.dispatchOnline.value=dispatchOnline?1:0;},[dispatchOnline,wetCourt]);
  useEffect(()=>()=>wetCourt.material.dispose(),[wetCourt]);
  const geometry=useMemo(()=>({chancery:createEmbassyBuildingGeometry(true,false,'chancery'),
    records:createEmbassyBuildingGeometry(false,false,'records'),dispatch:createEmbassyBuildingGeometry(false,false,'dispatch'),
    ruins:createEmbassyBuildingGeometry(false,true),
    recordsShell:createEmbassyBuildingGeometry(false,true,'records'),dispatchShell:createEmbassyBuildingGeometry(false,true,'dispatch'),
    track:createEmbassyServiceTrack(),
    chanceryNeon:createEmbassyNeon(),chancerySignal:createGhostSignalArchive('chancery'),recordsSignal:createGhostSignalArchive('records'),
    dispatchSignal:createGhostSignalArchive('dispatch'),
    ...createEmbassyGroundworks(),...createEmbassyCheckpoint()}),[]);
  useEffect(()=>()=>Object.values(geometry).forEach(g=>g.dispose()),[geometry]);
  return <group name="embassy-defense" dispose={null}>
    <mesh name="records-streetlamp-glass" geometry={streetLamp.bulb} material={streetLamp.glass}/>
    <primitive object={streetLamp.halo} dispose={null}/>
    <mesh name="embassy-halyard-and-staff" geometry={colors.pole} material={MASONRY} castShadow receiveShadow/>
    <mesh name="embassy-50-star-colors" geometry={colors.cloth} material={colors.material}/>
    <mesh name="annex-lit-interiors-and-rubble-fires" geometry={wingLight.interiorGeometry} material={wingLight.interiorMaterial}/>
    <group ref={emissiveEffects}>
      <EmbassyFires pockets={wingLight.pockets}/>
      <mesh geometry={geometry.practicals}><meshBasicMaterial vertexColors toneMapped={false}/></mesh>
    </group>
    <mesh name="compound-breached-walls" geometry={geometry.walls} material={masonry} castShadow receiveShadow />
    <mesh name="embassy-road-checkpoint" geometry={geometry.checkpoint} material={checkpointMasonry} receiveShadow/>
    <mesh name="embassy-service-track" geometry={geometry.track} material={TRACK_SOIL} receiveShadow />
    <mesh name="compound-drained-apron" geometry={geometry.court} material={wetCourt.material} receiveShadow />
    <ArchiveAlarmRails archives={archives} material={checkpointMasonry}/>
    {EMBASSY_ARCHIVE_SLOTS.map(slot=>{
      const archive=archives.find(item=>item.id===slot.id);
      const lost=!archive||archive.health<=0;
      return <group key={slot.id} position={slot.position}>
        <mesh name={`embassy-${slot.id}-masonry`}
          geometry={lost?(slot.id==='chancery'?geometry.ruins:geometry[`${slot.id}Shell`]):geometry[slot.id]}
          material={lost?masonry:facade} castShadow receiveShadow />
        {!lost && <mesh name={`ghost-signal-${slot.id}-online`} geometry={geometry[`${slot.id}Signal`]} material={signal}/>}
        {!lost && slot.id==='chancery' && <mesh name={CHANCERY_NEON.text} geometry={geometry.chanceryNeon} material={signal}/>}
      </group>;
    })}
  </group>;
}
