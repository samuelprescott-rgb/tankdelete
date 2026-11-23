import {useEffect,useRef,useState} from 'react';
import {canPickReal,forgetReal,pickReal,reviewReal,sampleSelection,type CleanupReceipt,type CleanupSelection} from '../lib/cleanupDesk';
import {formatBytes} from '../lib/format';

export interface DeskReview {selection:CleanupSelection;ids:string[]}
export function CleanupRoster({selection,identified,identify}:{selection:CleanupSelection;identified:string;identify:(id:string)=>void}){
  const [expanded,setExpanded]=useState(true);
  return <aside className="cleanup-roster" data-game-ui aria-label="Numbered file targets">
    <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}><strong>Field index</strong><span>{selection.files.length} huts {expanded?'▴':'▾'}</span></button>
    {expanded&&<><p>Select a row to highlight its number above the hut. Fire the cannon to nominate.</p>
    <ol>{selection.files.map((f,i)=><li key={f.id}><button type="button" aria-pressed={identified===f.id} onClick={()=>identify(f.id)}>
      <b>{String(i+1).padStart(2,'0')}</b><span>{f.name}<small dir="ltr">{f.path.slice(0,f.path.lastIndexOf('/')).trimEnd()}</small></span></button></li>)}</ol></>}
  </aside>;
}
const resultText:Record<CleanupReceipt,string>={trashed:'Moved to Mac Trash · recover with Finder → Trash → Put Back.',
  cancelled:'Kept · no change.',changed:'File changed or moved. Nothing was sent to Trash. Pick it again to reconsider.',
  expired:'Selection expired. Nothing was sent to Trash.',failed:'macOS did not confirm a Trash move. Check Finder; this selection will not be retried.',
  busy:'Another native dialog is open.'};
export function CleanupDesk({review,start,exit}:{review:DeskReview|null;start:(s:CleanupSelection)=>void;exit:()=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[results,setResults]=useState<Record<string,CleanupReceipt>>({});
  const [sampleId,setSampleId]=useState(''); const lock=useRef(false), heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus();},[review]);
  const mac=canPickReal(); const sample=review?.selection.source==='sample';
  async function pick(){if(lock.current) return; lock.current=true;setBusy(true);setError('');
    try{const selection=await pickReal();if(selection) start(selection);}catch(e){forgetReal();setError(e instanceof Error?e.message:'The macOS picker is unavailable.');}
    finally{lock.current=false;setBusy(false);}}
  async function inspect(id:string){if(lock.current||!review?.ids.includes(id))return;
    if(sample){setSampleId(id);return;}
    lock.current=true;setBusy(true);
    try{const outcome=await reviewReal(id);setResults(r=>({...r,[id]:outcome}));}catch{setResults(r=>({...r,[id]:'failed'}));}
    finally{lock.current=false;setBusy(false);}
  }
  return <main className="cleanup-desk" aria-labelledby="desk-title">
    <small className="era-stamp">FILE SERVICES // {review?(sample?'REHEARSAL':'MACOS REVIEW'):'OPTIONAL MODE'}</small>
    <h1 id="desk-title" tabIndex={-1} ref={heading}>{review?'Review your shortlist':'Cleanup Desk'}</h1>
    {!review?<><p>You choose the files. The tank makes a shortlist. Nothing is moved by a shot.</p>
      <ol><li><b>Pick.</b> Select up to 12 ordinary local files, never a whole folder. Only their names, paths and sizes are used, not their contents.</li>
      <li><b>Nominate.</b> Drive with WASD. Aim and fire the cannon at a numbered hut to add it to review.</li>
      <li><b>Review.</b> Leave the field. Check the full path, then use the separate macOS confirmation for each file you want moved to Trash. Keep file is the default.</li></ol>
      <div className="desk-actions">{mac&&<button className="btn-primary" disabled={busy} onClick={pick}>Choose files on this Mac…</button>}
      <button className="btn-secondary" disabled={busy} onClick={()=>start(sampleSelection())}>Rehearse with sample files</button></div>
      {!mac&&<small>Browser &amp; non-Mac builds: sample files only. Real cleanup requires the packaged Mac app.</small>}
      <small>Independent of campaign progress. No directory scans, uploads or permanent deletion.</small>
    </>:<><p>{sample?'Sample files only. Rehearse the review without accessing this computer.':'These are the only files your cannon nominated. Review each exact path. No file moves without the separate native dialog.'}</p>
      {!review.ids.length&&<p role="status">No files nominated. Nothing to review.</p>}
      <ul>{review.selection.files.map((f,i)=>review.ids.includes(f.id)&&<li key={f.id}>
        <b>{String(i+1).padStart(2,'0')} · {f.name}</b><span className="desk-path" dir="ltr">{f.path}</span><small>{formatBytes(f.size)}</small>
        {results[f.id]&&<span role="status">{sample&&results[f.id]==='trashed'?'Sample moved to virtual Trash. No real files changed.':resultText[results[f.id]]}</span>}
        {sampleId===f.id?<div role="group" aria-label={'Sample confirmation: '+f.path}>
          <p>Move this sample to virtual Trash?</p><button autoFocus className="btn-secondary" onClick={()=>{setSampleId('');setResults(r=>({...r,[f.id]:'cancelled'}));}}>Keep sample</button>{' '}
          <button className="btn-secondary" onClick={()=>{setSampleId('');setResults(r=>({...r,[f.id]:'trashed'}));}}>Move sample to virtual Trash</button>
        </div>:<button className="btn-secondary" disabled={busy||!!sampleId||['trashed','changed','expired','failed'].includes(results[f.id])}
          onClick={()=>inspect(f.id)}>{sample?'Review sample…':'Review in macOS…'}</button>}
      </li>)}</ul>
    </>}
    {error&&<p role="alert">{error}</p>}
    <button className="btn-secondary" disabled={busy} onClick={()=>{if(!sample&&mac)forgetReal();exit();}}>{review?'Finish & forget selection':'Back to menu'}</button>
  </main>;
}
