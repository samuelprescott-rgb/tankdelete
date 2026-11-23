// Windowless corroboration ONLY. The injected gameplay route and reporting are
// shared with system WKWebView, but this cannot prove native display or focus.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const [engine,origin,order]=process.argv.slice(2);
const url=new URL(origin);
if(!['chrome','webkit'].includes(engine)||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!['1485','1488'].includes(url.port)||url.pathname!=='/'||order!=='back')throw Error('Expected isolated headless Boot Camp QA');
const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
const script=Buffer.concat(chunks).toString('utf8');
const pw=require('playwright');
const browser=await (engine==='chrome'?pw.chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--no-first-run']}):pw.webkit.launch({headless:true}));
try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  let done,fail;
  const result=new Promise((resolve,reject)=>{done=resolve;fail=reject;});
  page.on('crash',()=>fail(Error('Headless renderer crashed')));
  await page.exposeBinding('__headlessStrikeInput',async({frame},event)=>{
      if(frame!==page.mainFrame()||new URL(frame.url()).href!==origin)throw Error('Unexpected QA input origin');
      if(event.op==='done'){done(event.report);return;}
      if(event.op==='phase')return;
      // Diagnostic-only clock. It belongs to this windowless harness, never
      // a physical-presentability measurement. Do not route it into mouse input.
      if(event.op==='clockSync'&&Number.isSafeInteger(event.id)&&event.id>=0&&event.id<100){
        const host=performance.now();
        await frame.evaluate(({id,host})=>window.__wkClockReply?.(id,host),{id:event.id,host});return;
      }
      const {op,x,y}=event;if(!['move','click'].includes(op)||![x,y].every(Number.isFinite)||x<0||x>=1920||y<0||y>=1080)throw Error('Unexpected QA input');
      await (op==='click'?page.mouse.click(x,y):page.mouse.move(x,y));
  });
  const peak=url.port==='1488';
  // The production menu reads its earned-replay record on mount. Match
  // WKUserScript's document-start seed for the isolated peak route, before
  // React mounts. No reload, modified game script or skip button is needed.
  if(peak)await page.addInitScript({content:'if(top===self&&location.href==='+JSON.stringify(origin)+'){window.__headlessStrikePort={postMessage:e=>window.__headlessStrikeInput(e)};'+script+';}'});
  await page.goto(origin);
  if(!peak)await page.evaluate(()=>{window.__headlessStrikePort={postMessage:window.__headlessStrikeInput};});
  const timer=setTimeout(()=>fail(Error('Headless route timed out')),150000);
  let report;try{
    if(!peak)page.evaluate(script).catch(fail);report=await result;
  }finally{clearTimeout(timer);}
  report.headless={engine,version:browser.version(),nativeWindow:false};
  process.stdout.write(JSON.stringify(report)+'\n');
}finally{await browser.close();}
