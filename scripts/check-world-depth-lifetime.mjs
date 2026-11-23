// Exercise the installed composer's real passes, with a memory-only draw target.
// This proves command ordering and resource identity, not driver bandwidth or fps.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as T from 'three';
const require=createRequire(import.meta.url);
const P=createRequire(require.resolve('@react-three/postprocessing'))('postprocessing');
const source=await readFile(new URL('../src/components/Scene/discardWorldDepth.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
const {attachWorldDepthDiscard}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const camera=new T.PerspectiveCamera(), scene=new T.Scene(), composer=new P.EffectComposer(), world=new P.RenderPass(scene,camera);
const edge=new P.EffectPass(camera,new P.FXAAEffect()), bloom=new P.BloomEffect({mipmapBlur:true,levels:5});
const grade=new P.EffectPass(camera,bloom,new P.ToneMappingEffect({mode:6}));
composer.passes.push(world,edge,grade);grade.renderToScreen=true;
const input=composer.inputBuffer, output=composer.outputBuffer, foreign=new T.WebGLRenderTarget();
let target=null, depth, color, rendered, scissor=false, interceptions=0;
const calls=[];
const gl={DRAW_FRAMEBUFFER:0x8ca9,DEPTH_ATTACHMENT:0x8d00,
  invalidateFramebuffer(where,which){
    assert.equal(target,input,'Only world HDR input framebuffer is bound');
    assert.equal(where,0x8ca9);assert.deepEqual(which,[0x8d00]);
    assert.equal(rendered,true);assert.equal(depth,'geometry');assert.equal(color,'full-color');
    depth=undefined;calls.push('discard');
  }};
const renderer={getClearAlpha:()=>1,getScissorTest:()=>scissor,getContext:()=>gl,xr:{isPresenting:false},shadowMap:{autoUpdate:true},
  clear(c,d){if(d)depth='cleared';if(c)color='clear';calls.push('clear');},setRenderTarget(t){target=t;},getRenderTarget:()=>target,
  render(s){if(s===scene){rendered=true;depth='geometry';color='full-color';calls.push('world');}
    else{assert.equal(s.children.length,1);assert.equal(s.children[0].material.depthTest,false);
      assert.equal(s.children[0].material.depthWrite,false);calls.push('full-screen');}}};
composer.renderer=renderer;
const undo=attachWorldDepthDiscard(composer,renderer,scene,camera);
assert.equal(typeof undo,'function');assert.equal(Object.hasOwn(world,'render'),true);
function frame(){calls.length=0;rendered=false;composer.render(1/60);return calls.filter(v=>v==='discard').length;}
for(let i=0;i<3;i++){assert.equal(frame(),1);assert.deepEqual(calls.slice(0,3),['clear','world','discard']);assert(calls.slice(3).every(v=>v==='full-screen'));assert(calls.length>10);}
function skips(set,restore){
  set();try{calls.length=0;world.render(renderer,input,output,1/60,false);assert(!calls.includes('discard'));interceptions++;}finally{restore();}
}
for(const [o,k,v] of [[input,'samples',4],[input,'depthBuffer',false],[input,'depthTexture',new T.DepthTexture()],
  [output,'depthTexture',new T.DepthTexture()],[input,'stencilBuffer',true],[input,'scissorTest',true],
  [world,'renderToScreen',true],[world.clearPass,'enabled',false],[world.clearPass,'depth',false],
  [renderer.xr,'isPresenting',true],[edge,'needsDepthTexture',true],[edge.fullscreenMaterial,'depthTest',true],
  [grade.fullscreenMaterial,'depthWrite',true],[world,'mainCamera',new T.PerspectiveCamera()]]){
  const old=k==='mainCamera'?camera:o[k];skips(()=>{o[k]=v;},()=>{o[k]=old;});
}
skips(()=>{scissor=true;},()=>{scissor=false;});
skips(()=>composer.passes.push({name:'UnknownFuturePass'}),()=>composer.passes.pop());
skips(()=>composer.passes.reverse(),()=>composer.passes.reverse());
const getTarget=renderer.getRenderTarget;
skips(()=>{renderer.getRenderTarget=()=>foreign;},()=>{renderer.getRenderTarget=getTarget;});
for(const [r,t,stencil] of [[renderer,foreign,false],[renderer,null,false],[{...renderer},input,false],[renderer,input,true]]){
  calls.length=0;world.render(r,t,output,1/60,stencil);assert(!calls.includes('discard'));interceptions++;
}
assert.equal(frame(),1);undo();assert.equal(Object.hasOwn(world,'render'),false);assert.equal(frame(),0);
const orig=gl.invalidateFramebuffer;delete gl.invalidateFramebuffer;assert.equal(attachWorldDepthDiscard(composer,renderer,scene,camera),undefined);gl.invalidateFramebuffer=orig;
const replay=attachWorldDepthDiscard(composer,renderer,scene,camera);assert.equal(frame(),1);
const external=world.render.bind(world);world.render=external;replay();assert.equal(world.render,external,'Never overwrite a later owner');delete world.render;
console.log(`World depth: real clear/world/FXAA/bloom/grade pass ordering, depth-only invalidation, ${interceptions} protected cases, clean restore and replay (CPU-only).`);
