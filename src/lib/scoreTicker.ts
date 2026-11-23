/** The HUD owns one numeric text node. A score tick needn't schedule another
 * component render while fire, files and world transforms are also updating. */
export function animateScore(start:number,target:number,paint:(n:number)=>void,
  now:()=>number,request:(fn:(t:number)=>void)=>number,cancel:(id:number)=>void){
  const duration=Math.min(Math.abs(target-start)*2,1000);
  if(!duration)return ()=>{};
  const begins=now();let id=0,last=start,stopped=false;
  function tick(t:number){
    if(stopped)return;
    const p=Math.min(1,Math.max(0,(t-begins)/duration));
    const n=Math.round(start+(target-start)*(1-(1-p)**3));
    if(n!==last){last=n;paint(n);}
    id=p<1?request(tick):0;
  }
  id=request(tick);return ()=>{stopped=true;if(id)cancel(id);};
}
