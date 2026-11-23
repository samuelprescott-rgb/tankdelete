// Chrome-only attribution for the virtual Boot Camp harness. Browser trace
// categories record host tasks, not complete Metal command execution.
import { open, readFile } from 'node:fs/promises';
import path from 'node:path';

const categories=['blink.user_timing','devtools.timeline','toplevel','cc','viz','gpu','v8'];
const windowNames=['launch','inboundToImpact','centeredImpact','ignite','rollingFire'];
const round=n=>+n.toFixed(3);
const threadKey=e=>`${e.pid}:${e.tid}`;
const prefix='tankdelete.qa.napalm.';

export function summarizeImpactTrace(events, raw, strikes, limit) {
  const labels=new Map((raw.traceMarks??[]).map(m=>[m.name,m.t]));
  const marks=new Map(), processes=new Map(), threads=new Map(), stacks=new Map();
  const intervals=[];
  for(const e of events) {
    if(e.ph==='M') {
      if(e.name==='process_name')processes.set(e.pid,e.args?.name??'');
      if(e.name==='thread_name')threads.set(threadKey(e),e.args?.name??'');
      continue;
    }
    if(!Number.isFinite(e.ts))continue;
    if(labels.has(e.name)&&e.name.startsWith(prefix)&&e.cat?.includes('blink.user_timing'))marks.set(e.name,e);
    if(e.ph==='X'&&Number.isFinite(e.dur)&&e.dur>0)intervals.push(e);
    if(e.ph==='B') {
      const key=threadKey(e),stack=stacks.get(key)??[];
      stack.push(e);stacks.set(key,stack);
    } else if(e.ph==='E') {
      const begin=stacks.get(threadKey(e))?.pop();
      if(begin&&e.ts>begin.ts)intervals.push({...begin,dur:e.ts-begin.ts});
    }
  }
  const offsets=[...marks].map(([name,e])=>e.ts/1000-labels.get(name)).sort((a,b)=>a-b);
  const offsetMs=offsets[Math.floor(offsets.length/2)], spreadMs=offsets.at(-1)-offsets[0];
  const anchor=marks.get(prefix+'begin');
  const missing=[...labels.keys()].filter(name=>!marks.has(name));
  const alignment={usable:!!anchor&&offsets.length>=6&&!missing.length&&spreadMs<=1
      &&[...marks.values()].every(e=>threadKey(e)===threadKey(anchor)),
    marks:marks.size,expectedMarks:labels.size,offsetSpreadMs:Number.isFinite(spreadMs)?round(spreadMs):null,missing};
  if(!alignment.usable)return {alignment,thresholdMs:limit,gaps:[]};
  const role=e=>{
    const thread=threads.get(threadKey(e))??'', proc=processes.get(e.pid)??'', cat=e.cat??'';
    if(threadKey(e)===threadKey(anchor))return 'renderer-main';
    if(/tileworker|raster/i.test(thread)||/^Raster/.test(e.name))return 'raster';
    if(/viz/.test(cat)||/viz/i.test(thread))return 'viz';
    if(/gpu/i.test(thread)||/^gpu/i.test(proc)||/^gpu[,\s]|^gpu$/.test(cat))return 'gpu';
    if(/compositor/i.test(thread)||/(^|,)cc(,|$)/.test(cat))return 'compositor';
    if(/browser/i.test(proc)||/browser/i.test(thread))return 'browser';
    return null;
  };
  const relevant=intervals.flatMap(e=>{
    const lane=role(e);
    if(!lane)return [];
    return [{name:e.name,category:e.cat,lane,thread:threads.get(threadKey(e))??threadKey(e),
      start:e.ts/1000-offsetMs,end:(e.ts+e.dur)/1000-offsetMs}];
  });
  const byGap=new Map();
  for(let i=1;i<raw.rafTimestampsMs.length;i++) {
    const start=raw.rafTimestampsMs[i-1],end=raw.rafTimestampsMs[i];
    if(round(end-start)<=limit)continue;
    const matches=strikes.flatMap(s=>{
      const windows=windowNames.filter(name=>{
        const w=s.windows?.[name];return w&&start<w.toMs&&end>w.fromMs;
      });
      return windows.length?[{strike:s.use,windows,relativeToImpactMs:[round(start-s.impact.t),round(end-s.impact.t)]}]:[];
    });
    if(!matches.length)continue;
    byGap.set(i,{start,end,matches});
  }
  const gaps=[...byGap.values()].sort((a,b)=>(b.end-b.start)-(a.end-a.start));
  return { alignment,thresholdMs:limit,gapCount:gaps.length,
    gaps:gaps.slice(0,20).map(gap=>{
      const nearby=relevant.filter(e=>e.start<gap.end&&e.end>gap.start);
      const metrics=new Map();
      for(const e of nearby){
        const row={name:e.name,thread:e.thread,startFromGapMs:round(e.start-gap.start),durationMs:round(e.end-e.start),
          overlapMs:round(Math.min(e.end,gap.end)-Math.max(e.start,gap.start))};
        const group=metrics.get(e.lane)??[];group.push(row);metrics.set(e.lane,group);
      }
      return {startMs:round(gap.start),endMs:round(gap.end),durationMs:round(gap.end-gap.start),matches:gap.matches,
        lanes:Object.fromEntries([...metrics].map(([lane,rows])=>[lane,{
          overlappingEvents:rows.length,
          events:rows.sort((a,b)=>b.overlapMs-a.overlapMs).slice(0,8),
        }])),
        bufferUploads:(raw.bufferUploads??[]).filter(e=>e.t<gap.end&&e.end>=gap.start)
          .map(e=>({target:e.target,requestedBytes:e.requestedBytes,startFromGapMs:round(e.t-gap.start),apiReturnMs:round(e.end-e.t)})),
        longFrames:(raw.longFrames??[]).filter(e=>e.t<gap.end&&e.t+e.duration>gap.start)
          .map(e=>({startFromGapMs:round(e.t-gap.start),durationMs:round(e.duration),blockingMs:round(e.blockingDuration)})),
      };
    })};
}

export function createImpactTrace(send) {
  let complete;
  const stopped=new Promise(resolve=>{complete=resolve;});
  return {
    onEvent(m){if(m.method==='Tracing.tracingComplete')complete(m.params);},
    start:()=>send('Tracing.start',{transferMode:'ReturnAsStream',streamFormat:'json',
      traceConfig:{recordMode:'recordUntilFull',includedCategories:categories}}),
    async finish(output,napalm,limit){
      await send('Tracing.end');
      let timer,result;
      try {
        result=await Promise.race([stopped,new Promise((_,reject)=>{
          timer=setTimeout(()=>reject(new Error('Timed out draining browser trace')),35000);
        })]);
      } finally {clearTimeout(timer);}
      const handle=result?.stream;
      if(!handle)throw new Error('Browser did not return a trace stream');
      const fileName='impact-chromium-trace.json';
      const filePath=path.join(output,fileName);
      let file;
      try {
        file=await open(filePath,'wx');
        let eof=false;
        while(!eof){
          const chunk=await send('IO.read',{handle,size:1024*1024});
          if(chunk.data)await file.writeFile(chunk.base64Encoded?Buffer.from(chunk.data,'base64'):chunk.data);
          eof=chunk.eof;
          if(!eof&&!chunk.data)throw new Error('Browser trace stream made no progress');
        }
      } finally {
        try {await file?.close();} finally {await send('IO.close',{handle}).catch(()=>{});}
      }
      const resultFile=JSON.parse(await readFile(filePath,'utf8'));
      const raw=JSON.parse(await readFile(path.join(output,'impact-raw.json'),'utf8'));
      return {diagnosticOnly:true,file:fileName,categories,dataLossOccurred:result.dataLossOccurred,
        caution:'Tracing can perturb rAF. Lanes are overlapping host trace activity, not additive or proof of causation or completed GPU work. Buffer measurements cover host API calls and requested bytes. Re-run acceptance without tracing.',
        ...summarizeImpactTrace(resultFile.traceEvents??[],raw,napalm?.strikes??[],limit)};
    },
  };
}
