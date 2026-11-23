import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const src=await readFile(new URL('../src/lib/worldGunAudio.ts',import.meta.url),'utf8');
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
const {WorldGunBank,WorldGunVoice,primeWorldGunBank,WORLD_GUN_PATHS,NAPALM_SEQUENCE_CLIP,NapalmSequencePool}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const urls=[...Object.values(WORLD_GUN_PATHS),NAPALM_SEQUENCE_CLIP], fetched=[], elements=[];
let releaseDecode,holdDecode=false;
class Source {
  playbackRate={value:1}; stops=0; disconnected=false; connect(gain){this.gain=gain;}
  start(when,offset){this.startArgs=[when,offset];} stop(){this.stops++;} disconnect(){this.disconnected=true;}
}
class Context {
  state='suspended'; sources=[]; gains=[]; destination={}; closes=0;
  resume(){this.state='running';return Promise.resolve();}
  close(){this.state='closed';this.closes++;return Promise.resolve();}
  createBufferSource(){const source=new Source();this.sources.push(source);return source;}
  createGain(){const g={gain:{value:1},connect(dest){this.output=dest;},disconnect(){this.off=true;}};this.gains.push(g);return g;}
  async decodeAudioData(bytes){if(holdDecode)await new Promise(r=>releaseDecode=r);return {duration:7.4,bytes};}
}
class Media {
  paused=true;volume=1;currentTime=0;plays=0;loads=0;listeners=new Map();
  constructor(src){this.src=src;elements.push(this);}
  play(){this.plays++;this.paused=false;return Promise.resolve();}
  pause(){this.paused=true;}removeAttribute(){this.src='';}load(){this.loads++;}
  addEventListener(k,f){this.listeners.set(k,f);}removeEventListener(k,f){if(this.listeners.get(k)===f)this.listeners.delete(k);}
}
globalThis.Audio=Media;globalThis.window={AudioContext:Context};
globalThis.fetch=async(url,{signal})=>{fetched.push([url,signal]);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(12)};};
const bank=primeWorldGunBank(),ctx=bank.context;
await new Promise(setImmediate);
assert.equal(ctx.state,'running');
assert.deepEqual(fetched.map(v=>v[0]).sort(),urls.slice().sort());
assert.equal(new Set(urls).size,7);
for(const url of urls){
  assert.ok(bank.buffers.has(url));
  // Confirm this is a real shipped WAV, not an accidentally renamed or nonexistent source.
  const bytes=await readFile(new URL('../public'+url,import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');
  if(url===NAPALM_SEQUENCE_CLIP){
    assert.equal(bytes.readUInt32LE(24),48000);assert.equal(bytes.readUInt32LE(bytes.indexOf('data')+4),862247*2);
  }
}
const url=WORLD_GUN_PATHS.enemy,voice=new WorldGunVoice(bank,url),second=new WorldGunVoice(bank,url);
let ends=0;voice.onended=()=>ends++;voice.volume=.08;voice.currentTime=.7;voice.playbackRate=1.22;
await voice.play();await voice.play();await second.play();
assert.equal(ctx.sources.length,2,'one source per active voice; repeated play never doubles it');
const first=ctx.sources[0];assert.deepEqual(first.startArgs,[0,.7]);assert.equal(first.playbackRate.value,1.22);
assert.equal(first.buffer,ctx.sources[1].buffer,'parallel slots use the same predecoded sample');
assert.equal(first.gain.output,ctx.destination);assert.equal(first.gain.gain.value,.08);assert.equal(elements.length,0);
voice.volume=0;assert.equal(first.gain.gain.value,0,'mute takes effect mid-burst');
voice.volume=.035;assert.equal(first.gain.gain.value,.035,'master/effects mix can recover mid-burst');
const lateEnd=first.onended;voice.pause();voice.pause();
assert.equal(first.stops,1);assert.equal(first.disconnected,true);assert.equal(voice.paused,true);
await voice.play();lateEnd();assert.equal(ends,0);assert.equal(voice.paused,false);
ctx.sources[2].onended();assert.equal(ends,1);assert.equal(voice.paused,true);assert.equal(ctx.gains.length,2);
second.dispose();assert.equal(ctx.sources[1].stops,1);assert.equal(ctx.gains[1].off,true);
await assert.rejects(second.play(),/disposed/i);

// An early/failing decode or locked context preserves the real HTML clip for
// that shot. When the buffer arrives mid-shot there is no stale/double replay.
const warmBank=new WorldGunBank(ctx),early=new WorldGunVoice(warmBank,url);
early.currentTime=.5;early.playbackRate=.97;early.volume=.30;
await early.play();const media=elements.at(-1);
assert.equal(media.src,url);assert.equal(media.currentTime,.5);assert.equal(media.playbackRate,.97);
assert.equal(media.volume,.3);early.volume=0;assert.equal(media.volume,0);
const finishedFallback=media.onended;let duplicates=0;early.onended=()=>duplicates++;
await warmBank.preload(url);await early.play();assert.equal(ctx.sources.length,3);
early.pause();await early.play();assert.equal(ctx.sources.length,4);
finishedFallback();assert.equal(duplicates,0,'old HTML ended event cannot release newly scheduled buffer');
early.dispose();assert.equal(media.loads,1);assert.equal(media.src,'');
ctx.state='suspended';const locked=new WorldGunVoice(bank,url);await locked.play();assert.equal(elements.length,2);locked.dispose();
const bad=new WorldGunBank(ctx);const prev=globalThis.fetch;
globalThis.fetch=async()=>({ok:false});await bad.preload(url);assert.equal(bad.buffers.size,0);globalThis.fetch=prev;

// Full-length synchronized strike starts exactly once, after scheduling on a
// running output; settings affect live sound, and restarting stops the oldest slot.
const strikeContext=new Context(),strikeBank=new WorldGunBank(strikeContext);await strikeContext.resume();
await strikeBank.preload(NAPALM_SEQUENCE_CLIP);
const pool=new NapalmSequencePool(strikeBank);pool.volume=.66;let strikes=0;
strikeContext.currentTime=2.125;
strikeContext.getOutputTimestamp=()=>({contextTime:2,performanceTime:4500});
const strike=audibleAt=>{assert.ok(strikeContext.sources.at(-1).startArgs);
  assert.equal(audibleAt,4625,'The visual timeline starts when the scheduled sample reaches output');strikes++;};
pool.start(strike);assert.equal(strikes,1);
assert.equal(strikeContext.sources[0].buffer,strikeBank.buffers.get(NAPALM_SEQUENCE_CLIP));
assert.deepEqual(strikeContext.sources[0].startArgs,[0,0]);assert.equal(strikeContext.sources[0].playbackRate.value,1);
assert.equal(strikeContext.sources[0].gain.gain.value,.66);pool.volume=0;
assert.equal(strikeContext.sources[0].gain.gain.value,0);pool.volume=.25;pool.start(strike);pool.start(strike);
assert.deepEqual(strikeContext.sources.map(v=>v.stops),[1,0,0]);assert.equal(strikes,3);
pool.stop();assert.deepEqual(strikeContext.sources.map(v=>v.stops),[1,1,1]);pool.start(strike);
assert.equal(strikes,4);pool.dispose();pool.start(strike);assert.equal(strikes,4);
assert.ok(strikeContext.gains.every(g=>g.off));

// Cover every fallback ordering: 'playing' then promise, obsolete rejection after
// cancellation, 1.5s deadline then a late start, a real playback error, and exit.
const timers=new Map();let timerId=0;
window.setTimeout=(f,ms)=>{assert.equal(ms,1500);timers.set(++timerId,f);return timerId;};
window.clearTimeout=id=>timers.delete(id);
let pending=[];Media.prototype.play=function(){this.paused=false;return new Promise((res,rej)=>pending.push({res,rej}));};
const fallback=new NapalmSequencePool(new WorldGunBank(null));fallback.volume=.66;let starts=0;
fallback.start(()=>starts++);const fallbackAudio=elements.at(-1);
assert.equal(fallbackAudio.src,NAPALM_SEQUENCE_CLIP);assert.equal(fallbackAudio.volume,.66);
fallbackAudio.listeners.get('playing')();pending.shift().res();await Promise.resolve();
assert.equal(starts,1);assert.equal(timers.size,0);fallback.volume=.31;assert.equal(fallbackAudio.volume,.31);
fallback.stop();fallback.start(()=>starts++);const oldPlaying=fallbackAudio.listeners.get('playing');
fallback.stop();fallback.start(()=>starts++);oldPlaying();pending.shift().rej(Error('old'));await Promise.resolve();
assert.equal(starts,1);assert.equal(fallbackAudio.paused,false,'old rejection cannot stop a replacement');
[...timers.values()][0]();assert.equal(fallbackAudio.paused,true);assert.equal(starts,2);
pending.shift().res();await Promise.resolve();assert.equal(starts,2);
fallback.start(()=>starts++);pending.shift().rej(Error('blocked'));await Promise.resolve();
assert.equal(starts,3);assert.equal(fallbackAudio.paused,true);
fallback.start(()=>starts++);fallback.dispose();pending.shift().res();await Promise.resolve();
assert.equal(starts,3);assert.equal(timers.size,0);

// Exit aborts in-flight requests; an already-decoding clip cannot resurrect
// the old session. Closing twice cannot close a subsequent session's context.
holdDecode=true;const dying=new WorldGunBank(new Context());
const pendingDecode=dying.preload(url);await new Promise(setImmediate);dying.dispose();dying.dispose();
assert.equal(fetched.at(-1)[1].aborted,true);releaseDecode();await pendingDecode;
assert.equal(dying.buffers.size,0);assert.equal(dying.context.closes,1);
voice.dispose();bank.dispose();bank.dispose();assert.equal(ctx.closes,1);
console.log('Six AI WAVs and full original napalm WAV: pooled mix/offset/rate, live mute, synchronized start, fallback races, cancellation and teardown passed.');
