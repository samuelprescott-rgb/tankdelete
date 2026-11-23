// Baseline only. Never use this outcome instead of gameplay qualification.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {physicalPresentation} from './qa-wk-render-ready.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),host=process.argv[2];
if(process.platform!=='darwin'||!host||!path.isAbsolute(host))throw Error('Provide explicit nonactivatable system WK host');
const out=await mkdtemp(path.join(root,'tmp/production-qa/wk-1080p-cadence-control-'));
const page='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;color:white;font:16px system-ui}canvas{width:100vw;height:100vh;display:block}output{position:absolute;top:20px;left:20px;pointer-events:none}</style><canvas width="1920" height="1080"></canvas><output>Ready</output>';
const server=createServer((req,res)=>{if(req.url!=='/'||req.method!=='GET'){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':'text/html;charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'"});res.end(page);});
await new Promise((ok,no)=>{server.once('error',no).listen(1485,'127.0.0.1',ok);});
async function route(){
  const port=window.webkit.messageHandlers.simulationQA,r={controlOnly:true,raf:[],changes:[],visibility:[],stage:'init'};
  const emit=(op,extra={})=>port.postMessage({op,...extra}),check=(v,msg)=>{if(!v)throw Error(msg);};
  try{
    if(document.readyState==='loading')await new Promise(ok=>document.addEventListener('DOMContentLoaded',ok,{once:true}));
    const cvs=document.querySelector('canvas'),hud=document.querySelector('output'),gl=cvs.getContext('webgl2',{antialias:false,depth:false,stencil:false,powerPreference:'high-performance'});
    check(gl,'No WebGL2');const dbg=gl.getExtension('WEBGL_debug_renderer_info');
    r.gpu=dbg&&gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);r.renderer=gl.getParameter(gl.RENDERER);r.viewport=[innerWidth,innerHeight];
    r.buffer=[gl.drawingBufferWidth,gl.drawingBufferHeight];r.visibility.push({t:performance.now(),hidden:document.hidden});
    document.addEventListener('visibilitychange',()=>r.visibility.push({t:performance.now(),hidden:document.hidden}));
    check(r.viewport.join('x')==='1920x1080'&&r.buffer.join('x')==='1920x1080'&&!document.hidden,'Wrong size or hidden');
    const program=gl.createProgram(),shader=(kind,source)=>{const a=gl.createShader(kind);gl.shaderSource(a,source);gl.compileShader(a);check(gl.getShaderParameter(a,gl.COMPILE_STATUS),gl.getShaderInfoLog(a));gl.attachShader(program,a);};
    shader(gl.VERTEX_SHADER,'#version 300 es\nconst vec2 pos[3]=vec2[](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));void main(){gl_Position=vec4(pos[gl_VertexID],0.,1.);}');
    shader(gl.FRAGMENT_SHADER,'#version 300 es\nprecision mediump float;uniform vec3 ink;out vec4 color;void main(){color=vec4(ink,1.);}');
    gl.linkProgram(program);check(gl.getProgramParameter(program,gl.LINK_STATUS),gl.getProgramInfoLog(program));gl.useProgram(program);
    gl.viewport(0,0,1920,1080);const ink=gl.getUniformLocation(program,'ink');let n=0;
    const draw=t=>{gl.uniform3f(ink,.1+.06*Math.sin(t*.004),.09+.04*n,.12+.02*Math.cos(t*.005));gl.drawArrays(gl.TRIANGLES,0,3);};
    const sample=()=>{const a=new Uint8Array(4);gl.readPixels(960,540,1,1,gl.RGBA,gl.UNSIGNED_BYTE,a);return Array.from(a);};
    const input=e=>{if(!e.isTrusted||e.button!==0||e.target!==cvs)return;n++;hud.textContent=n===1?'Three items marked':'Three items cleared';r.changes.push({t:performance.now(),x:e.clientX,y:e.clientY,trusted:e.isTrusted,text:hud.textContent});};
    cvs.addEventListener('pointerdown',input);
    await new Promise(ok=>{let first;const warm=t=>{first??=t;draw(t);if(t>=first+8000)ok();else requestAnimationFrame(warm);};requestAnimationFrame(warm);});
    draw(performance.now());r.startPixel=sample();check(gl.getError()===0,'Warm GL error');
    r.stage='measure';emit('phase',{stage:'measureBegin'});
    await new Promise(ok=>{let first,k=0;const loop=t=>{first??=t;r.raf.push(t);draw(t);
      if(k<2&&t-first>=[13000,37500][k]){k++;emit('click',{x:1082,y:502});}
      if(t-first>=50000)ok();else requestAnimationFrame(loop);};requestAnimationFrame(loop);});
    emit('phase',{stage:'measureEnd'});
    draw(performance.now());r.endPixel=sample();r.glError=gl.getError();r.lost=gl.isContextLost();
    r.endBuffer=[gl.drawingBufferWidth,gl.drawingBufferHeight];r.stage='complete';
  }catch(e){r.error=String(e);}
  emit('done',{report:r});
}
try{
  const url='http://127.0.0.1:1485/',child=spawn(host,[url,'back-physical'],{stdio:['pipe','pipe','inherit']}),chunks=[];
  child.stdout.on('data',d=>chunks.push(d));const done=new Promise((ok,no)=>{child.on('error',no);child.on('exit',c=>c===0?ok():no(Error('Host exited '+c)));});
  console.log('Control evidence: '+out);child.stdin.end('('+route.toString()+')()');await done;
  const r=JSON.parse(Buffer.concat(chunks)),frames=r.raf??[];delete r.raf;
  const intervals=frames.slice(1).map((t,i)=>({start:frames[i],end:t,dt:t-frames[i]}));
  const stats=rows=>{const s=rows.map(v=>v.dt).sort((a,b)=>a-b),q=p=>s[Math.max(0,Math.ceil(s.length*p)-1)];return {n:s.length,p50:q(.5),p95:q(.95),p99:q(.99),max:q(1),over33_4:s.filter(x=>x>33.4).length};};
  r.whole=stats(intervals);r.over=intervals.filter(v=>v.dt>33.4);r.nearChanges=r.changes?.map(c=>stats(intervals.filter(i=>i.end>c.t-500&&i.start<c.t+500)));
  r.hostSHA256=createHash('sha256').update(await readFile(host)).digest('hex');r.presentation=physicalPresentation(r);
  r.clean=r.stage==='complete'&&!r.error&&r.changes.length===2&&r.changes.every(c=>c.trusted&&c.x===1082&&c.y===502)&&
    r.endBuffer.join('x')==='1920x1080'&&r.glError===0&&!r.lost&&r.startPixel[1]!==r.endPixel[1]&&
    r.visibility.every(v=>!v.hidden)&&r.presentation.verifiedPhysical1080&&r.native.samples.every(s=>!s.appActive&&!s.key&&!s.main)&&/Apple/i.test(r.gpu);
  await writeFile(path.join(out,'raf.json'),JSON.stringify(frames));await writeFile(path.join(out,'report.json'),JSON.stringify(r,null,2));
  console.log(JSON.stringify({clean:r.clean,error:r.error,whole:r.whole,near:r.nearChanges}));if(!r.clean)process.exitCode=1;
}finally{await new Promise(ok=>server.close(ok));}
