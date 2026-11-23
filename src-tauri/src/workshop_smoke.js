// Optional workshop smoke. The only click enters the desk; nothing invokes
// native file commands. The only transport probes target the observer on the
// numeric IPv4 loopback address. No external DNS name or internet destination.
(() => {
  if (window.top!==window || location.href.split('/').slice(0,3).join('/')!=='tauri://localhost') return;
  const visible=el=>!!el && el.getClientRects().length>0;
  const button=label=>[...document.querySelectorAll('button')].find(el=>visible(el)&&!el.disabled&&el.textContent.trim()===label);
  let menuAt=0,opened=false,desk=false;
  const deadline=Date.now()+30000;
  const timer=setInterval(()=>{
    if(Date.now()>deadline){clearInterval(timer);return;}
    if(!menuAt && visible(document.querySelector('.directory-picker h1')) && ['Start Campaign','Boot Camp','Cleanup Desk'].every(button)){
      menuAt=Date.now();document.title='TankDelete · menu verified';
    }else if(menuAt&&!opened&&Date.now()-menuAt>5000){
      const target=button('Cleanup Desk');if(!target)return;opened=true;target.click();
    }else if(opened&&!desk&&visible(document.getElementById('desk-title'))&&document.getElementById('desk-title').textContent==='Cleanup Desk' &&
        ['Choose files on this Mac…','Rehearse with sample files','Back to menu'].every(button)){
      desk=true;document.title='TankDelete · desk verified';clearInterval(timer);
      const port=Number("WORKSHOP_PROBE_PORT");if(port>=1024&&port<=65535)setTimeout(()=>probe(port),2400);
    }
  },120);
  function probe(port) {
    const received=new Set();
    document.addEventListener('securitypolicyviolation',e=>received.add(e.effectiveDirective.split(' ')[0]));
    const url='https://127.0.0.1:'+port+'/workshop-offline-test'; const outcomes=[false,false,false,false];
    fetch(url).catch(()=>outcomes[0]=true);
    const img=new Image();img.onerror=()=>outcomes[1]=true;img.hidden=true;document.body.append(img);img.src=url+'/image';
    try {const sock=new WebSocket('wss://127.0.0.1:'+port+'/socket');sock.onerror=()=>outcomes[2]=true;}catch {outcomes[2]=true;}
    const frame=document.createElement('iframe');frame.hidden=true;document.body.append(frame);frame.src=url+'/frame';outcomes[3]=true;
    setTimeout(()=>{
      img.remove();frame.remove();
      const bits=[...outcomes,...['connect-src','img-src','frame-src'].map(x=>received.has(x))];
      document.title='TankDelete policy '+bits.map(v=>v?'1':'0').join('');
    },2800);
  }
})();
