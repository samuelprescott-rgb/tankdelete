// Visual QA only. Pull pixels from the attached page's composed surface;
// this does not sample the application's render loop or the display clock.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {performance} from 'node:perf_hooks';
import {setTimeout as sleep} from 'node:timers/promises';
import path from 'node:path';
const run=promisify(execFile);
const monotonicNow=()=>performance.now();
const minIntervalMs=50, maxBytes=256*1024*1024, maxSamples=1500;
const timing='Asynchronous, uninstrumented page screenshots. Host monotonic request/response midpoints estimate exposure; not compositor presentation timestamps, game FPS, or GPU timing.';

// The PNG photographer and JPEG recorder must share this queue. Bracket the
// actual CDP command inside its turn, not time spent waiting behind a PNG.
export function createScreenshotCapture(page,now=monotonicNow){
  let tail=Promise.resolve(),lastResponse=-Infinity;
  return (params,stillWanted=()=>true)=>{
    const turn=tail.then(async()=>{
      if(!stillWanted())return null;
      const requestMs=now();
      if(!Number.isFinite(requestMs)||requestMs<lastResponse)throw Error('Invalid or reversed screenshot request bound');
      const {data}=await page('Page.captureScreenshot',params);
      const responseMs=now();
      if(!Number.isFinite(responseMs)||responseMs<=requestMs)throw Error('Invalid or reversed screenshot response bound');
      lastResponse=responseMs;
      return {data,requestMs,responseMs,midpointMs:requestMs+(responseMs-requestMs)/2};
    });
    tail=turn.then(()=>{},()=>{});
    return turn;
  };
}

// Chromium supplies standard baseline or progressive JPEGs. Reject an
// unexpected viewport in *any* sample rather than letting ffmpeg resize it.
function checkJpegSize(data,width,height){
  if(data.length>=4&&data.readUInt16BE(0)===0xffd8){
    for(let i=2;i+4<data.length;){
      if(data[i++]!==0xff)break;
      while(data[i]===0xff)i++;
      if(i+3>data.length)break;
      const marker=data[i++],size=data.readUInt16BE(i);
      if(size<2||i+size>data.length||marker===0xda||marker===0xd9)break;
      if(marker===0xc0||marker===0xc1||marker===0xc2){
        if(size>=8&&data.readUInt16BE(i+3)===height&&data.readUInt16BE(i+5)===width)return;
        break;
      }
      i+=size;
    }
  }
  throw Error('Invalid JPEG or unexpected screenshot dimensions; expected '+width+'x'+height);
}

export function createDriveVideo(page,{width,height,output,route='boot-camp-bridge-drive',
  now=monotonicNow,capture=createScreenshotCapture(page,now),wait=sleep}){
  if(!['boot-camp-bridge-drive','embassy-approach','embassy-early-approach','embassy-player-approach'].includes(route))throw Error('Unknown local game recording route');
  const frames=[];
  let bytes=0,started=false,stopped=false,loop,failure,preflight;
  const prepare=()=>preflight??=Promise.all(['ffmpeg','ffprobe'].map(bin=>run(bin,['-version'])));
  async function collect(){
    while(!stopped){
      const sample=await capture({format:'jpeg',quality:88,fromSurface:true,captureBeyondViewport:false},()=>!stopped);
      if(!sample)break; // stop canceled a queued turn, not a sent command
      const {requestMs,responseMs,midpointMs}=sample;
      if(typeof sample.data!=='string'||!sample.data.length)throw Error('Missing screenshot data');
      if(frames.length>=maxSamples||sample.data.length>4*Math.ceil((maxBytes-bytes)/3))throw Error('Drive recording exceeded frame or memory cap');
      const data=Buffer.from(sample.data,'base64');
      bytes+=data.length;
      if(bytes>maxBytes)throw Error('Drive recording exceeded memory cap');
      checkJpegSize(data,width,height);
      frames.push({requestMs,responseMs,midpointMs,data});
      // At most one request per 50 ms. A slow capture never accumulates a
      // backlog of missed ticks. stop() keeps an already-sent final sample.
      while(!stopped){
        const currentMs=now();
        if(!Number.isFinite(currentMs)||currentMs<responseMs)throw Error('Invalid or reversed capture scheduling clock');
        const delay=Math.ceil(requestMs+minIntervalMs-currentMs);
        if(delay<=0)break;
        await wait(delay); // also handles timers waking slightly early
      }
    }
  }
  async function stop(){
    stopped=true;await loop;
    if(failure)throw failure;
  }
  return {prepare,stop,
    async start(){
      if(started||stopped)throw Error('Recorder is not startable');
      started=true;await prepare();
      if(!stopped)loop=collect().catch(e=>{failure=e;});
    },
    async finish(){
      await stop();
      if(frames.length<3)throw Error('Missing gameplay video frames');
      const pts=frames.map(f=>Math.round(f.midpointMs-frames[0].midpointMs));
      if(pts.some((t,i)=>!Number.isSafeInteger(t)||(i>0&&(t<=pts[i-1]||frames[i].requestMs<frames[i-1].responseMs))))
        throw Error('Overlapping or unrepresentable screenshot sample bounds');
      const dir=await mkdtemp(path.join(tmpdir(),'tankdelete-video-')),files=[];
      const file=route+'.mp4',timeline=route+'-timestamps.json';
      try{
        const list=['ffconcat version 1.0'];
        for(const [i,f] of frames.entries()){
          const name='frame-'+i+'.jpg',full=path.join(dir,name);
          files.push(full);await writeFile(full,f.data);f.data=null;
          list.push("file '"+name+"'","option framerate 1000");
          if(i<frames.length-1)list.push('duration '+((pts[i+1]-pts[i])/1000).toFixed(3));
        }
        const manifest=path.join(dir,'frames.ffconcat');
        files.push(manifest);await writeFile(manifest,list.join('\n')+'\n');
        await run('ffmpeg',['-nostdin','-loglevel','error','-n','-f','concat','-safe','0','-i',manifest,
          '-an','-fps_mode','vfr','-enc_time_base','1:1000','-c:v','libx264','-bf','0','-preset','veryfast','-crf','18','-pix_fmt','yuv420p',
          '-video_track_timescale','1000','-movflags','+faststart',path.join(output,file)]);
        const {stdout}=await run('ffprobe',['-v','error','-select_streams','v:0','-show_entries',
          'frame=best_effort_timestamp_time:stream=width,height,nb_frames,duration','-of','json',path.join(output,file)]);
        const {streams:[s],frames:encoded}=JSON.parse(stdout);
        if(!s||s.width!==width||s.height!==height||Number(s.nb_frames)!==frames.length||
          !Number.isFinite(Number(s.duration))||Math.abs(Number(s.duration)-pts.at(-1)/1000)>.05||
          encoded?.length!==frames.length||encoded.some((f,i)=>Math.round(Number(f.best_effort_timestamp_time)*1000)!==pts[i]))
          throw Error('Encoded video dimensions, frame count, duration or sample timestamps differed from capture');
        const samples=frames.map(({requestMs,responseMs,midpointMs},i)=>({requestMs,responseMs,midpointMs,ptsMs:pts[i]}));
        await writeFile(path.join(output,timeline),JSON.stringify({source:'CDP Page.captureScreenshot fromSurface JPEG',timing,
          clock:'Node performance.now() monotonic milliseconds, process-relative; PTS rounded to milliseconds relative to first midpoint',
          minimumRequestIntervalMs:minIntervalMs,samples},null,2),{flag:'wx'});
        return {file,timeline,frames:frames.length,durationSeconds:Number(s.duration),encodedWidth:s.width,encodedHeight:s.height,
          audio:false,captureMethod:'serial CDP Page.captureScreenshot fromSurface JPEG',timing,
          source:route==='embassy-player-approach'?'Actual earned replay; ordinary HUD visible throughout, stationary chase camera.':route.startsWith('embassy-')?'Actual earned replay; normal, stationary chase camera, only DOM overlays hidden.':'Isolated virtual Boot Camp game tab; normal chase camera and keyboard input.'};
      }finally{await Promise.all(files.map(f=>unlink(f).catch(()=>{})));await rmdir(dir);}
    }};
}
