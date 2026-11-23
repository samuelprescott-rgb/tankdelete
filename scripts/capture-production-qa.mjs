// Browser-only QA of built, virtual gameplay. Node 22+, npm run build, and a
// dedicated local Chromium with remote debugging enabled are prerequisites.
// node scripts/capture-production-qa.mjs --cdp-port 9226 --width 800 --height 600
// Add --existing-preview-port 1423 to use an existing verified local preview.
// Add --napalm-impact --width 1920 --height 1080 for a stationary two-strike
// production measurement instead of the normal drive/cannon route (Boot Camp).
// Default aims at clear terrain. Use --impact-aim-x 960 --impact-aim-y 489
// --impact-expect targets for a separate simulated target-stress experiment.
// Add --impact-trace for diagnostics only; leave it off for acceptance timing.
// Add --impact-pointer-probe to count native coordinate reads on trusted downs.
// Add --impact-shader-probe to identify programs linked from startup to strike.
// Add --mode horde --horde-visibility for matched stationary Wave 1 photos.
// Add --sector-photos --drive-crossing --drive-video for a real tab-only MP4.
import { parseArgs } from 'node:util';
import { qaArtifactFiles } from './qa-artifact-files.mjs';
import {playVirtualCampaign} from './campaign-journey-qa.mjs';
import {capturePeakHorde} from './peak-horde-qa.mjs';
import {createDriveVideo,createScreenshotCapture} from './drive-video-qa.mjs';
import { readFile, mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const { values: flags } = parseArgs({options: {
  'cdp-port': {type:'string', default:'9226'}, 'preview-port': {type:'string', default:'4173'},
  'existing-preview-port': {type:'string'}, 'dist-dir': {type:'string'}, width:{type:'string',default:'800'},
  height:{type:'string',default:'600'}, mode:{type:'string',default:'boot'},
  'warmup-ms':{type:'string', default:'8000'},
  'mark-x':{type:'string'}, 'mark-y':{type:'string'},
  'horde-visibility':{type:'boolean',default:false},
  'raid-review':{type:'boolean',default:false},
  'early-approach':{type:'boolean',default:false},
  'playing-hud-film':{type:'boolean',default:false},
  'raid-response':{type:'string'},
  'contact-response':{type:'boolean',default:false},
  'defense-journey':{type:'string'},
  'offline-world':{type:'boolean',default:false},
  'sector-photos':{type:'boolean',default:false},
  'hero-photos':{type:'boolean',default:false},
  'field-photos':{type:'boolean',default:false},
  'pin-field-leads':{type:'boolean',default:false},
  'portrait-turns':{type:'boolean',default:false},
  'peak-horde':{type:'boolean',default:false},
  'observe-raid':{type:'boolean',default:false},
  'crawler-shot':{type:'boolean',default:false},
  'drive-crossing':{type:'boolean',default:false},
  'trail-photos':{type:'string'},
  'post-budget':{type:'boolean',default:false},
  'drive-video':{type:'boolean',default:false},
  orbit:{type:'boolean', default:false},
  'napalm-impact':{type:'boolean', default:false},
  'impact-aim-x':{type:'string'},'impact-aim-y':{type:'string'},'impact-expect':{type:'string'},
  'impact-pointer-probe':{type:'boolean',default:false},
  'impact-shader-probe':{type:'boolean',default:false},
  'impact-attribution':{type:'boolean',default:false},
  'impact-trace':{type:'boolean',default:false},
  'impact-disarm-between':{type:'boolean',default:false},
  'impact-flat-notices':{type:'boolean',default:false},
  'impact-max-frame-ms':{type:'string'},
}});
const integer = (key, min, max) => {
  const n = Number(flags[key]);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error('Invalid --' + key);
  return n;
};
const port = integer(flags['existing-preview-port'] ? 'existing-preview-port' : 'preview-port', 1024, 65535);
const cdpPort = integer('cdp-port', 1024, 65535);
const width = integer('width', 480, 7680), height = integer('height', 400, 4320);
const warmup = integer('warmup-ms', 1000, 60000);
const mode = flags.mode;
if (!['boot','horde'].includes(mode) || port === 1420 || port === cdpPort) throw new Error('Expected virtual boot/horde mode and a separate preview port (not 1420 or CDP).');
const markRequested = flags['mark-x'] !== undefined || flags['mark-y'] !== undefined;
const hordeVisibility = flags['horde-visibility'];
if(flags['raid-review']&&!hordeVisibility)throw Error('Raid review requires the real horde visibility route');
if(flags['early-approach']&&!flags['raid-review'])throw Error('Early approach is a separate version of the HUD-free raid review');
if(flags['playing-hud-film']&&(!flags['raid-review']||flags['early-approach']))throw Error('Playing HUD film needs the standard four-shot raid route');
const raidPolicy=flags['raid-response'];
const journeyPolicy=flags['defense-journey'];
if(journeyPolicy&&(!['watch','defend','relief'].includes(journeyPolicy)||mode!=='horde'||hordeVisibility||raidPolicy||flags['peak-horde']))throw Error('Defense journey requires standalone earned horde');
if(flags['offline-world']&&flags['existing-preview-port'])throw Error('Offline test requires its own local server with enforced CSP');
if(raidPolicy&&(!['answer','ignore'].includes(raidPolicy)||mode!=='horde'||hordeVisibility||flags['peak-horde']))throw Error('Raid response requires a separate local horde replay');
const sectorPhotos = flags['sector-photos'];
if(flags['hero-photos']&&!sectorPhotos)throw new Error('Hero comparison requires virtual sector photos');
if(flags['field-photos']&&!sectorPhotos)throw new Error('Field comparison requires virtual sector photos');
if(flags['pin-field-leads']&&!flags['field-photos'])throw Error('Pinned portraits require --field-photos');
if(flags['portrait-turns']&&!flags['pin-field-leads'])throw Error('Turnaround requires the same named, living field actors');
if(flags['drive-crossing']&&!sectorPhotos)throw new Error('Drive crossing follows the stationary virtual Boot Camp sector photos only');
if(flags['trail-photos']&&(!flags['drive-crossing']||!['before','after'].includes(flags['trail-photos'])))throw Error('Tread photos require a real crossing, explicitly before or after');
if(flags['post-budget']&&!flags['peak-horde'])throw Error('Draw census belongs strictly after peak measurement');
if(flags['drive-video']&&(!flags['drive-crossing']||width%2||height%2))throw Error('Drive video requires --sector-photos --drive-crossing and even viewport dimensions');
if(sectorPhotos&&(mode!=='boot'||markRequested||flags.orbit||flags['napalm-impact']))throw new Error('Sector photos require unmodified virtual Boot Camp');
if(hordeVisibility&&(mode!=='horde'||markRequested||flags.orbit||flags['napalm-impact']))throw new Error('Visibility shots require the stationary virtual Horde route');
const impactRequested=flags['napalm-impact'];
if(flags['contact-response']&&(mode!=='boot'||sectorPhotos||impactRequested||markRequested||flags.orbit))throw Error('Localized contacts require a separate, ordinary Boot Camp drive');
if(impactRequested&&(mode!=='boot'||markRequested||flags.orbit))throw new Error('Impact route is standalone, virtual Boot Camp only');
const customImpactAim=flags['impact-aim-x']!==undefined||flags['impact-aim-y']!==undefined;
if(!impactRequested&&(customImpactAim||flags['impact-expect']||flags['impact-attribution']||flags['impact-trace']||flags['impact-pointer-probe']||flags['impact-shader-probe']||flags['impact-disarm-between']||flags['impact-flat-notices']||flags['impact-max-frame-ms']))throw new Error('Impact options require --napalm-impact');
const impactAim=customImpactAim?{x:integer('impact-aim-x',0,width-1),y:integer('impact-aim-y',0,height-1)}:null;
const impactExpect=flags['impact-expect']??(customImpactAim?'targets':'clear');
if(!['targets','clear','observe'].includes(impactExpect))throw new Error('Expected --impact-expect clear|targets|observe');
if(flags['impact-disarm-between']&&impactExpect!=='targets')throw new Error('Disarm-between control requires target-bearing workload');
const impactMaxFrame=flags['impact-max-frame-ms'] === undefined ? null : Number(flags['impact-max-frame-ms']);
if(impactMaxFrame !== null && (!Number.isFinite(impactMaxFrame)||impactMaxFrame<10||impactMaxFrame>250))throw new Error('Invalid --impact-max-frame-ms');
if(impactMaxFrame!==null&&(flags['impact-trace']||flags['impact-pointer-probe']||flags['impact-shader-probe']))throw new Error('Keep diagnostic probes separate from the frame-time gate');
if (markRequested && mode !== 'boot') throw new Error('Mark/disarm is only meaningful in virtual Boot Camp');
const markPoint = markRequested ? {x:integer('mark-x',0,width-1),y:integer('mark-y',0,height-1)} : null;
const origin = 'http://127.0.0.1:' + port;
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.resolve(root, flags['dist-dir'] ?? 'dist');
const base = path.join(root, 'tmp', 'production-qa');
const digest = b => createHash('sha256').update(b).digest('hex');
const resourcePolicy="default-src 'self'; script-src 'self' blob: 'unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self' blob: data:; frame-src 'none'";
const report = {scope:'Local production browser, virtual gameplay only. Not native, audio-quality, minimum-hardware, or release signoff.',
  mode, width, height, warmupMs:warmup, origin, startedAt:new Date().toISOString(),
  status:'incomplete', artifact:{}, checks:{}, phases:[], screenshots:[], warningsAndErrors:[], failedLoads:[]};
const round = n => +n.toFixed(3);
function renderedLabelState(){
  const c=document.querySelector('canvas[data-game-ui]'),key=Object.keys(c).find(k=>k.startsWith('__reactFiber$'));
  let tank;for(let f=c[key];f&&!tank;f=f.return)for(let h=f.memoizedState;h;h=h.next){
    if(h.memoizedState?.current?.name==='player-tank'){tank=h.memoizedState.current;break;}
  }
  const labels=[];tank?.__r3f?.root?.getState().scene.traverse(obj=>{
    if(!obj.isMesh||!obj.text?.length||!obj.textRenderInfo?.glyphBounds?.length)return;
    const ranges=obj.textRenderInfo.glyphBounds;let valid=0;
    for(let i=0;i<ranges.length;i+=4)if(ranges[i+2]>ranges[i]&&ranges[i+3]>ranges[i+1])valid++;
    if(valid)labels.push({text:obj.text,font:obj.font,glyphs:valid,instances:obj.geometry.instanceCount});
  });
  return {labels,violations:window.__qaCsp??[]};
}
function summarize(deltas) {
  if (!deltas.length) throw new Error('No frame samples');
  const sorted = [...deltas].sort((a,b) => a-b), q = p => round(sorted[Math.ceil(p * sorted.length)-1]);
  const totalMs = deltas.reduce((a,b)=>a+b,0);
  return {samples:deltas.length, durationMs:round(totalMs), effectiveRafHz:round(deltas.length*1000/totalMs),
    medianMs:q(.5), p95Ms:q(.95), p99Ms:q(.99), maxMs:q(1),
    over33_33ms:deltas.filter(x=>x>1000/30).length, over50ms:deltas.filter(x=>x>50).length, over100ms:deltas.filter(x=>x>100).length};
}

async function connect(onEvent) {
  const version = await (await fetch('http://127.0.0.1:'+cdpPort+'/json/version', {signal:AbortSignal.timeout(5000)})).json();
  const endpoint = new URL(version.webSocketDebuggerUrl);
  if (endpoint.protocol !== 'ws:' || !['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)
    || Number(endpoint.port) !== cdpPort) throw new Error('CDP must be a dedicated local browser endpoint');
  const socket = new WebSocket(endpoint), pending = new Map();
  await new Promise((ok, no)=>{
    const timer = setTimeout(()=>{socket.close();no(new Error('CDP connect timed out'));},8000);
    socket.onopen=()=>{clearTimeout(timer);ok();}; socket.onerror=()=>{clearTimeout(timer);no(new Error('CDP connection failed'));};
  });
  let seq = 0;
  socket.onmessage = ({data}) => {
    const m = JSON.parse(data);
    if (m.id === undefined) {onEvent(m);return;}
    const pendingCall = pending.get(m.id);
    if (!pendingCall) return;
    pending.delete(m.id); clearTimeout(pendingCall.timer);
    if (m.error) pendingCall.no(new Error(pendingCall.method+': '+m.error.message)); else pendingCall.ok(m.result);
  };
  socket.onclose = () => {for(const p of pending.values()) {clearTimeout(p.timer);p.no(new Error('CDP disconnected'));}pending.clear();};
  const send = (method,params={},sessionId=undefined)=>new Promise((ok,no)=>{
    const id=++seq;
    const timer=setTimeout(()=>{pending.delete(id);no(new Error(method+' timed out'));},45000);
    pending.set(id,{ok,no,timer,method});socket.send(JSON.stringify({id,method,params,sessionId}));
  });
  return {send, close:()=>socket.close(), version:version.Browser,
    // A process-specific fingerprint, not a live debugger URL.
    instance:digest(new URL(version.webSocketDebuggerUrl).pathname)};
}

// In-page probes read the public HUD, rendered minimap and existing WebGL context.
// Do not inject review controls, mock the native bridge, or change game state.
function installProbe() {
  const q=window.__tankQa={input:[], visibility:[], deltas:[], cells:[], marks:[], sampling:false, reloads:[], paintSizes:[]};
  for(const name of ['keydown','keyup','pointermove','pointerdown','pointerup']) {
    document.addEventListener(name,e=>q.input.push({t:performance.now(),type:e.type,
      key:e.code, x:e.clientX,y:e.clientY, trusted:e.isTrusted, tag:e.target?.tagName}),true);
  }
  document.addEventListener('visibilitychange',()=>q.visibility.push({t:performance.now(),hidden:document.hidden}));
  const cycle=document.querySelector('.weapon-cycle');
  new MutationObserver(()=>{
    const label=cycle?.querySelector('strong')?.textContent;
    if(label && label!==q.reloads.at(-1)?.label) q.reloads.push({t:performance.now(),label});
  }).observe(cycle,{subtree:true,childList:true,characterData:true,attributes:true});
  const canvas=document.querySelector('canvas[data-engine]');
  const raf=t=>{
    if(!q.sampling)return;
    if(q.prev!==null) q.deltas.push(t-q.prev);
    q.prev=t;
    const prior=q.paintSizes.at(-1);
    if(!prior || prior.width!==canvas.width || prior.height!==canvas.height) q.paintSizes.push({t,width:canvas.width,height:canvas.height});
    requestAnimationFrame(raf);
  };
  q.start=()=>{q.prev=null;q.sampling=true;q.startT=performance.now();requestAnimationFrame(raf);};
  q.stop=()=>{q.sampling=false;q.stopT=performance.now();};
  // Observe the centers of the stationary file/archive dots actually drawn on the
  // player-relative radar, not its animated sweep or moving actors. This wrapper
  // is local to the radar context and doesn't touch any drawing args or results.
  const ctx=document.querySelector('canvas[data-game-ui]').getContext('2d');
  const arc=ctx.arc,clear=ctx.clearRect;
  ctx.clearRect=function(...a){q.cells=[];return clear.apply(this,a);};
  ctx.arc=function(x,y,r,...rest){if(r===3)q.cells.push([Math.round(x*10)/10,Math.round(y*10)/10,String(this.fillStyle)]);return arc.call(this,x,y,r,...rest);};
  q.mark=label=>q.marks.push({label,t:performance.now(),radar:q.cells.slice(),breech:document.querySelector('.weapon-cycle strong')?.textContent});
}

function snapshot() {
  const nodes=s=>[...document.querySelectorAll(s)];
  const text=s=>document.querySelector(s)?.innerText?.trim() ?? null;
  const rect=e=>{const {x,y,width,height}=e.getBoundingClientRect();return {x,y,width,height};};
  const canvas=document.querySelector('canvas[data-engine]');
  const gl=canvas.getContext('webgl2');const debug=gl?.getExtension('WEBGL_debug_renderer_info');
  return {url:location.href, viewport:{width:innerWidth,height:innerHeight,devicePixelRatio,hidden:document.hidden},
    canvas:{...rect(canvas),bufferWidth:canvas.width,bufferHeight:canvas.height,engine:canvas.dataset.engine,
      version:gl?.getParameter(gl.VERSION),vendor:gl?.getParameter(gl.VENDOR),renderer:gl?.getParameter(gl.RENDERER),
      unmaskedVendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):null,unmaskedRenderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,
      contextLost:gl?.isContextLost()},
    hud:{header:text('.header h2'),simulation:text('.training-badge'),mission:text('.mission-order'),armor:text('.armor-status'),armed:!!document.querySelector('[aria-label="Armed file targets"]'),
      weapon:text('.weapon-selector [aria-pressed="true"]'),breech:text('.weapon-cycle strong'),radio:text('.field-radio-copy'),
      radioButton:document.querySelector('.field-radio-mute')?.getAttribute('aria-label'),controls:text('.controls-ribbon'),
      panels:nodes('.hud,.header,.controls-ribbon,canvas[data-game-ui],.scene-settings').map(e=>({
        panel:e.className||e.tagName,rect:rect(e),scrollHeight:e.scrollHeight,clientHeight:e.clientHeight})),
      buttonHitTests:nodes('.hud button,.header button,.scene-settings button').map(e=>{
        const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);
        return {name:e.getAttribute('aria-label')||e.title||e.innerText,rect:rect(e),
          disabled:e.disabled,centerHit:e.contains(hit),centerTarget:hit?.className||hit?.tagName||null};
      }),
      nightmare:!!document.querySelector('.nightmare-order'),
      reviewControls:!!document.querySelector('[aria-label="Scene inspection views"]')}};
}

// Photo route only. Anchor on the actual mounted live-wave HUD, not on a
// guessed countdown or selector poll. Do not change clocks or combat state.
function watchHordeWave() {
  const enter=()=>{
    if(!document.querySelector('.nightmare-order.is-combat'))return;
    window.__qaHordeWaveStart=performance.now();
    observer.disconnect();
  };
  const observer=new MutationObserver(enter);
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  enter();
}

function hordePhotoState(photoProof=false) {
  const radar=document.querySelector('canvas[data-game-ui]');
  // Read the real radar inputs for range metadata, never set state or alter a
  // pose. If this test fixture stops matching React's DOM structure, fail.
  const key=radar&&Object.keys(radar).find(key=>key.startsWith('__reactFiber$'));
  let fiber=key&&radar[key], props, group;
  for(;fiber;fiber=fiber.return){
    const value=fiber.memoizedProps;
    if(value?.zombiePosesRef?.current instanceof Map&&value?.tankStateRef?.current)props??=value;
    for(let hook=fiber.memoizedState;hook;hook=hook.next){
      const object=hook.memoizedState?.current;
      if(object?.isGroup&&object.name==='player-tank')group??=object;
    }
    if(props&&group)break;
  }
  const world=document.querySelector('canvas[data-engine]');
  const r3f=group?.__r3f?.root?.getState();
  if(!props||!r3f?.camera||r3f.gl.domElement!==world)throw new Error('Cannot read live radar contacts and chase camera');
  const { camera }=r3f;
  // Record the real raider assignment from the mounted encounter. Do not
  // manufacture an actor, move it, change the camera, or infer roles by ID.
  const container=document.querySelector('.scene-container');
  const containerKey=Object.keys(container).find(k=>k.startsWith('__reactProps$'));
  function hordeProps(el){
    if(!el)return;
    if(Array.isArray(el)){for(const v of el){const x=hordeProps(v);if(x)return x;}return;}
    const p=el.props;
    if(p?.onArchiveHit&&p.zombies&&p.posesRef&&p.archives)return p;
    return hordeProps(p?.children);
  }
  const assignment=hordeProps(container[containerKey]?.children);
  if(!assignment)throw Error('Could not read actual mounted horde roles');
  const tank=props.tankStateRef.current;
  const [x,,z]=tank.position;
  const relief=()=>{
    const aircraft=r3f.scene.getObjectByName('rook-relief-transport');
    const crate=r3f.scene.getObjectByName('roadside-supply-crates');
    const ray=new r3f.raycaster.constructor();
    const locate=(o,y=0)=>{
      const p=o.getWorldPosition(group.position.clone());p.y+=y;
      const xyz=p.toArray(),ndc=p.clone().project(camera),screen=[(ndc.x+1)*world.clientWidth/2,(1-ndc.y)*world.clientHeight/2];
      return {xyz,screen,inView:Math.abs(ndc.x)<.96&&Math.abs(ndc.y)<.92&&Math.abs(ndc.z)<1&&document.elementFromPoint(...screen)===world};
    };
    const unobstructed=(o,y)=>{
      const p=o.getWorldPosition(group.position.clone());p.y+=y;
      const dir=p.clone().sub(camera.position);ray.near=0;ray.far=dir.length()-.06;
      ray.set(camera.position,dir.normalize());
      const solids=[crate,aircraft?.visible&&aircraft.getObjectByName('huey-flying-airframe')].filter(Boolean);
      return !ray.intersectObjects(solids,true).length;
    };
    const deployed=assignment.friendliesRef.current.filter(p=>p.id.startsWith('lift-'));
    const passengers=deployed.filter(p=>p.alive).flatMap(p=>{
      const o=r3f.scene.getObjectByName(p.id);
      if(!o?.visible||!o.getObjectByName('us-field-infantry-volume')?.isSkinnedMesh)return [];
      let flash=false;o.traverse(c=>{if(c.isMesh&&c.renderOrder===87&&c.visible)flash=true;});
      const boot=locate(o,.04),road=locate(o,.04-o.position.y);
      return [{id:p.id,health:p.health,flash,rounds:o.userData.reliefRounds??0,
        bootsVisible:unobstructed(o,.04),chestVisible:unobstructed(o,.56),boot,road,feet:o.position.toArray(),...locate(o,.56)}];
    });
    if(!aircraft)return {air:null,passengers,deployed:deployed.length};
    // Three real model-space extremities, not a proposed camera or screen size.
    const rotor=aircraft.getObjectByName('huey-main-rotor'),tail=aircraft.getObjectByName('huey-tail-rotor');
    const hub=locate(rotor),fin=locate(tail);
    let photo=null;
    if(photoProof){
      const intro=document.querySelector('.nightmare-takeover'),style=intro&&getComputedStyle(intro);
      const anim=intro?.getAnimations().find(a=>a.animationName==='nightmare-signal-envelope');
      const opacity=style?Number(style.opacity):0;
      const title={mounted:!!intro,opacity,state:anim?.playState??null,
        clear:!intro||anim?.playState==='finished'&&opacity<.005};
      const box=[Infinity,Infinity,-Infinity,-Infinity],v=group.position.clone(),rect=world.getBoundingClientRect();
      let nearCut=false;
      if(aircraft.visible)aircraft.getObjectByName('huey-flying-airframe').traverse(o=>{
        if(!o.isMesh||!o.visible)return;const pos=o.geometry.getAttribute('position');
        for(let i=0;i<pos.count;i++){
          v.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld).project(camera);
          const x=rect.left+(v.x+1)*rect.width/2,y=rect.top+(1-v.y)*rect.height/2;
          box[0]=Math.min(box[0],x);box[1]=Math.min(box[1],y);box[2]=Math.max(box[2],x);box[3]=Math.max(box[3],y);
          nearCut ||= Math.abs(v.z)>=1;
        }
      });
      const overlaps=[];
      for(const e of document.querySelectorAll('[data-game-ui]:not(.game-notifications),.game-notifications__card,.game-notifications__custom,.achievement-toast')){
        const r=e.getBoundingClientRect(),style=getComputedStyle(e);
        if(!r.width||!r.height||style.visibility==='hidden'||Number(style.opacity)<.02)continue;
        if(box[0]<r.right+3&&box[2]>r.left-3&&box[1]<r.bottom+3&&box[3]>r.top-3)overlaps.push(e.className||e.tagName);
      }
      photo={title,modelRect:aircraft.visible?box:null,overlaps,uncovered:aircraft.visible&&!nearCut&&!overlaps.length
        &&box[0]>=rect.left+4&&box[1]>=rect.top+4&&box[2]<rect.right-4&&box[3]<rect.bottom-4};
    }
    const verge=locate(r3f.scene.getObjectByName('rook-door-work-lamp-pool')).xyz;
    return {air:{...locate(aircraft),visible:aircraft.visible,hub,fin,sill:locate(aircraft.getObjectByName('rook-near-sill'))},verge,passengers,deployed:deployed.length,photo};
  };
  const zombies=[...props.zombiePosesRef.current].filter(([,pose])=>pose.active).map(([id,pose])=>{
    const point=pose.position.clone();point.y+=1.2;
    const ground=pose.position.clone();ground.y=0;ground.project(camera);
    const distance=point.distanceTo(camera.position);
    point.project(camera);
    return {id,archetype:pose.archetype,archiveRunner:!!assignment.zombies.find(z=>z.id===id)?.archiveRunner,xyz:pose.position.toArray(),range:Math.hypot(pose.position.x-x,pose.position.z-z),
      distance,screen:[(point.x+1)*world.width/2,(1-point.y)*world.height/2],clipDepth:point.z,
      aim:[(ground.x+1)*world.clientWidth/2,(1-ground.y)*world.clientHeight/2]};
  });
  return {waveMs:performance.now()-window.__qaHordeWaveStart,hidden:document.hidden,
    archives:assignment.archives.map(a=>({id:a.id,health:a.health,attacked:a.underAttackUntil>Date.now()})),
    phase:document.querySelector('.nightmare-order')?.className,nightmareHud:document.querySelector('.nightmare-order')?.innerText,
    buffer:[world.width,world.height],tank:{x,z,rotationY:tank.rotation},relief:relief(),
    camera:{xyz:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov},zombies};
}

// QA inspection camera only. No material, geometry, visibility, time, lighting,
// or gameplay state is edited. Read anchors from the mounted production scene.
function sectorView(view,pinFieldLeads=false) {
  window.__qaFinishPhoto?.();
  if(!view)return;
  const radar=document.querySelector('canvas[data-game-ui]');
  const key=radar&&Object.keys(radar).find(k=>k.startsWith('__reactFiber$'));
  let tank;
  for(let f=key&&radar[key];f&&!tank;f=f.return)for(let h=f.memoizedState;h;h=h.next){
    const o=h.memoizedState?.current;if(o?.isGroup&&o.name==='player-tank'){tank=o;break;}
  }
  const store=tank?.__r3f?.root, state=store?.getState();
  if(!state||state.gl.domElement!==document.querySelector('canvas[data-engine]'))throw Error('Production tank missing');
  const {camera,scene}=state, point=(a)=>tank.position.clone().set(...a);
  if(view==='crawler-pose'){
    const target=scene.getObjectByName('arcade-range-crawler'),aim=target?.getObjectByName('arcade-range-crawler-aim');
    if(!target||!aim)throw Error('No mounted virtual crawler');
    const p=aim.getWorldPosition(point([0,0,0])).project(camera),r=state.gl.domElement.getBoundingClientRect();
    const x=r.x+(1+p.x)*r.width/2,y=r.y+(1-p.y)*r.height/2;
    return {x,y,power:target.userData.power,hits:target.userData.hits,reboots:target.userData.reboots,
      unobstructed:Math.abs(p.x)<1&&Math.abs(p.y)<1&&document.elementFromPoint(x,y)===state.gl.domElement};
  }
  let eye,at;
  if(view.startsWith('hero-')){
    // Inspection camera for the render only. Restore before the next input,
    // turret-aim, camera-follow or LOD update, even for the operator close-up.
    let anchor=tank,fieldActor;
    if(view.startsWith('hero-field')){
      const us=view.includes('-us-'),named=us?'field-infantry-head-review':'enemy-field-head-review';
      const visible=o=>{for(let n=o;n;n=n.parent)if(!n.visible)return false;return true;};
      // A fallen member stays mounted but is hidden. Never shoot an empty patch
      // of cover or make a dead character visible to manufacture a comparison.
      const options=[];
      scene.traverse(o=>{
        if(!(o.isBone&&(o.name===named||o.name==='head')&&visible(o)))return;
        for(let n=o.parent;n;n=n.parent){
          if((us?/^us-/:/^(enemy-infantry-review$|vc-)/).test(n.name)){options.push({o,id:n.name});break;}
        }
      });
      options.sort((a,b)=>a.id.localeCompare(b.id,'en'));
      const pick=options.find(x=>x.o.name===named)||(pinFieldLeads?null:options[0]);anchor=pick?.o;fieldActor=pick?.id;
      if(!anchor)throw new Error('Mounted field infantry missing: '+view);
      // Skeletons can be nested under several transforms. Test the actual
      // visible group ancestry, not the number of intermediary bones.
      window.__qaSubjectPresent=()=>{if(!visible(anchor))return false;const group=scene.getObjectByName(fieldActor);for(let n=anchor;n;n=n.parent)if(n===group)return true;return false;};
    }else if(view.startsWith('hero-crew')){
      let crew=tank.getObjectByName('tank-crew-station');
      if(!crew)tank.traverse(o=>{if(o.isGroup&&Math.abs(o.position.x-.18)<.00001&&Math.abs(o.position.y-.36)<.00001&&Math.abs(o.position.z-.33)<.00001)crew=o;});
      if(!crew)throw new Error('Live operator station missing');
      anchor=crew;
    }
    const specs={
      'hero-crew':[[.45,.61,-.86],[0,.33,-.03]],
      'hero-crew-hands':[[-.75,.65,-.52],[.04,.29,-.09]],
      'hero-side':[[2.56,.71,-.94],[0,.36,-.15]],
      'hero-threequarter':[[2.36,1.42,2.64],[0,.55,.01]],
      'hero-field-us-face':[[.39,.21,-.73],[0,.10,-.03]],
      'hero-field-vc-face':[[.39,.21,-.73],[0,.10,-.03]],
      'hero-field-us-pack':[[-.92,.15,1.03],[0,-.23,0]],
      'hero-field-vc-pack':[[-.92,.15,1.03],[0,-.23,0]],
      'hero-field-us-front':[[.03,.15,-.76],[0,.10,-.03]],
      'hero-field-vc-front':[[.03,.15,-.76],[0,.10,-.03]],
      'hero-field-us-profile':[[.76,.17,-.10],[0,.10,-.03]],
      'hero-field-vc-profile':[[.76,.17,-.10],[0,.10,-.03]],
    };
    const [e,a]=specs[view];const original=camera.position.clone(),q=camera.quaternion.clone();
    const localEye=point(e),localAim=point(a);eye=point(e);at=point(a);
    function setView(){original.copy(camera.position);q.copy(camera.quaternion);
      eye.copy(localEye);at.copy(localAim);anchor.localToWorld(eye);anchor.localToWorld(at);
      camera.position.copy(eye);camera.lookAt(at);camera.updateMatrixWorld();}
    function restore(){camera.position.copy(original);camera.quaternion.copy(q);camera.updateMatrixWorld();}
    const push=state.internal.subscribe({current:setView},.94,store);
    const pop=state.internal.subscribe({current:restore},1.09,store);
    window.__qaFinishPhoto=()=>{push();pop();delete window.__qaSubjectPresent;delete window.__qaFinishPhoto;};
    return {view,localEye:e,localAim:a,anchor:fieldActor??(anchor===tank?'hull':'operator'),fov:camera.fov};
  }
  if(view.startsWith('bridge')){
    const deck=scene.getObjectByName('winding-river-bridge');
    if(!deck?.isInstancedMesh||deck.count<4)throw Error('Rendered bridge missing');
    const m=deck.matrix.clone();deck.getMatrixAt(deck.count-1,m);
    at=point([0,0,0]).setFromMatrixPosition(m);deck.getMatrixAt(deck.count-2,m);
    at.add(point([0,0,0]).setFromMatrixPosition(m)).multiplyScalar(.5);deck.localToWorld(at);
    if(view==='bridge-pose'){
      deck.getMatrixAt(0,m);const one=deck.localToWorld(point([0,0,0]).setFromMatrixPosition(m));
      deck.getMatrixAt(deck.count-3,m);const two=deck.localToWorld(point([0,0,0]).setFromMatrixPosition(m));
      const wheels=tank.getObjectByName('tank-road-wheels');
      if(!wheels?.isInstancedMesh||wheels.count!==12)throw Error('Mounted terrain-following road wheels missing');
      const wheelY=[];
      for(let wheel=0;wheel<wheels.count;wheel++){
        wheels.getMatrixAt(wheel,m);wheelY.push(m.elements[13]);
      }
      // Read only the actual hull/instance transforms. No mocked support,
      // suspension calls, terrain edits, or fabricated animation inputs.
      const trail=scene.getObjectByName('tank-mud-impressions');
      return {tank:tank.getWorldPosition(point([0,0,0])).toArray(),endZ:[one.z,two.z].sort((a,b)=>a-b),centreX:at.x,
        trail:trail?{indices:trail.geometry.drawRange.count,visible:trail.visible,positionVersion:trail.geometry.attributes.position.version}:null,
        suspension:{at:performance.now(),pitchRadians:tank.rotation.x,rollRadians:tank.rotation.z,
          wheelLocalY:wheelY,wheelSpread:Math.max(...wheelY)-Math.min(...wheelY)}};
    }
    eye=at.clone().add(point([.1,10.4,-2.1]));
    if(view==='bridge-deck'){
      // Stand on the actual deck at one end and look along it. Overhead
      // shots alone can confuse an overhanging roof with a blocked board.
      deck.getMatrixAt(0,m);
      const end=deck.localToWorld(point([0,0,0]).setFromMatrixPosition(m));
      eye=end.clone().lerp(at,.16);eye.y+=1.18;
      at.lerp(end,-.7);at.y+=.12;
    }
  }else if(view==='muddy-trail'){
    // Both original and revised use this same physical patch of Boot Camp
    // roadway after driving across it. Never aim at a fabricated decal.
    eye=point([-1.66,1.38,-8.9]);at=point([0,-.07,-6.2]);
  }else{
    tank.updateWorldMatrix(true,false);
    eye=tank.localToWorld(point(view==='bow-front'?[.12,.80,-3.15]:[1.48,1.15,-3.2]));
    at=tank.localToWorld(point([0,.38,-.66]));
  }
  const frame=()=>{camera.position.copy(eye);camera.lookAt(at);camera.updateMatrixWorld();};
  const done=state.internal.subscribe({current:frame},0,store);frame();
  window.__qaFinishPhoto=()=>{done();delete window.__qaFinishPhoto;};
  return {view,eye:eye.toArray(),at:at.toArray(),fov:camera.fov};
}

let server, cdp, context, session, output, diagnose, impactTrace, driveVideo;
try {
  await mkdir(base,{recursive:true});output=await mkdtemp(path.join(base, (impactRequested?'napalm-impact':hordeVisibility?'horde-visibility':sectorPhotos?'sector-photos':mode)+'-'+width+'x'+height+'-'));
  console.log('QA evidence: '+output);
  const manifest=JSON.parse(await readFile(path.join(dist,'.vite/manifest.json'),'utf8'));
  if(!manifest['index.html']?.isEntry || !manifest['src/GameSession.tsx']?.isDynamicEntry) throw new Error('Build dist first: expected menu and gameplay in production manifest');
  if(!flags['existing-preview-port']) {
    const {preview}=await import('vite');
    server=await preview({root,build:{outDir:dist},preview:{host:'127.0.0.1',port,strictPort:true,open:false,
      ...(flags['offline-world']?{headers:{'Content-Security-Policy':resourcePolicy}}:{})}});
  }
  const files=await qaArtifactFiles(dist,manifest);
  for(const file of files) {
    const r=await fetch(origin+'/'+file,{signal:AbortSignal.timeout(8000)});
    if(!r.ok)throw new Error('Preview HTTP '+r.status+': '+file);
    if(flags['offline-world']&&r.headers.get('content-security-policy')!==resourcePolicy)throw Error('Missing offline-only response policy');
    const sha=digest(await readFile(path.join(dist,file)));
    if(digest(Buffer.from(await r.arrayBuffer()))!==sha)throw new Error('Preview differs from dist: '+file);
    report.artifact[file]=sha;
  }
  cdp=await connect(m=>{
    impactTrace?.onEvent(m);
    if(!session||m.sessionId!==session)return;
    const p=m.params;
    if(m.method==='Runtime.exceptionThrown')report.warningsAndErrors.push({kind:'exception',message:p.exceptionDetails.exception?.description??p.exceptionDetails.text});
    if(m.method==='Runtime.consoleAPICalled' && ['error','warning','assert'].includes(p.type))
      report.warningsAndErrors.push({kind:p.type,message:p.args.map(a=>a.value??a.description??a.type).join(' ').slice(0,8000)});
    if(m.method==='Log.entryAdded' && ['error','warning'].includes(p.entry.level))
      report.warningsAndErrors.push({kind:p.entry.level,source:p.entry.source,message:p.entry.text});
    if(m.method==='Network.responseReceived' && p.response.status>=400)report.failedLoads.push({url:p.response.url,status:p.response.status});
    if(m.method==='Network.loadingFailed'&&!p.canceled)report.failedLoads.push({type:p.type,error:p.errorText});
  });
  report.browser=cdp.version;
  report.browserInstance=cdp.instance;
  context=(await cdp.send('Target.createBrowserContext',{disposeOnDetach:true})).browserContextId;
  const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank',browserContextId:context});
  session=(await cdp.send('Target.attachToTarget',{targetId,flatten:true})).sessionId;
  const page=(m,p={})=>cdp.send(m,p,session);
  const capture=createScreenshotCapture(page);
  await Promise.all(['Page','Runtime','Network','Log'].map(x=>page(x+'.enable')));
  if(flags['impact-shader-probe']){
    const {installImpactShaderProbe}=await import('./inspect-impact-shaders.mjs');
    await page('Page.addScriptToEvaluateOnNewDocument',{source:`window.__impactShaderQA=(${installImpactShaderProbe.toString()})();`});
  }
  await page('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await page('Page.bringToFront');
  const ev=async expression=>{
    const r=await page('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor=async (name,expr,ms=40000)=>{
    const until=Date.now()+ms;
    do {if(await ev(expr))return;await sleep(150);}while(Date.now()<until);
    throw new Error('Timed out waiting for '+name);
  };
  const mouse=(type,x,y)=>page('Input.dispatchMouseEvent',{type,x,y,
    ...(type==='mouseMoved'?{}:{button:'left',buttons:type==='mousePressed'?1:0,clickCount:1})});
  const click=async ({x,y})=>{await mouse('mouseMoved',x,y);await mouse('mousePressed',x,y);await mouse('mouseReleased',x,y);};
  const button=async expr=>{
    const pt=await ev(`(()=>{const e=(${expr});if(!e || e.disabled)return null;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return e.contains(document.elementFromPoint(x,y))?{x,y}:null})()`);
    if(!pt)throw new Error('Expected a visible, unobstructed control: '+expr);await click(pt);
  };
  const key=(type,letter)=>page('Input.dispatchKeyEvent',{type,code:'Key'+letter.toUpperCase(),key:letter,
    windowsVirtualKeyCode:letter.toUpperCase().charCodeAt(0)});
  const shot=async (label,accept)=>{
    const {data}=await capture({format:'png',captureBeyondViewport:false,fromSurface:true});
    const file=label+'.png',bytes=Buffer.from(data,'base64');
    if(accept&&!await accept(bytes))return false;
    await writeFile(path.join(output,file),bytes);
    report.screenshots.push({file,sha256:digest(bytes)});
    return true;
  };
  diagnose=async()=>{
    report.failurePage=await ev(`({url:location.href,hidden:document.hidden,ui:document.body.innerText.slice(0,4000),
      canvases:[...document.querySelectorAll('canvas')].map(c=>({w:c.width,h:c.height,engine:c.dataset.engine})),
      routeMarks:window.__tankQa?.marks??[]})`);
    await shot('incomplete');
  };
  if(flags['offline-world'])await page('Page.addScriptToEvaluateOnNewDocument',{source:`window.__qaCsp=[];document.addEventListener('securitypolicyviolation',e=>window.__qaCsp.push([e.effectiveDirective,e.blockedURI.split('?')[0]]))`});
  await page('Page.navigate',{url:origin+'/'});
  if(mode==='horde'){
    const campaign=`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Start Campaign')`;
    await waitFor('simulation campaign menu',campaign+' != null');
    if(await ev(`'__TAURI_INTERNALS__' in window || !!document.querySelector('[aria-label="Launch Horde Mode"]')`))
      throw Error('Campaign QA must begin with no native bridge and a locked replay');
    await shot('campaign-first-run-menu');await button(campaign);
    await waitFor('playable village campaign',`!!document.querySelector('canvas[data-engine]') && document.querySelector('.header h2')?.textContent==='Ghost Signal // Village clearing'`,80000);
    report.campaign=await playVirtualCampaign({ev,button,click,key,waitFor,shot,sleep});
    if(flags['observe-raid']){
      // Observe the untouched, organically earned wave, before exiting to
      // replay. Never supply actors, hits or timers and never record during
      // the later seven-second load measurement.
      const start=Date.now(), witness={warnings:[],firstDamage:null};
      while(Date.now()-start<27000){
        const row=await ev("(()=>{const a=[...document.querySelectorAll('.embassy-file-health > div')];return a.map(el=>({name:el.querySelector('span').textContent,hp:el.querySelector('meter').value,warning:el.classList.contains('is-under-attack')}));})()");
        const t=Date.now()-start;
        for(const target of row){
          if(target.warning&&!witness.warnings.some(w=>w.name===target.name)){
            witness.warnings.push({...target,msAfterCampaignStill:t});await shot('unanswered-archive-warning-'+witness.warnings.length);
          }
          if(target.hp<200&&!witness.firstDamage){
            witness.firstDamage={...target,msAfterCampaignStill:t};await shot('unanswered-archive-damage');
          }
        }
        if(witness.firstDamage)break;
        await sleep(150);
      }
      report.naturalRaidWitness=witness;
    }
    await button(`document.querySelector('button[data-session-exit]')`);
    await waitFor('earned replay button',`!!document.querySelector('button[aria-label="Launch Horde Mode"]')`);
  }
  const launch=mode==='boot'?`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Boot Camp')`:
    `document.querySelector('button[aria-label="Launch Horde Mode"]')`;
  await waitFor('virtual launch button',launch+' != null');
  if(await ev("'__TAURI_INTERNALS__' in window"))throw new Error('Refusing any native bridge');
  if(hordeVisibility||raidPolicy||journeyPolicy)await ev('('+watchHordeWave.toString()+')()');
  const launchStart=performance.now();
  await button(launch);
  await waitFor('visible virtual gameplay and a current WebGL program',`!document.hidden && document.querySelector('.training-badge')?.textContent==='Simulation'
    && document.querySelector('canvas[data-engine]')?.getContext('webgl2')?.getParameter(WebGL2RenderingContext.CURRENT_PROGRAM)
    && !!document.querySelector('.weapon-cycle strong')`,80000);
  // Coarse QA observation with 150 ms polling; not a display scanout time.
  report.launchToFirstVisibleGlMs=round(performance.now()-launchStart);
  if (mode === 'horde') await waitFor('live embassy wave',
    `!!document.querySelector('.nightmare-order.is-combat') && /Embassy defense/.test(document.querySelector('.header h2')?.textContent ?? '')`);
  const snap=()=>ev('('+snapshot.toString()+')()');
  if(flags['contact-response']){
    const observe=()=>ev(`(()=>{
      const c=document.querySelector('canvas[data-game-ui]'),k=Object.keys(c).find(k=>k.startsWith('__reactFiber$'));let tank;
      for(let f=c[k];f&&!tank;f=f.return)for(let h=f.memoizedState;h;h=h.next)if(h.memoizedState?.current?.name==='player-tank'){tank=h.memoizedState.current;break;}
      if(!tank||!tank.getObjectByName('tank-contact-scuffs'))return null;
      const obj=n=>tank.getObjectByName(n),world=document.querySelector('canvas[data-engine]');
      return {t:performance.now(),xyz:tank.position.toArray(),yaw:tank.rotation.y,armour:document.querySelector('.armor-status')?.innerText,
        response:obj('tank-contact-feedback')?.userData.response??null,scuffs:obj('tank-contact-scuffs')?.count,
        flecks:obj('tank-contact-flecks')?.visible,vapor:obj('tank-contact-vapor')?.visible,window:[world.width,world.height],
        view:!document.hidden&&!!document.querySelector('.training-badge')};
    })()`);
    let first;const mountDeadline=Date.now()+20000;
    while(!first&&Date.now()<mountDeadline){first=await observe();if(!first)await sleep(100);}
    if(!first)throw Error('Timed out waiting for actual mounted tank contact mesh');
    const samples=[first];await shot('undamaged-departure');
    async function hold(letter,ms){await key('keyDown',letter);try{await sleep(ms);}finally{await key('keyUp',letter);}}
    await hold('w',1950);await hold('a',610);
    const deadline=Date.now()+35000;let hit;
    while(Date.now()<deadline){const s=await observe();samples.push(s);if(s.response&&s.scuffs>0){hit=s;break;}await sleep(70);}
    if(hit)await shot('normal-hit-on-panel');
    const recoveryDeadline=Date.now()+3500;let recovered;
    while(Date.now()<recoveryDeadline&&hit){const s=await observe();samples.push(s);if(!s.response&&!s.flecks&&!s.vapor&&s.scuffs>=hit.scuffs){recovered=s;break;}await sleep(100);}
    if(recovered)await shot('field-scrape-after-hit');
    report.contactResponse={first,hit,recovered,samples};
    report.before=report.after=await snap();
    report.checks={fullFramebuffer:samples.every(s=>s.view&&s.window[0]===width&&s.window[1]===height),
      realDrive:Math.hypot(samples.at(-1).xyz[0]-first.xyz[0],samples.at(-1).xyz[2]-first.xyz[2])>3,
      localizedHit:!!hit,visualRecovery:!!recovered,marksCapped:samples.every(s=>s.scuffs>=0&&s.scuffs<=3)};
  }else if(sectorPhotos){
    await sleep(warmup);
    report.before=await snap();report.views=[];
    if(flags['hero-photos'])await shot('hero-playing-camera');
    if(flags['crawler-shot']){
      const poseExpr='('+sectorView.toString()+')("crawler-pose")',pose=()=>ev(poseExpr);
      report.crawler=[await pose()];await shot('crawler-ready');
      for(const [i,power] of ['cell-drained','offline'].entries()){
        for(let n=0;n<4;n++){const p=await pose();if(!p.unobstructed)throw Error('Crawler hidden by HUD');await mouse('mouseMoved',p.x,p.y);await sleep(130);}
        const p=await pose();await click(p);
        await waitFor('crawler '+power,poseExpr+'.power==='+JSON.stringify(power),2500);
        report.crawler.push(await pose());await shot(i?'crawler-offline':'crawler-drained');await sleep(650);
      }
      await waitFor('autonomous crawler recovery',poseExpr+'.reboots===1',6500);report.crawler.push(await pose());
    }
    const hero=flags['hero-photos']?['hero-crew','hero-crew-hands','hero-side','hero-threequarter']:[];
    const field=flags['portrait-turns']?['hero-field-vc-front','hero-field-vc-face','hero-field-vc-profile','hero-field-us-front','hero-field-us-face','hero-field-us-profile']:
      flags['field-photos']?['hero-field-us-face','hero-field-vc-face','hero-field-us-pack','hero-field-vc-pack']:[];
    for(const view of [...field,...hero,'bow-front','bow-quarter','bridge','bridge-deck']){
      const anchor=await ev('('+sectorView.toString()+')('+JSON.stringify(view)+','+Boolean(flags['pin-field-leads'])+')');
      await sleep(450);
      const checkSubject=async()=>{if(view.startsWith('hero-field')&&!await ev('window.__qaSubjectPresent?.()'))throw Error('Actual actor disappeared in '+view);};
      await checkSubject();await shot(view);await checkSubject();report.views.push(anchor);
    }
    await ev('('+sectorView.toString()+')(null)');report.after=await snap();
    report.checks.virtualProduction=/^simulation$/i.test(report.before.hud.simulation)&&!report.before.hud.reviewControls;
    report.checks.fullResolution=report.before.canvas.bufferWidth===width&&report.before.canvas.bufferHeight===height;
    if(flags['crawler-shot'])report.checks.realCrawlerHits=report.crawler.map(p=>p.power).join(',')==='shielded,cell-drained,offline,shielded'
      &&report.crawler.at(-1).hits===2&&!report.after.hud.armed;
    if(flags['drive-crossing']){
      // Boot Camp starts aligned with the central road. Use real input; don't
      // teleport, override movement speed or modify file/actor state.
      const pose=()=>ev('('+sectorView.toString()+')("bridge-pose")');
      const first=await pose(),[entry,exit]=first.endZ,route=[first.tank];
      const suspensionSamples=[first],baselineWheels=first.suspension.wheelLocalY;
      let deckShot=false,suspensionStill=null;
      const observe=p=>{route.push(p.tank);suspensionSamples.push(p);};
      const framebuffer=()=>ev(`(()=>{const c=document.querySelector('canvas[data-engine]'),gl=c.getContext('webgl2');
        return {width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,devicePixelRatio};})()`);
      let videoStartBuffer;
      if(flags['drive-video']){
        driveVideo=createDriveVideo(page,{width,height,output,capture});
        videoStartBuffer=await framebuffer();await driveVideo.start();
      }
      try {
        await key('keyDown','w');
        const end=Date.now()+18000;
        while(Date.now()<end&&route.at(-1)[2]<exit+3){
          await sleep(120);const p=await pose();observe(p);
          if(!suspensionStill&&Math.abs(p.tank[2]-entry)<1.6
            &&Math.abs(p.suspension.pitchRadians)>.015&&p.suspension.wheelSpread>.015){
            // Photograph an actual crossing frame without stopping, teleporting,
            // changing the chase camera, or replacing player movement.
            await shot('drive-suspension-bridge-approach');
            const after=await pose();observe(after);
            suspensionStill={file:'drive-suspension-bridge-approach.png',before:p,after};
          }
          if(!deckShot&&p.tank[2]>(entry+exit)/2){await shot('drive-on-bridge');deckShot=true;}
        }
      }finally{await key('keyUp','w');}
      await sleep(350);const last=await pose();await shot('drive-past-bridge');
      if(driveVideo){
        const endFramebuffer=await framebuffer();
        report.driveVideo={...await driveVideo.finish(),startFramebuffer:videoStartBuffer,endFramebuffer};
        report.checks.driveVideoResolution=[videoStartBuffer,endFramebuffer].every(f=>f.width===width&&f.height===height);
        driveVideo=null;
      }
      observe(last);
      if(flags['trail-photos']){
        const anchor=await ev('('+sectorView.toString()+')("muddy-trail")');
        await sleep(350);await shot('muddy-trail');report.views.push(anchor);await ev('('+sectorView.toString()+')(null)');
        report.checks.trueTrail=flags['trail-photos']==='before'?(!first.trail&&!last.trail):
          (first.trail?.indices===0&&!first.trail.visible&&last.trail?.visible&&last.trail.indices>0&&last.trail.indices<=640*24);
      }
      const maxPitch=Math.max(...suspensionSamples.map(p=>Math.abs(p.suspension.pitchRadians)));
      const maxRoll=Math.max(...suspensionSamples.map(p=>Math.abs(p.suspension.rollRadians)));
      const maxWheelDisplacement=Math.max(...suspensionSamples.flatMap(p=>p.suspension.wheelLocalY
        .map((y,index)=>Math.abs(y-baselineWheels[index]))));
      const maxWheelSpread=Math.max(...suspensionSamples.map(p=>p.suspension.wheelSpread));
      report.bridgeDrive={first,last,route,suspension:{samples:suspensionSamples,still:suspensionStill,
        measurement:'Read-only mounted transforms, approximately 120ms polling; observed peaks, not a physics simulation or per-frame profiler.',
        maxObservedPitchRadians:maxPitch,maxObservedPitchDegrees:maxPitch*180/Math.PI,
        maxObservedRollRadians:maxRoll,maxObservedWheelDisplacementMeters:maxWheelDisplacement,
        maxObservedWheelSpreadMeters:maxWheelSpread}};
      report.checks.crossedOnStandardControls=first.tank[2]<entry-2&&deckShot&&last.tank[2]>exit+2
        &&route.filter(p=>p[2]>=entry&&p[2]<=exit).length>=3
        &&route.every(p=>Math.abs(p[0]-first.centreX)<.8);
      report.checks.realTerrainFollowing=maxPitch>.015&&maxWheelDisplacement>.015&&maxWheelSpread>.015;
    }
  }else if(journeyPolicy){
    const {playDefenseJourney}=await import('./defense-journey-qa.mjs');
    report.before=await snap();
    const journey=report.defenseJourney=await playDefenseJourney({ev,state:()=>ev('('+hordePhotoState.toString()+')('+String(journeyPolicy==='relief')+')'),
      button,move:(x,y)=>mouse('mouseMoved',x,y),click,key,shot,policy:journeyPolicy,width,height});
    report.after=await snap();
    report.checks={earnedReplay:!!report.campaign,
      ...(journeyPolicy==='relief'?{trustedInputLanding:journey.outcome==='relief-complete'&&journey.relief.length===4}
        :{observedNaturalEnd:['victory','defeat'].includes(journey.outcome),expectedPolicyOutcome:journey.outcome===(journeyPolicy==='watch'?'defeat':'victory')}),
      didPlay:journeyPolicy==='watch'?journey.shots.length===0:journey.shots.length>0,
      measuredWaveTimes:journey.waves.length>0&&journey.waves.every(w=>w.wave>0&&w.durationMs>0)};
    if(journey.outcome==='defeat'){
      const modal="document.querySelector('.nightmare-defeat-overlay[role=dialog]')";
      await button(`[...(${modal}?.querySelectorAll('button')??[])].find(b=>b.textContent==='Retry nightmare defense')`);
      await waitFor('real retry restores armor and all three virtual files',`!${modal} &&
        document.querySelector('.armor-status strong')?.textContent==='100%' &&
        document.querySelectorAll('.embassy-file-health meter').length===3 &&
        [...document.querySelectorAll('.embassy-file-health meter')].every(m=>m.value===200)`,10000);
      await shot('journey-retry-reformed');
      report.defenseRetry=await snap();report.checks.defeatModalRetry=true;
      // During the warning the intro is a sound effect and the radio is
      // intentionally between tracks. Test mute after actual Wave 1 playback,
      // and fail if the radio never starts or still names the wrong track.
      await waitFor('replayed first wave cues Change',`!!document.querySelector('.nightmare-order.is-combat') &&
        (document.querySelector('.field-radio')?.innerText??'').includes('Change (In the House of Flies)') &&
        document.querySelector('.field-radio-mute')?.getAttribute('aria-label')==='Mute music'`,30000);
      report.checks.retryRadioOnWave=true;
    }
  }else if(raidPolicy){
    report.before=await snap();
    const state=()=>ev('('+hordePhotoState.toString()+')()');
    const read=async()=>{const s=await state();return {t:s.waveMs,tank:s.tank,archives:s.archives,
      runner:s.zombies.find(z=>z.archiveRunner),buffer:s.buffer,hidden:s.hidden};};
    await waitFor('ordinary file warning',"!!document.querySelector('.embassy-file-health .is-under-attack')",24000);
    const warning=await read();
    const file=warning.archives.find(a=>a.attacked), actor=warning.runner;
    if(!file||!actor||file.health!==200||Math.abs(actor.clipDepth)>=1)throw Error('Missing damage-free warning or live raider');
    await shot('actual-archive-warning');
    let clicks=0;
    if(raidPolicy==='answer'){
      const [x,y]=actor.aim;
      if(!await ev(`document.elementFromPoint(${x},${y})===document.querySelector('canvas[data-engine]')`))throw Error('Raider aim is offscreen or under HUD');
      // The user only aims and fires the selected cannon: no turn, forced hit,
      // projectile injection, actor teleport or synthetic gameplay callback.
      await mouse('mouseMoved',x,y);await sleep(150);await click({x,y});clicks++;
    }
    const observations=[];const until=Date.now()+4400;
    while(Date.now()<until){observations.push(await read());await sleep(160);}
    const last=observations.at(-1),minHP=Math.min(...observations.map(s=>s.archives.find(a=>a.id===file.id).health));
    report.raidResponse={policy:raidPolicy,warning,observations,clicks,minHP};
    await shot(raidPolicy==='answer'?'actual-rescue-result':'actual-unanswered-result');report.after=await snap();
    report.checks={virtualCampaignEarned:!!report.campaign,realArchiveWarning:true,
      fullSizeChase:[warning,...observations].every(s=>!s.hidden&&s.buffer[0]===width&&s.buffer[1]===height),
      noSteering:observations.every(s=>JSON.stringify(s.tank)===JSON.stringify(warning.tank)),
      resolved:raidPolicy==='answer'?clicks===1&&!last.runner&&minHP===200:clicks===0&&minHP<200};
  }else if(flags['peak-horde']){
    if(mode!=='horde')throw Error('Peak needs earned horde route');
    report.before=await snap();
    const p=report.peakHorde=await capturePeakHorde({ev,mouse,shot,width,height,setup:'fixture'});
    if(flags['post-budget']){
      const {inspectDrawBudget}=await import('./qa-wk-scene-budget.mjs');
      report.drawBudget=await ev('('+inspectDrawBudget.toString()+')()');
      if(!(report.drawBudget?.triangles>0&&report.drawBudget.calls>0))throw Error('No actual post-timing game submission');
    }
    report.after=await snap();
    report.checks={earnedHorde:!!report.campaign,measuredPeak:p.peakVerified&&p.entireWindowAtCap,fullResolution:p.fullResolution,
      foreground:p.foreground,steadyFrameRate:p.timing.effectiveHz>=58&&p.timing.p95Ms<=18.5&&p.timing.maxMs<=33.4};
  }else if(hordeVisibility){
    report.before=await snap();
    report.hordeVisibility=[];
    const photoState=()=>ev('('+hordePhotoState.toString()+')()');
    const waitMoment=targetMs=>ev(`new Promise((resolve,reject)=>{const at=window.__qaHordeWaveStart;
        if(!Number.isFinite(at)){reject(Error('No live wave timestamp'));return;}
        const frame=()=>performance.now()>=at+${targetMs}?resolve():requestAnimationFrame(frame);requestAnimationFrame(frame);})`);
    if(flags['raid-review']){
      // Keep the UI mounted/size unchanged. This affects the local photo tab
      // only, never the product CSS, geometry, render camera or night grade.
      if(!flags['playing-hud-film'])await ev(`(()=>{const c=document.querySelector('.scene-container'),world=c.querySelector('canvas[data-engine]');
        let b=world;while(b.parentElement!==c)b=b.parentElement;b.dataset.qaWorld='true';
        const s=document.createElement('style');s.id='qa-no-hud';
        s.textContent='.scene-container > :not([data-qa-world]),[data-game-ui],.game-notifications {opacity:0!important}';
        document.head.append(s);})()`);
      driveVideo=createDriveVideo(page,{width,height,output,capture,route:flags['playing-hud-film']?'embassy-player-approach':flags['early-approach']?'embassy-early-approach':'embassy-approach'});
      await driveVideo.prepare(); // tool discovery is outside the film window
    }
    for(const targetMs of (flags['early-approach']?[800,13000]:flags['raid-review']?[800,4500,8000,13000]:[4500,8000,13000])){
      if(flags['playing-hud-film']&&targetMs===4500){
        await waitMoment(2850);await driveVideo.start();
      }
      if(flags['playing-hud-film']&&targetMs===13000){
        await waitMoment(10300);await driveVideo.stop();
      }else if(flags['raid-review']&&targetMs===13000){
        await waitMoment(flags['early-approach']?2900:9850);await driveVideo.start();await waitMoment(flags['early-approach']?8900:12700);await driveVideo.stop();
      }
      await waitMoment(targetMs);
      const before=await photoState();
      await shot(`chase-wave-${targetMs}ms`);
      const after=await photoState();
      report.hordeVisibility.push({targetMs,before,after});
    }
    if(flags['raid-review']){
      await waitMoment(13750);report.raidReviewVideo=await driveVideo.finish();driveVideo=null;
      if(flags['playing-hud-film']){
        report.ordinaryHudThroughout=await ev("!document.querySelector('#qa-no-hud') && getComputedStyle(document.querySelector('.hud')).opacity==='1'");
        if(!report.ordinaryHudThroughout||report.raidReviewVideo.durationSeconds<7)throw Error('Expected at least seven seconds of regular HUD-on gameplay');
      }
      await ev(`document.getElementById('qa-no-hud')?.remove()`);
      await shot('guard-with-game-hud');
    }
    report.after=await snap();
    const photoStates=report.hordeVisibility.flatMap(capture=>[capture.before,capture.after]);
    report.checks={
      simulatedNightmare:[report.before,report.after].every(s=>s.hud.nightmare&&/^simulation$/i.test(s.hud.simulation)&&!s.hud.reviewControls&&s.url===origin+'/'),
      fullSizeChase:photoStates.every(s=>!s.hidden&&s.buffer[0]===width&&s.buffer[1]===height&&s.phase?.includes('is-combat')),
      liveThreats:photoStates.every(s=>s.zombies.length>=(s.waveMs<1600?1:3)&&s.zombies.every(z=>z.xyz.every(Number.isFinite)&&Number.isFinite(z.range))),
      stationaryTank:photoStates.every(s=>Object.values(s.tank).every(Number.isFinite)&&JSON.stringify(s.tank)===JSON.stringify(photoStates[0].tank)),
      fixedChase:photoStates.every(s=>[...s.camera.xyz,...s.camera.quaternion,s.camera.fov].every(Number.isFinite)
        &&s.camera.xyz.every((v,i)=>Math.abs(v-photoStates[0].camera.xyz[i])<.03)
        &&s.camera.quaternion.every((v,i)=>Math.abs(v-photoStates[0].camera.quaternion[i])<.005)),
      sameWave:photoStates.every(s=>/wave\s+1\s*\/\s*4/i.test(s.nightmareHud)),
    };
  }else{
  if(!impactRequested)await ev('('+installProbe.toString()+')()');
  await sleep(warmup);
  report.before=await snap();
  if(report.before.viewport.hidden||report.before.hud.reviewControls||report.before.hud.nightmare!==(mode==='horde')||report.before.viewport.width!==width||report.before.viewport.height!==height)
    throw new Error('Unexpected viewport or development/hidden gameplay');
  await shot('01-warmed-chase');await sleep(700);
  if (markPoint) {
    const {x,y} = markPoint;
    const armed = 'document.querySelector(\'[aria-label="Armed file targets"]\')';
    const disarm = 'document.querySelector(\'button[aria-label="Disarm targets"]\')';
    if (!await ev(`!${armed} && document.elementFromPoint(${x},${y})?.matches('canvas[data-engine]')`))
      throw new Error('Mark/disarm requires an initially clear queue and a visible world aim point');
    const beforeTotals = await ev("document.querySelector('.hud-log')?.innerText");
    await mouse('mouseMoved',x,y);await sleep(350);await click(markPoint);await sleep(2200);
    report.mark = {point:markPoint, text:await ev(`${armed}?.innerText ?? null`), topPriority:await ev(`${armed} !== null && ${armed} === document.querySelector('.hud')?.firstElementChild`)};
    if (report.mark.text) {
      await shot('04-marked-only');
      await button(disarm);
      await waitFor('disarmed simulated targets',`!${armed}`,5000);
      await shot('05-disarmed');
    }
    report.mark.disarmed = !!report.mark.text && await ev(`!${armed}`);
    const afterTotals = await ev("document.querySelector('.hud-log')?.innerText");
    report.mark.sameFileTotals = Boolean(beforeTotals && beforeTotals === afterTotals);
  }
  if(impactRequested){
    if (flags['impact-flat-notices']) {
      // Diagnostic only: notices keep their DOM, layout, and gameplay cues.
      await ev(`(() => {
        const style = document.createElement('style');
        style.textContent = '[data-rht-toaster] * { animation: none !important; transition: none !important; will-change: auto !important; } [data-rht-toaster] .achievement-icon { filter: none !important; }';
        document.head.append(style);
      })()`);
      report.flatNoticesControl = true;
    }
    const {runNapalmImpact}=await import('./measure-napalm-impact.mjs');
    if (flags['impact-trace']) {
      const {createImpactTrace}=await import('./measure-impact-trace.mjs');
      impactTrace=createImpactTrace(cdp.send);
      await impactTrace.start();
    }
    try {
      await runNapalmImpact({ev,page,click,mouse,waitFor,shot,snap,report,output,summarize,aim:impactAim,expect:impactExpect,attribution:flags['impact-attribution'],trace:flags['impact-trace'],pointerProbe:flags['impact-pointer-probe'],disarm:flags['impact-disarm-between'],dist});
    } finally {
      if(flags['impact-shader-probe']){
        const shaderReport=await ev('window.__impactShaderQA.finish()');
        await writeFile(path.join(output,'impact-shader-programs.json'),JSON.stringify(shaderReport));
        report.impactShaderProbe={diagnosticOnly:true,file:'impact-shader-programs.json'};
      }
      if (impactTrace) {
        try {
          report.impactTrace=await impactTrace.finish(output,report.napalmImpact,impactMaxFrame??33.4);
          report.checks.traceUsable=!report.impactTrace.dataLossOccurred&&report.impactTrace.alignment.usable;
        } catch (error) {
          report.impactTrace={diagnosticOnly:true,error:String(error)};
          report.checks.traceUsable=false;
        }
      }
    }
    if (impactMaxFrame !== null) {
      const windows=['launch','inboundToImpact','centeredImpact','ignite','rollingFire'];
      report.impactFrameBudget={maxMs:impactMaxFrame,windows};
      report.checks.meetsImpactFrameBudget=report.napalmImpact.strikes.length===2
        && report.napalmImpact.strikes.every(strike=>windows.every(name=>{
          const window=strike.windows[name];
          return window?.coverage && Number.isFinite(window.maxMs) && window.maxMs<=impactMaxFrame;
        }));
    }
  }else{
  const mark=label=>ev('window.__tankQa.mark('+JSON.stringify(label)+')');
  const safeAim=async(xf,yf)=>{
    const pt=await ev(`(()=>{for(const [dx,dy] of [[0,0],[-.07,0],[.06,-.08],[-.12,.08],[0,.12]]){const x=Math.round(innerWidth*(${xf}+dx)),y=Math.round(innerHeight*(${yf}+dy));
      if(document.elementFromPoint(x,y)?.matches('canvas[data-engine]'))return {x,y};}return null;})()`);
    if(!pt)throw new Error('No unobstructed world canvas at the aim point');return pt;
  };
  const aim1=await safeAim(.42,.44), aim2=await safeAim(.57,.50);
  await ev('window.__tankQa.start()');await mark('start');
  await key('keyDown','w');await sleep(1050);await mark('forward');
  await key('keyDown','a');await sleep(460);await key('keyUp','a');await sleep(500);
  await key('keyUp','w');await sleep(380);await mark('release');await sleep(900);await mark('stopped');
  await key('keyDown','s');await sleep(850);await key('keyUp','s');await sleep(220);await mark('reverse');
  await key('keyDown','d');await sleep(460);await key('keyUp','d');await mark('countersteer');
  await mouse('mouseMoved',aim1.x,aim1.y);await sleep(300);await mouse('mouseMoved',aim2.x,aim2.y);await sleep(250);
  await click(aim2);await sleep(250);await mark('fire');
  await sleep(3200);await mark('settle');await ev('window.__tankQa.stop()');
  const raw=await ev(`(()=>{const {deltas,input,visibility,marks,reloads,paintSizes,startT,stopT}=window.__tankQa;
    return {deltasMs:deltas,input,visibility,marks,reloads,paintSizes,startT,stopT};})()`);
  await writeFile(path.join(output,'frames-and-input.json'),JSON.stringify(raw));
  report.frames={...summarize(raw.deltasMs),method:'All consecutive foreground rAF timestamps during one warmed route, no trimming. Nearest-rank quantiles; this is browser display cadence, not GPU execution time. PNGs outside timed interval.'};
  report.phases=raw.marks;report.reloads=raw.reloads;report.bufferChanges=raw.paintSizes;
  const byPhase=Object.fromEntries(raw.marks.map(m=>[m.label,JSON.stringify(m.radar)]));
  report.checks={
    foreground:!raw.visibility.some(v=>v.hidden&&v.t>=raw.startT&&v.t<=raw.stopT),
    input: ['w','a','s','d'].every(k=>['keydown','keyup'].every(type=>raw.input.some(e=>e.trusted&&e.type===type&&e.key==='Key'+k.toUpperCase()))),
    worldClick:raw.input.some(e=>e.trusted&&e.type==='pointerdown'&&e.tag==='CANVAS'),
    aim:raw.input.some(e=>e.trusted&&e.type==='pointermove'&&e.x===aim1.x&&e.y===aim1.y)
      && raw.input.some(e=>e.trusted&&e.type==='pointermove'&&e.x===aim2.x&&e.y===aim2.y),
    forward:byPhase.start!==byPhase.forward,steering:byPhase.reverse!==byPhase.countersteer,
    stopped:byPhase.release===byPhase.stopped,reverse:byPhase.stopped!==byPhase.reverse,
    cannon:raw.reloads.some(e=>e.label.startsWith('RELOAD')),radar:raw.marks.every(m=>m.radar.length>0),
    sampled100Frames:raw.deltasMs.length>=100,
  };
  if(markPoint) report.checks.markedAndDisarmed=!!report.mark.text&&report.mark.topPriority&&report.mark.disarmed&&report.mark.sameFileTotals;
  report.after=await snap();await shot('02-route-end');
  // Separate timed-route and visual-effect evidence. This additional world
  // click occurs after sampling and is never used to qualify the route shot.
  if(report.after.hud.breech==='READY') {
    const pt=await safeAim(.44,.52);await click(pt);
    report.visualFireBreech=await ev("document.querySelector('.weapon-cycle strong')?.textContent");
    await shot('03-fired-chase');
  }
  if (flags.orbit) {
    const from = await safeAim(.46,.45), to = {x:from.x-96,y:from.y+38};
    const started = await ev('window.__tankQa.input.length');
    await mouse('mouseMoved',from.x,from.y);
    await page('Input.dispatchMouseEvent',{type:'mousePressed',button:'right',buttons:2,clickCount:1,...from});
    for (let step=1;step<=8;step+=1) {
      await page('Input.dispatchMouseEvent',{type:'mouseMoved',buttons:2,
        x:Math.round(from.x+(to.x-from.x)*step/8),y:Math.round(from.y+(to.y-from.y)*step/8)});
      await sleep(45);
    }
    await shot('06-orbit-held');
    await page('Input.dispatchMouseEvent',{type:'mouseReleased',button:'right',buttons:0,clickCount:1,...to});
    await sleep(1300);
    await shot('07-orbit-recentered');
    report.orbitInput=await ev(`window.__tankQa.input.slice(${started})`);
    // Camera placement is reviewed on the actual captures; the input itself is observable here.
    report.checks.orbitInput=report.orbitInput.some(e=>e.trusted&&e.type==='pointerdown'&&e.tag==='CANVAS')
      && report.orbitInput.some(e=>e.trusted&&e.type==='pointerup')
      && report.orbitInput.filter(e=>e.trusted&&e.type==='pointermove').length>=8;
  }
  }
  }
  if(flags['offline-world']){
    report.offlineWorld=await ev('('+renderedLabelState.toString()+')()');const result=report.offlineWorld;
    report.checks.localGlyphs=result.labels.some(l=>l.glyphs>=3&&l.instances>0)&&result.labels.every(l=>l.font==='/fonts/LiberationSans-Regular.ttf');
    report.checks.noBlockedDependencies=result.violations.length===0;
  }
  const radio='.field-radio-mute', label=()=>ev(`document.querySelector('${radio}')?.getAttribute('aria-label')`);
  report.radioLabels=[await label()];
  // One toggle from stopped starts playback; from playing it mutes. Verify UI only.
  await key('keyDown','m');await key('keyUp','m');await sleep(320);report.radioLabels.push(await label());
  report.checks.radioToggle=report.radioLabels[0]!==report.radioLabels[1];
  await button(`document.querySelector('button[data-session-exit]')`);
  await waitFor('menu after exiting virtual session',launch+' != null');
  report.checks.exitedToMenu=await ev("!document.querySelector('canvas[data-engine]') && document.querySelector('h1')?.textContent==='TankDelete'");
  if(flags['observe-raid'])report.checks.naturalArchiveThreat=!!report.naturalRaidWitness?.warnings.length;
  report.checks.noRuntimeErrors=!report.warningsAndErrors.some(e=>['exception','error','assert'].includes(e.kind));
  report.checks.noShaderErrors=!report.warningsAndErrors.some(e=>/shader error|error validating shader|could not compile|validate_status false|context lost/i.test(e.message));
  // Chrome reports invalid GL draws as warnings instead of JS errors. Such
  // draws are dropped, so a responsive HUD and a fast rAF are not a pass.
  report.checks.noInvalidGLDraws=!report.warningsAndErrors.some(e=>/GL_INVALID_|GL_OUT_OF_MEMORY|mismatch between texture format and sampler/i.test(e.message));
  report.checks.noFailedLoads=report.failedLoads.length===0;
  report.status=Object.values(report.checks).every(Boolean)?'checks-passed':'findings';
} catch(error) {
  report.error=error.stack??String(error);console.error(report.error);
  if(driveVideo)await driveVideo.stop().catch(()=>{});
  if(diagnose)await diagnose().catch(e=>{report.diagnosticError=String(e);});
}
finally {
  if(context)await cdp.send('Target.disposeBrowserContext',{browserContextId:context}).catch(()=>{});
  cdp?.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve));
  report.finishedAt=new Date().toISOString();
  if(output)await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify({output,status:report.status,checks:report.checks,frames:report.frames},null,2));
if(report.status!=='checks-passed')process.exitCode=1;
