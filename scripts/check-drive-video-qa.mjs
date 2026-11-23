// CPU-only contract tests. All CDP replies and clock readings are injected.
// No Chrome, GPU, application, or gameplay evidence is used or produced.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createDriveVideo,createScreenshotCapture} from './drive-video-qa.mjs';
const run=promisify(execFile);
function channel(){
  const items=[],readers=[];
  return {put:v=>readers.length?readers.shift()(v):items.push(v),
    take:()=>items.length?Promise.resolve(items.shift()):new Promise(resolve=>readers.push(resolve))};
}

test('serial real-sized surface requests, four separate stills, midpoint VFR and draining stop',async()=>{
  // A tiny CPU-generated JPEG here tests the exact per-frame dimension check.
  // Production uses the requested viewport dimensions, including 1920x1080.
  const {stdout:fixture}=await run('ffmpeg',['-nostdin','-loglevel','error','-f','lavfi','-i','color=c=blue:size=96x64',
    '-frames:v','1','-threads','1','-f','image2pipe','-c:v','mjpeg','pipe:1'],{encoding:'buffer'});
  const jpeg=fixture.toString('base64'),sent=channel(),naps=channel(),requests=[];
  let clock=100,active=0;
  const now=()=>clock;
  const page=(method,params)=>{
    assert.equal(method,'Page.captureScreenshot');assert.equal(active++,0,'overlapping CDP commands');
    assert.equal(params.fromSurface,true);assert.equal(params.captureBeyondViewport,false);
    requests.push(params.format);
    return new Promise(resolve=>sent.put({format:params.format,reply:at=>{
      clock=at;active--;resolve({data:params.format==='jpeg'?jpeg:'mock PNG'});}}));
  };
  const capture=createScreenshotCapture(page,now),output=await mkdtemp(path.join(tmpdir(),'tankdelete-mocked-video-'));
  const rec=createDriveVideo(page,{width:96,height:64,output,now,capture,wait:ms=>new Promise(resolve=>naps.put({ms,resolve}))});
  const file='boot-camp-bridge-drive.mp4',timeline='boot-camp-bridge-drive-timestamps.json';
  try{
    await rec.start();
    const first=await sent.take();assert.equal(first.format,'jpeg');
    const photos=Promise.all(Array.from({length:4},()=>capture({format:'png',fromSurface:true,captureBeyondViewport:false})));
    first.reply(120);
    const png=await sent.take();assert.equal(png.format,'png');
    const firstGap=await naps.take();assert.equal(firstGap.ms,30);
    clock=150;firstGap.resolve(); // recorder is now queued behind all four PNGs
    png.reply(160);
    for(const end of [175,183,199]){
      const next=await sent.take();assert.equal(next.format,'png');next.reply(end);
    }
    await photos;
    const second=await sent.take();assert.equal(second.format,'jpeg');second.reply(209);
    const secondGap=await naps.take();assert.equal(secondGap.ms,40);clock=249;secondGap.resolve();
    const third=await sent.take();third.reply(318); // slower than the 50 ms interval
    const last=await sent.take();
    let stopped=false;const stopping=rec.stop().then(()=>{stopped=true;});await Promise.resolve();
    assert.equal(stopped,false,'stop returned with an unanswered screenshot');last.reply(340);await stopping;
    const report=await rec.finish();
    assert.deepEqual(requests,['jpeg','png','png','png','png','jpeg','jpeg','jpeg']);
    assert.deepEqual([report.frames,report.encodedWidth,report.encodedHeight],[4,96,64]);
    assert.match(report.timing,/not compositor presentation timestamps, game FPS/);
    const evidence=JSON.parse(await readFile(path.join(output,timeline),'utf8'));
    assert.deepEqual(evidence.samples,[
      {requestMs:100,responseMs:120,midpointMs:110,ptsMs:0},
      {requestMs:199,responseMs:209,midpointMs:204,ptsMs:94},
      {requestMs:249,responseMs:318,midpointMs:283.5,ptsMs:174},
      {requestMs:318,responseMs:340,midpointMs:329,ptsMs:219}]);
    assert.ok(Math.abs(report.durationSeconds-.220)<.001);
  }finally{
    await Promise.all([file,timeline].map(f=>unlink(path.join(output,f)).catch(e=>{if(e.code!=='ENOENT')throw e;})));
    await rmdir(output);
  }
});

test('invalid bounds and canceled queued turns are rejected or skipped without synthesizing timestamps',async()=>{
  for(const times of [[10,9],[10,10],[10,NaN],[NaN]]){
    const capture=createScreenshotCapture(async()=>({data:'pixel'}),()=>times.shift());
    await assert.rejects(capture({}),/screenshot (request|response) bound/);
  }
  const times=[10,12,11],sent=[];
  const capture=createScreenshotCapture(async()=>{sent.push(1);return {data:'pixel'};},()=>times.shift());
  await capture({});
  assert.equal(await capture({},()=>false),null);
  await assert.rejects(capture({}),/reversed screenshot request bound/);
  assert.equal(sent.length,1);
});
