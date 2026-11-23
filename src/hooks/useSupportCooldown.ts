import {useCallback,useEffect,useRef,useState} from 'react';

// The scene needs the start, camera-release and ready edges. Only the small
// HUD number needs tenths. Never reconcile the live world on a readout tick.
export function useSupportCooldown(cameraTailMs = 0) {
  const readyAt=useRef(0);
  const [until,setUntil]=useState(0);
  const [tailFor,setTailFor]=useState(0);
  const start=useCallback((seconds:number)=>{
    const end=seconds>0?Date.now()+seconds*1000:0;
    readyAt.current=end; setUntil(end);
    setTailFor(0);
  },[]);
  useEffect(()=>{
    if(!until)return;
    const now=Date.now();
    const release=cameraTailMs>0?window.setTimeout(()=>{
      if(readyAt.current===until)setTailFor(until);
    },Math.max(0,until-now-cameraTailMs)):undefined;
    const done=window.setTimeout(()=>{
      if(readyAt.current===until){readyAt.current=0;setUntil(0);}
    },Math.max(0,until-now));
    return ()=>{window.clearTimeout(release);window.clearTimeout(done);};
  },[until,cameraTailMs]);
  return {readyAt,until,start,cinematic:until>0&&tailFor!==until};
}
