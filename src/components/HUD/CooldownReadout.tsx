import {useEffect,useState} from 'react';

export function CooldownReadout({until}:{until:number}) {
  const read=()=>Math.max(0,Math.ceil((until-Date.now())/100));
  const [tenth,setTenth]=useState(read);
  useEffect(()=>{
    let handle:number|undefined;
    const update=()=>{
      const left=until-Date.now();
      setTenth(Math.max(0,Math.ceil(left/100)));
      if(left>0)handle=window.setTimeout(update,(left%100)||100);
    };
    update();return ()=>window.clearTimeout(handle);
  },[until]);
  return <>{(tenth/10).toFixed(1)}s</>;
}
