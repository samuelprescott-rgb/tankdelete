import {useEffect, useState} from 'react';
import type {EmbassyArchive} from '../../lib/embassyDefense';
import {FIELD_PATCH_POINTS, type FieldKitUse} from '../../hooks/useZombieEpilogue';

export interface FieldKitPanelProps {
  wave: number;
  archives: readonly EmbassyArchive[];
  deadline: number;
  kit: FieldKitUse | null;
  onSpend: (target:string) => boolean;
  onProceed: () => boolean;
}

/** Only dispatches to the in-memory encounter, never file commands. */
export function FieldKitPanel(props:FieldKitPanelProps) {
  const [now,setNow] = useState(Date.now);
  useEffect(()=>{
    const timer=window.setInterval(()=>setNow(Date.now()),250);
    return ()=>window.clearInterval(timer);
  },[props.deadline]);
  return <FieldKitView {...props} seconds={Math.max(0,Math.ceil((props.deadline-now)/1000))} />;
}

export function FieldKitView({wave, archives, seconds, kit, onSpend, onProceed}:FieldKitPanelProps & {seconds:number}) {
  const destination=kit?.target==='hull'?'tank':archives.find(a=>a.id===kit?.target)?.label;
  return <section className="field-kit" data-game-ui aria-label="Between-wave field kit">
    <div className="field-kit__header"><strong>FIELD WORKSHOP</strong><span aria-label={'Wave '+wave+' in '+seconds+' seconds'}>WAVE {wave} · {seconds}s</span></div>
    {kit ? <p role="status">{kit.type==='patch' ? `Patched ${destination} · +${kit.amount} integrity` :
      kit.type==='plate' ? 'Spare plate fitted · next horde breach blocked' : `Braced ${destination} · next hit blocked`}</p> :
      <><p>One kit. Protect the tank or one surviving file.</p>
        <div className="field-kit__choices">
          <button type="button" onClick={()=>onSpend('hull')}><b>Tank</b><span>Plate · block 1 breach</span></button>
          {archives.filter(a=>a.health>0).map(a=><button type="button" key={a.id} onClick={()=>onSpend(a.id)}>
            <b>{a.label}</b><span>{a.health<a.maxHealth ? `Patch · +${Math.min(FIELD_PATCH_POINTS,a.maxHealth-a.health)} integrity` : 'Brace · block 1 hit'}</span>
          </button>)}
        </div>
      </>}
    <button className="field-kit__proceed" type="button" onClick={()=>onProceed()}>
      {kit?'Start':'Skip kit · start'} wave {wave} now <span aria-hidden="true">→</span>
    </button>
  </section>;
}
